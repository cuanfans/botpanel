import { createRoute } from 'honox/factory'
import { Sidebar } from '../../components/Sidebar'
import { NokosService } from '../../../src/services/nokos'

export default createRoute(async (c) => {
    const db = c.env.DB as D1Database
    
    // Ambil query parameter dari URL (Default: Negara 6 / Indonesia, Server s2)
    const currentCountry = c.req.query('country') || '6'
    const currentServer = c.req.query('server') || 's2'

    let error = ''
    let productList: { code: string, name: string, cost: number, stock: number, markup: number, finalPrice: number }[] = []

    try {
        // 1. Ambil Konfigurasi dari Database
        const configsRaw = await db.prepare("SELECT config_key, config_value FROM panel_configs").all<{config_key: string, config_value: string}>()
        const configs = configsRaw.results?.reduce((acc, curr) => {
            acc[curr.config_key] = curr.config_value
            return acc
        }, {} as Record<string, string>) || {}

        const apiKey = configs['nokos_api_key']
        const markupPercent = Number(configs['markup_global_percent'] || 10)
        const markupFlat = Number(configs['markup_global_flat'] || 500)

        // 2. Ambil Master Data dari Database Lokal (yang sudah kita sinkronisasi sebelumnya)
        const countriesDb = await db.prepare("SELECT id, name, prefix FROM nokos_countries ORDER BY name ASC").all<{id: number, name: string, prefix: string}>()
        const servicesDb = await db.prepare("SELECT code, name FROM nokos_services").all<{code: string, name: string}>()
        
        // Buat map (kamus) untuk mencari nama layanan dengan cepat berdasarkan kodenya
        const serviceMap = new Map<string, string>()
        servicesDb.results?.forEach(s => serviceMap.set(s.code, s.name))

        // 3. Tarik Harga dan Stok REAL-TIME dari API Nokos (hanya untuk negara yang dipilih)
        if (apiKey) {
            const nokos = new NokosService(apiKey)
            const rawPrices = await nokos.getPrices(currentServer, '', currentCountry)
            
            // Raw data Nokos biasanya dibungkus dengan ID Negara, contoh: { "6": { "wa": {cost: 0.1, count: 100} } }
            // Namun kita siapkan fallback jika struktur berubah
            const pricesData = rawPrices[currentCountry] || rawPrices

            // 4. Kalkulasi Harga dan Gabungkan dengan Nama Database
            if (typeof pricesData === 'object' && pricesData !== null) {
                for (const [code, data] of Object.entries(pricesData as any)) {
                    if (data && (data.cost !== undefined || data.price !== undefined)) {
                        const providerCost = Number(data.cost ?? data.price ?? 0)
                        const stock = Number(data.count ?? data.stock ?? 0)
                        
                        // Melewati layanan yang stoknya kosong
                        if (stock <= 0) continue;

                        // Kalkulasi Harga Jual (Markup)
                        // Rumus: (Harga Provider * Persen Markup) + Flat Markup
                        const calculatedMarkup = (providerCost * (markupPercent / 100)) + markupFlat
                        const finalPrice = providerCost + calculatedMarkup

                        productList.push({
                            code: code,
                            name: serviceMap.get(code) || code.toUpperCase(), // Ambil nama dari DB, jika tak ada pakai kode
                            cost: providerCost,
                            stock: stock,
                            markup: calculatedMarkup,
                            finalPrice: finalPrice
                        })
                    }
                }
            }

            // Urutkan produk berdasarkan abjad nama layanan
            productList.sort((a, b) => a.name.localeCompare(b.name))

        } else {
            error = "API Key Nokos belum diatur. Silakan atur di menu Pengaturan."
        }

        return c.render(
            <div class="flex flex-col md:flex-row h-screen bg-gray-50 font-sans overflow-hidden">
                <Sidebar activePath="/products" />
                
                <main class="flex-1 flex flex-col h-screen overflow-hidden w-full">
                    {/* Bagian Header & Filter (Tetap/Sticky) */}
                    <div class="p-6 md:px-10 md:pt-10 md:pb-6 bg-white border-b border-gray-200 z-10">
                        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                            <div>
                                <h1 class="text-2xl md:text-3xl font-extrabold text-gray-800">Katalog Produk</h1>
                                <p class="text-sm md:text-base text-gray-500 mt-1">Pantau harga modal, stok real-time, dan estimasi harga jual bot.</p>
                            </div>
                            
                            {/* Form Filter Negara & Server */}
                            <form method="GET" class="flex flex-col sm:flex-row gap-3">
                                <select name="country" class="px-4 py-2 bg-gray-50 border border-gray-300 rounded-xl outline-none text-sm md:text-base focus:ring-2 focus:ring-blue-500">
                                    {countriesDb.results?.map(cty => (
                                        <option value={cty.id.toString()} selected={cty.id.toString() === currentCountry}>
                                            {cty.name} {cty.prefix ? `(${cty.prefix})` : ''}
                                        </option>
                                    ))}
                                </select>
                                
                                <select name="server" class="px-4 py-2 bg-gray-50 border border-gray-300 rounded-xl outline-none text-sm md:text-base focus:ring-2 focus:ring-blue-500">
                                    <option value="s2" selected={currentServer === 's2'}>Server Plus (s2)</option>
                                    <option value="s1" selected={currentServer === 's1'}>Server Express (s1)</option>
                                </select>

                                <button type="submit" class="bg-[#0d5fa3] hover:bg-[#1d8eed] text-white font-bold py-2 px-6 rounded-xl shadow-md transition-colors">
                                    Cek Harga
                                </button>
                            </form>
                        </div>

                        {error && (
                            <div class="p-4 bg-red-100 border-l-4 border-red-500 text-red-800 rounded mb-2">
                                <p class="font-bold">Gagal memuat data!</p>
                                <p>{error}</p>
                            </div>
                        )}

                        <div class="flex items-center gap-4 text-sm text-gray-600 bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <p>Menampilkan <b>{productList.length} layanan</b> yang sedang <b>tersedia (in-stock)</b> untuk negara ini. Aturan markup saat ini: <b>{markupPercent}% + Rp {markupFlat}</b>.</p>
                        </div>
                    </div>

                    {/* Bagian Tabel Data (Bisa di-scroll) */}
                    <div class="flex-1 overflow-auto p-6 md:px-10 bg-gray-50">
                        {productList.length > 0 ? (
                            <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                                <div class="overflow-x-auto">
                                    <table class="w-full text-left border-collapse">
                                        <thead>
                                            <tr class="bg-gray-100 text-gray-700 text-sm uppercase tracking-wider border-b border-gray-200">
                                                <th class="p-4 font-bold">Layanan</th>
                                                <th class="p-4 font-bold text-center">Kode</th>
                                                <th class="p-4 font-bold text-right">Modal (Nokos)</th>
                                                <th class="p-4 font-bold text-center">Stok</th>
                                                <th class="p-4 font-bold text-right text-green-700">Harga Jual (Est)</th>
                                            </tr>
                                        </thead>
                                        <tbody class="text-sm md:text-base text-gray-800 divide-y divide-gray-100">
                                            {productList.map((product) => (
                                                <tr class="hover:bg-blue-50 transition-colors">
                                                    <td class="p-4 font-semibold">{product.name}</td>
                                                    <td class="p-4 text-center">
                                                        <span class="bg-gray-200 text-gray-700 py-1 px-2 rounded font-mono text-xs">{product.code}</span>
                                                    </td>
                                                    <td class="p-4 text-right text-gray-500">
                                                        Rp {product.cost.toLocaleString('id-ID')}
                                                    </td>
                                                    <td class="p-4 text-center">
                                                        {product.stock > 1000 ? (
                                                            <span class="bg-green-100 text-green-800 py-1 px-2 rounded-full text-xs font-bold">1000+</span>
                                                        ) : (
                                                            <span class="bg-orange-100 text-orange-800 py-1 px-2 rounded-full text-xs font-bold">{product.stock}</span>
                                                        )}
                                                    </td>
                                                    <td class="p-4 text-right font-bold text-[#0d5fa3]">
                                                        Rp {Math.ceil(product.finalPrice).toLocaleString('id-ID')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            !error && (
                                <div class="text-center py-20">
                                    <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-200 mb-4">
                                        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
                                    </div>
                                    <h2 class="text-lg font-bold text-gray-700">Stok Kosong / Tidak Tersedia</h2>
                                    <p class="text-gray-500 mt-1">Saat ini tidak ada nomor yang tersedia untuk negara dan server ini di API Nokos.</p>
                                </div>
                            )
                        )}
                    </div>
                </main>
            </div>
        )
    } catch (e: any) {
        return c.text(`Terjadi Kesalahan Sistem: ${e.message}`, 500)
    }
})
