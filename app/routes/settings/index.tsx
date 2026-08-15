import { createRoute } from 'honox/factory'
import { Sidebar } from '../../components/Sidebar'

export const POST = createRoute(async (c) => {
    const db = c.env.DB as D1Database
    const body = await c.req.parseBody()

    for (const [key, value] of Object.entries(body)) {
        if (typeof value === 'string') {
            await db.prepare(
                "UPDATE panel_configs SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE config_key = ?"
            ).bind(value, key).run()
        }
    }
    
    return c.redirect('/settings?success=1')
})

export default createRoute(async (c) => {
    const db = c.env.DB as D1Database
    const success = c.req.query('success')
    
    const configsRaw = await db.prepare("SELECT config_key, config_value, description FROM panel_configs").all<{config_key: string, config_value: string, description: string}>()
    
    const configs = configsRaw.results?.reduce((acc, curr) => {
        acc[curr.config_key] = { value: curr.config_value, desc: curr.description }
        return acc
    }, {} as Record<string, {value: string, desc: string}>) || {}

    return c.render(
        <div class="flex h-screen bg-gray-100 font-sans overflow-hidden">
            <Sidebar activePath="/settings" />
            
            <main class="flex-1 p-10 overflow-y-auto">
                <h1 class="text-3xl font-extrabold text-gray-800 mb-2">Pengaturan Sistem</h1>
                <p class="text-gray-500 mb-8">Kelola token bot, API Key pembayaran, dan koneksi provider.</p>
                
                {success && (
                    <div class="mb-6 p-4 bg-green-100 border-l-4 border-green-500 text-green-800 rounded">
                        <p class="font-bold">Berhasil!</p>
                        <p>Pengaturan sistem berhasil disimpan.</p>
                    </div>
                )}

                <form method="POST" class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">Telegram Bot Token</label>
                        <p class="text-xs text-gray-500 mb-2">{configs['bot_token']?.desc}</p>
                        <input type="text" name="bot_token" value={configs['bot_token']?.value || ''} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1d8eed] outline-none" required />
                    </div>

                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">Command Bot (JSON)</label>
                        <p class="text-xs text-gray-500 mb-2">{configs['bot_commands']?.desc}</p>
                        <textarea name="bot_commands" rows={3} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1d8eed] outline-none font-mono text-sm" required>{configs['bot_commands']?.value || ''}</textarea>
                    </div>

                    <hr class="border-gray-200" />

                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">Nokos API Key (Provider)</label>
                        <p class="text-xs text-gray-500 mb-2">{configs['nokos_api_key']?.desc}</p>
                        <input type="text" name="nokos_api_key" value={configs['nokos_api_key']?.value || ''} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1d8eed] outline-none" required />
                    </div>

                    <hr class="border-gray-200" />

                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">Gopay API Key (QRIS Secret)</label>
                        <p class="text-xs text-gray-500 mb-2">{configs['qris_api_key']?.desc}</p>
                        <input type="text" name="qris_api_key" value={configs['qris_api_key']?.value || ''} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1d8eed] outline-none" required />
                    </div>

                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">QRIS Global Webhook</label>
                        <p class="text-xs text-gray-500 mb-2">{configs['qris_global_webhook']?.desc}</p>
                        <input type="url" name="qris_global_webhook" value={configs['qris_global_webhook']?.value || ''} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1d8eed] outline-none" />
                    </div>

                    <div class="pt-4">
                        <button type="submit" class="bg-[#0d5fa3] hover:bg-[#1d8eed] text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-transform hover:-translate-y-1">
                            Simpan Pengaturan
                        </button>
                    </div>
                </form>
            </main>
        </div>
    )
})
