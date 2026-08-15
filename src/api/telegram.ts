import { Hono } from 'hono'
import { atomicPurchase } from '../db/queries'
import { calculateFinalPrice } from '../utils/pricing'
import { NokosService } from '../services/nokos'

export const telegramRouter = new Hono<{ Bindings: { DB: D1Database } }>()

// Helper untuk mengirim pesan Telegram
async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text })
    })
}

// Endpoint Webhook Telegram
telegramRouter.post('/webhook', async (c) => {
    const body = await c.req.json()
    
    // Ambil token bot & API key Nokos dari D1
    const configs = await c.env.DB.prepare(
        "SELECT config_key, config_value FROM panel_configs WHERE config_key IN ('bot_token', 'bot_commands', 'nokos_api_key')"
    ).all<{config_key: string, config_value: string}>()

    const botToken = configs.results?.find(c => c.config_key === 'bot_token')?.config_value
    const nokosApiKey = configs.results?.find(c => c.config_key === 'nokos_api_key')?.config_value
    const botCommandsRaw = configs.results?.find(c => c.config_key === 'bot_commands')?.config_value

    if (!botToken || !nokosApiKey) return c.text('OK') // Hindari retry dari Telegram jika belum disetting

    const message = body.message
    if (!message || !message.text) return c.text('OK')

    const chatId = message.chat.id.toString()
    const username = message.from.username || 'User'
    const text = message.text.trim()

    // 1. Daftarkan / Update User di Database
    await c.env.DB.prepare(`
        INSERT INTO telegram_users (telegram_id, username, balance) 
        VALUES (?, ?, 0) 
        ON CONFLICT(telegram_id) DO UPDATE SET username = ?, updated_at = CURRENT_TIMESTAMP
    `).bind(chatId, username, username).run()

    // 2. Parsing Command Sederhana (Contoh: /beli wa 6)
    if (text.startsWith('/beli')) {
        const parts = text.split(' ')
        if (parts.length < 3) {
            await sendTelegramMessage(botToken, chatId, "Format salah. Gunakan: /beli [layanan] [negara] (contoh: /beli wa 6)")
            return c.text('OK')
        }

        const serviceCode = parts[1] // misal 'wa'
        const countryCode = parts[2] // misal '6'
        
        try {
            // A. Cek Harga Asli dari Provider (Server Plus/s2 default)
            const nokos = new NokosService(nokosApiKey)
            const providerData = await nokos.getPrices(serviceCode, countryCode, 's2')
            
            // Format response Nokos: { "6": { "wa": { "cost": 250, "count": 1284 } } }
            if (!providerData[countryCode] || !providerData[countryCode][serviceCode]) {
                await sendTelegramMessage(botToken, chatId, "Layanan atau negara tidak tersedia/kosong stoknya.")
                return c.text('OK')
            }
            
            const providerCost = providerData[countryCode][serviceCode].cost
            
            // B. Kalkulasi Final Price (Harga Markup Atomik override)
            const { finalPrice, markupApplied } = await calculateFinalPrice(c.env.DB, providerCost, serviceCode, countryCode)

            // C. Buat Transaction ID
            const trxId = `TRX-${Date.now()}`

            // D. EKSEKUSI POTONG SALDO ATOMIK (Mencegah Race Condition / Bypass Saldo)
            // Function ini melempar error jika saldo < finalPrice
            await atomicPurchase(c.env.DB, chatId, finalPrice, serviceCode, countryCode, trxId)
            
            await sendTelegramMessage(botToken, chatId, `Memproses pesanan... Saldo dipotong Rp ${finalPrice}. (Harga Provider: Rp ${providerCost})`)

            // E. Tembak API Beli Nomor Nokos
            const order = await nokos.getNumber(serviceCode, countryCode, 's2')

            // F. Update Database Transaksi menjadi sukses
            await c.env.DB.prepare(`
                UPDATE transactions 
                SET status = 'success', nokos_activation_id = ?, phone_number = ?, provider_cost = ?, markup_applied = ?, updated_at = CURRENT_TIMESTAMP
                WHERE transaction_id = ?
            `).bind(order.activation_id, order.phone, order.price, markupApplied, trxId).run()

            await sendTelegramMessage(botToken, chatId, `✅ SUKSES!\nNomor Anda: ${order.phone}\nID Aktivasi: ${order.activation_id}\nSilahkan request OTP.`)

        } catch (error: any) {
            // G. Jika gagal setelah saldo dipotong, REFUND ATOMIK
            if (error.message !== "Saldo tidak mencukupi atau transaksi gagal") {
                await c.env.DB.prepare(`
                    UPDATE telegram_users SET balance = balance + (
                        SELECT final_price FROM transactions WHERE telegram_id = ? ORDER BY id DESC LIMIT 1
                    ) WHERE telegram_id = ?
                `).bind(chatId, chatId).run()
                
                await c.env.DB.prepare(`
                    UPDATE transactions SET status = 'failed' WHERE telegram_id = ? AND status = 'processing'
                `).bind(chatId).run()
            }
            await sendTelegramMessage(botToken, chatId, `❌ GAGAL: ${error.message}`)
        }
        
        return c.text('OK')
    }

    // 3. Fallback Command (Dinikmati dari Config Panel)
    if (botCommandsRaw) {
        try {
            const commands = JSON.parse(botCommandsRaw)
            if (commands[text]) {
                await sendTelegramMessage(botToken, chatId, commands[text])
            }
        } catch (e) {
            // Ignore parse error
        }
    }

    return c.text('OK')
})
