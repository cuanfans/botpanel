import { createRoute } from 'honox/factory'
import { Sidebar } from '../../components/Sidebar'
import { hashPassword } from '../../../src/utils/security'

export const POST = createRoute(async (c) => {
    const db = c.env.DB as D1Database
    const body = await c.req.parseBody()
    const action = body['action'] as string

    // 1. Logika Ganti Password
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

    // 2. Logika Update Konfigurasi Sistem
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

    return c.render(
        <div class="flex flex-col md:flex-row h-screen bg-gray-100 font-sans overflow-hidden">
            <Sidebar activePath="/settings" />
            
            <main class="flex-1 p-4 md:p-10 overflow-y-auto w-full">
                <h1 class="text-2xl md:text-3xl font-extrabold text-gray-800 mb-2">Pengaturan Sistem</h1>
                <p class="text-sm md:text-base text-gray-500 mb-8">Kelola token bot, API Key pembayaran, dan ganti password admin.</p>
                
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

                <div class="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {/* Form Konfigurasi Sistem */}
                    <form method="POST" class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8 space-y-6">
                        <input type="hidden" name="action" value="update_configs" />
                        <h2 class="text-xl font-bold text-gray-800 border-b pb-2 mb-4">Integrasi API</h2>
                        
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Telegram Bot Token</label>
                            <p class="text-xs text-gray-500 mb-2">{configs['bot_token']?.desc}</p>
                            <input type="text" name="bot_token" value={configs['bot_token']?.value || ''} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1d8eed] outline-none text-sm md:text-base" required />
                        </div>

                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Command Bot (JSON)</label>
                            <p class="text-xs text-gray-500 mb-2">{configs['bot_commands']?.desc}</p>
                            <textarea name="bot_commands" rows={3} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1d8eed] outline-none font-mono text-xs md:text-sm" required>{configs['bot_commands']?.value || ''}</textarea>
                        </div>

                        <hr class="border-gray-200" />

                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Nokos API Key (Provider)</label>
                            <p class="text-xs text-gray-500 mb-2">{configs['nokos_api_key']?.desc}</p>
                            <input type="text" name="nokos_api_key" value={configs['nokos_api_key']?.value || ''} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1d8eed] outline-none text-sm md:text-base" required />
                        </div>

                        <hr class="border-gray-200" />

                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Gopay API Key (QRIS Secret)</label>
                            <p class="text-xs text-gray-500 mb-2">{configs['qris_api_key']?.desc}</p>
                            <input type="text" name="qris_api_key" value={configs['qris_api_key']?.value || ''} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1d8eed] outline-none text-sm md:text-base" required />
                        </div>

                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">QRIS Global Webhook</label>
                            <p class="text-xs text-gray-500 mb-2">{configs['qris_global_webhook']?.desc}</p>
                            <input type="url" name="qris_global_webhook" value={configs['qris_global_webhook']?.value || ''} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1d8eed] outline-none text-sm md:text-base" />
                        </div>

                        <div class="pt-4">
                            <button type="submit" class="w-full md:w-auto bg-[#0d5fa3] hover:bg-[#1d8eed] text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-transform hover:-translate-y-1">
                                Simpan Pengaturan
                            </button>
                        </div>
                    </form>

                    {/* Form Ganti Password */}
                    <form method="POST" class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8 space-y-6 self-start">
                        <input type="hidden" name="action" value="change_password" />
                        <h2 class="text-xl font-bold text-gray-800 border-b pb-2 mb-4">Ganti Password Admin</h2>
                        
                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Password Lama</label>
                            <input type="password" name="old_password" placeholder="Masukkan password saat ini" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1d8eed] outline-none text-sm md:text-base" required />
                        </div>

                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Password Baru</label>
                            <input type="password" name="new_password" placeholder="Masukkan password baru" minLength={6} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1d8eed] outline-none text-sm md:text-base" required />
                        </div>

                        <div>
                            <label class="block text-sm font-bold text-gray-700 mb-1">Konfirmasi Password Baru</label>
                            <input type="password" name="confirm_password" placeholder="Ulangi password baru" minLength={6} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1d8eed] outline-none text-sm md:text-base" required />
                        </div>

                        <div class="pt-4">
                            <button type="submit" class="w-full md:w-auto bg-gray-800 hover:bg-gray-900 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-transform hover:-translate-y-1">
                                Ubah Password
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    )
})
