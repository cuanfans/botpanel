import { createRoute } from 'honox/factory'
import { Sidebar } from '../../components/Sidebar'
import { hashPassword } from '../../../src/utils/security'
import { NokosService } from '../../../src/services/nokos'

export const POST = createRoute(async (c) => {
    const db = c.env.DB as D1Database
    const body = await c.req.parseBody()
    const action = body['action'] as string

    if (action === 'change_password') {
        const old_password = body['old_password'] as string
        const new_password = body['new_password'] as string
        const confirm_password = body['confirm_password'] as string

        if (new_password !== confirm_password) {
            return c.redirect('/settings?error=Konfirmasi+password+baru+tidak+cocok')
        }

        const hashedOld = await hashPassword(old_password)
        const jwtPayload = c.get('jwtPayload')
        const adminId = jwtPayload?.sub || 1

        const user = await db.prepare("SELECT id FROM admin_users WHERE id = ? AND password_hash = ?").bind(adminId, hashedOld).first()

        if (!user) {
            return c.redirect('/settings?error=Password+lama+salah')
        }

        const hashedNew = await hashPassword(new_password)
        await db.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?").bind(hashedNew, adminId).run()

        return c.redirect('/settings?success=Password+admin+berhasil+diubah')
    }

    if (action === 'update_configs') {
        for (const [key, value] of Object.entries(body)) {
            if (key !== 'action' && typeof value === 'string') {
                await db.prepare(
                    "UPDATE panel_configs SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE config_key = ?"
                ).bind(value, key).run()
            }
        }
        return c.redirect('/settings?success=Pengaturan+sistem+berhasil+disimpan')
    }

    // SINKRONISASI TOTAL & AMAN (VERSI FIX RAW DATA)
    if (action === 'sync_nokos') {
        try {
            const config = await db.prepare("SELECT config_value FROM panel_configs WHERE config_key = 'nokos_api_key'").first<{config_value: string}>();
            if(!config || !config.config_value) {
                return c.redirect('/settings?error=API+Key+Nokos+Belum+Disimpan');
            }

            const nokos = new NokosService(config.config_value);
            
            // 1. Tarik semua data
            const services = await nokos.getServices();
            const countries = await nokos.getCountries();
            const prices = await nokos.getPrices('s2');

            // 2. Kosongkan data lama (dari anak ke induk)
            await db.prepare("DELETE FROM nokos_prices").run();
            await db.prepare("DELETE FROM nokos_services").run();
            await db.prepare("DELETE FROM nokos_countries").run();

            // 3. Masukkan Data Negara
            let countryCount = 0;
            const countryStatements = [];
            const validCountries = new Set<number>();
            for (const cty of countries) {
                if (!isNaN(cty.id) && cty.name) {
                    countryStatements.push(
                        db.prepare("INSERT INTO nokos_countries (id, name, prefix) VALUES (?, ?, ?)")
                          .bind(Number(cty.id), String(cty.name), String(cty.prefix || ''))
                    );
                    validCountries.add(Number(cty.id));
                    countryCount++;
                }
            }
            if (countryStatements.length > 0) await db.batch(countryStatements);

            // 4. Masukkan Data Layanan
            let serviceCount = 0;
            const serviceStatements = [];
            const validServices = new Set<string>();
            for (const srv of services) {
                if (srv.code && srv.name) {
                    serviceStatements.push(
                        db.prepare("INSERT INTO nokos_services (code, name) VALUES (?, ?)")
                          .bind(String(srv.code), String(srv.name))
                    );
                    validServices.add(String(srv.code));
                    serviceCount++;
                }
            }
            if (serviceStatements.length > 0) await db.batch(serviceStatements);

            // 5. Masukkan Data Harga dan Stok (Membaca format {"6": {"wa": {"cost": 0.09, "count": 100}}})
            let priceCount = 0;
            const priceStatements = [];
            
            if (typeof prices === 'object' && prices !== null) {
                for (const [countryIdStr, servicesObj] of Object.entries(prices)) {
                    const cid = Number(countryIdStr);
                    // Cegah error Foreign Key jika ID Negara tidak dikenali
                    if (!validCountries.has(cid)) continue; 

                    if (typeof servicesObj === 'object' && servicesObj !== null) {
                        for (const [serviceCode, data] of Object.entries(servicesObj as any)) {
                            // Cegah error Foreign Key jika Kode Layanan tidak dikenali
                            if (!validServices.has(serviceCode)) continue; 
                            
                            if (data && data.cost !== undefined) {
                                const cost = Number(data.cost);
                                const count = Number(data.count || 0);
                                
                                priceStatements.push(
                                    db.prepare("INSERT INTO nokos_prices (country_id, service_code, server, price, stock) VALUES (?, ?, ?, ?, ?)")
                                      .bind(cid, String(serviceCode), 's2', cost, count)
                                );
                                priceCount++;
                            }
                        }
                    }
                }
            }

            // Eksekusi insert Harga (chunk 100 batch/transaksi agar D1 Cloudflare stabil)
            const chunkSize = 100;
            for (let i = 0; i < priceStatements.length; i += chunkSize) {
                const chunk = priceStatements.slice(i, i + chunkSize);
                await db.batch(chunk);
            }

            return c.redirect(`/settings?success=Sinkronisasi+Sukses!+(${serviceCount}+Layanan,+${countryCount}+Negara,+${priceCount}+Data+Harga)`);
        } catch (error: any) {
            return c.redirect(`/settings?error=Gagal+Sinkronisasi:+${encodeURIComponent(error.message)}`);
        }
    }

    return c.redirect('/settings')
})

export default createRoute(async (c) => {
    const db = c.env.DB as D1Database
    const success = c.req.query('success')
    const error = c.req.query('error')
    
    const configsRaw = await db.prepare("SELECT config_key, config_value, description FROM panel_configs").all<{config_key: string, config_value: string, description: string}>()
    
    const configs = configsRaw.results?.reduce((acc, curr) => {
        acc[curr.config_key] = { value: curr.config_value, desc: curr.description }
        return acc
    }, {} as Record<string, {value: string, desc: string}>) || {}

    const totalServices = await db.prepare("SELECT COUNT(*) as total FROM nokos_services").first<{total: number}>();
    const totalCountries = await db.prepare("SELECT COUNT(*) as total FROM nokos_countries").first<{total: number}>();
    const totalPrices = await db.prepare("SELECT COUNT(*) as total FROM nokos_prices").first<{total: number}>();

    return c.render(
        <div class="flex flex-col md:flex-row h-screen bg-gray-100 font-sans overflow-hidden">
            <Sidebar activePath="/settings" />
            
            <main class="flex-1 p-4 md:p-10 overflow-y-auto w-full">
                <h1 class="text-2xl md:text-3xl font-extrabold text-gray-800 mb-2">Pengaturan Sistem</h1>
                <p class="text-sm md:text-base text-gray-500 mb-8">Kelola token bot, API Key pembayaran, dan sinkronisasi.</p>
                
                {success && (
                    <div class="mb-6 p-4 bg-green-100 border-l-4 border-green-500 text-green-800 rounded text-sm md:text-base">
                        <p class="font-bold">Berhasil!</p>
                        <p>{success}</p>
                    </div>
                )}

                {error && (
                    <div class="mb-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-800 rounded text-sm md:text-base">
                        <p class="font-bold">Gagal!</p>
                        <p>{error}</p>
                    </div>
                )}

                <div class="bg-blue-50 rounded-2xl shadow-sm border border-blue-200 p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div>
                        <h2 class="text-lg font-bold text-blue-900">Sinkronisasi Katalog Provider</h2>
                        <p class="text-sm text-blue-700 mt-1">
                            Tarik data layanan, negara, harga, dan stok terbaru dari API Nokos. <br/>
                            Saat ini tersimpan: <b>{totalServices?.total || 0} Layanan</b>, <b>{totalCountries?.total || 0} Negara</b>, dan <b>{totalPrices?.total || 0} Harga</b>.
                        </p>
                    </div>
                    <form method="POST">
                        <input type="hidden" name="action" value="sync_nokos" />
                        <button type="submit" class="w-full md:w-auto bg-[#0d5fa3] hover:bg-[#1d8eed] text-white font-bold py-2 px-6 rounded-xl shadow-md transition-transform hover:-translate-y-1">
                            Sinkronkan Sekarang
                        </button>
                    </form>
                </div>

                <div class="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    <form method="POST" class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8 space-y-6">
                        <input type="hidden" name="action" value="update_configs" />
                        <h2 class="text-xl font-bold text-gray-800 border-b pb-2 mb-4">Integrasi API</h2>
                        
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Telegram Bot Token</label>
                            <input type="text" name="bot_token" value={configs['bot_token']?.value || ''} class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none text-sm md:text-base" required />
                        </div>

                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Command Bot (JSON)</label>
                            <textarea name="bot_commands" rows={3} class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none font-mono text-xs md:text-sm" required>{configs['bot_commands']?.value || ''}</textarea>
                        </div>

                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Nokos API Key (Provider)</label>
                            <input type="text" name="nokos_api_key" value={configs['nokos_api_key']?.value || ''} class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none text-sm md:text-base" required />
                        </div>

                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Gopay API Key (QRIS Secret)</label>
                            <input type="text" name="qris_api_key" value={configs['qris_api_key']?.value || ''} class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none text-sm md:text-base" required />
                        </div>

                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">QRIS Global Webhook</label>
                            <input type="url" name="qris_global_webhook" value={configs['qris_global_webhook']?.value || ''} class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none text-sm md:text-base" />
                        </div>

                        <div>
                            <button type="submit" class="bg-[#0d5fa3] hover:bg-[#1d8eed] text-white font-bold py-3 px-8 rounded-xl shadow-lg">
                                Simpan Pengaturan
                            </button>
                        </div>
                    </form>

                    <form method="POST" class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8 space-y-6 self-start">
                        <input type="hidden" name="action" value="change_password" />
                        <h2 class="text-xl font-bold text-gray-800 border-b pb-2 mb-4">Ganti Password Admin</h2>
                        
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Password Lama</label>
                            <input type="password" name="old_password" class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none text-sm md:text-base" required />
                        </div>

                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Password Baru</label>
                            <input type="password" name="new_password" class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none text-sm md:text-base" required />
                        </div>

                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Konfirmasi Password Baru</label>
                            <input type="password" name="confirm_password" class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none text-sm md:text-base" required />
                        </div>

                        <div>
                            <button type="submit" class="bg-gray-800 hover:bg-gray-900 text-white font-bold py-3 px-8 rounded-xl shadow-lg">
                                Ubah Password
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    )
})
