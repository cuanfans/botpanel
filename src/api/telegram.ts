import { Hono } from 'hono'
import { atomicPurchase } from '../db/queries'
import { calculateFinalPrice } from '../utils/pricing'
import { NokosService } from '../services/nokos'

export const telegramRouter = new Hono<{ Bindings: { DB: D1Database } }>()

// Helper untuk mengirim pesan Telegram dengan opsi Inline Keyboard
async function sendTelegramMessage(botToken: string, chatId: string | number, text: string, replyMarkup?: any, messageIdToEdit?: number) {
    const url = messageIdToEdit 
        ? `https://api.telegram.org/bot${botToken}/editMessageText`
        : `https://api.telegram.org/bot${botToken}/sendMessage`
        
    const payload: any = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
    }
    
    if (messageIdToEdit) payload.message_id = messageIdToEdit
    if (replyMarkup) payload.reply_markup = replyMarkup

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
}

// Endpoint Webhook Telegram
telegramRouter.post('/webhook', async (c) => {
    const body = await c.req.json()
    
    // Ambil konfigurasi esensial dari D1
    const configsRaw = await c.env.DB.prepare(
        "SELECT config_key, config_value FROM panel_configs"
    ).all<{config_key: string, config_value: string}>()

    const configs = configsRaw.results?.reduce((acc, curr) => {
        acc[curr.config_key] = curr.config_value
        return acc
    }, {} as Record<string, string>) || {}

    const botToken = configs['bot_token']
    const nokosApiKey = configs['nokos_api_key']
    const exchangeRate = Number(configs['nokos_exchange_rate'] || 17900) // Kurs Patokan
    
    if (!botToken || !nokosApiKey) return c.text('OK')

    // ==========================================
    // A. PENANGANAN KLIK TOMBOL (CALLBACK QUERY)
    // ==========================================
    if (body.callback_query) {
        const cb = body.callback_query
        const chatId = cb.message.chat.id
        const messageId = cb.message.message_id
        const data = cb.data

        if (data === 'menu_deposit') {
            const textDeposit = `🧮 <b>PILIH NOMINAL DEPOSIT</b>\n\nSilakan pilih nominal deposit instan di bawah ini, atau gunakan Nominal Kustom:`
            const keyboardDeposit = {
                inline_keyboard: [
                    [
                        { text: "Rp 1.000", callback_data: "depo_1000" },
                        { text: "Rp 5.000", callback_data: "depo_5000" }
                    ],
                    [
                        { text: "Rp 10.000", callback_data: "depo_10000" },
                        { text: "Rp 25.000", callback_data: "depo_25000" }
                    ],
                    [
                        { text: "Rp 50.000", callback_data: "depo_50000" },
                        { text: "Rp 100.000", callback_data: "depo_100000" }
                    ],
                    [
                        { text: "🏷 Nominal Kustom", callback_data: "depo_custom" }
                    ],
                    [
                        { text: "🔙 Kembali", callback_data: "cmd_start" }
                    ]
                ]
            }
            await sendTelegramMessage(botToken, chatId, textDeposit, keyboardDeposit, messageId)
        }
        else if (data === 'menu_order') {
            const textOrder = `📚 <b>PILIH LAYANAN OTP</b>\n\nSilakan pilih layanan yang ingin Anda beli:`
            const keyboardOrder = {
                inline_keyboard: [
                    [
                        { text: "WhatsApp", callback_data: "cek_wa" },
                        { text: "Telegram", callback_data: "cek_tg" }
                    ],
                    [
                        { text: "Shopee", callback_data: "cek_shopee" },
                        { text: "TikTok", callback_data: "cek_tiktok" }
                    ],
                    [
                        { text: "🔙 Kembali", callback_data: "cmd_start" }
                    ]
                ]
            }
            await sendTelegramMessage(botToken, chatId, textOrder, keyboardOrder, messageId)
        }

        // Informasikan ke Telegram bahwa callback sudah diproses
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: cb.id })
        })
        return c.text('OK')
    }

    // ==========================================
    // B. PENANGANAN PESAN TEKS (COMMAND)
    // ==========================================
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

    // 2. Command Menu Utama (/start)
    if (text === '/start' || text === 'cmd_start') {
        const userRecord = await c.env.DB.prepare("SELECT balance FROM telegram_users WHERE telegram_id = ?").bind(chatId).first<{balance: number}>()
        const balance = userRecord?.balance || 0
        const statsRecord = await c.env.DB.prepare("SELECT COUNT(*) as total FROM telegram_users").first<{total: number}>()
        
        const now = new Date()
        const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
        const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

        const startText = `🤖 <b>BotPanel PRO</b>\n${dateStr} pukul ${timeStr} WIB\n\n` +
                          `<b>User Info :</b>\n` +
                          `┣ <b>ID :</b> <code>${chatId}</code>\n` +
                          `┗ <b>Username :</b> @${username}\n\n` +
                          `<b>Balance Info :</b>\n` +
                          `┗ <b>Balance :</b> Rp ${balance.toLocaleString('id-ID')}\n\n` +
                          `<b>Bot Stats :</b>\n` +
                          `┗ <b>Total User :</b> ${statsRecord?.total || 1}`

        const startKeyboard = {
            inline_keyboard: [
                [
                    { text: "🛒 Order OTP", callback_data: "menu_order" },
                    { text: "💳 Deposit", callback_data: "menu_deposit" }
                ],
                [
                    { text: "🎧 Contact CS", url: "https://t.me/CSAnda" }
                ]
            ]
        }
        await sendTelegramMessage(botToken, chatId, startText, startKeyboard)
        return c.text('OK')
    }

    // 3. Command Transaksi Lanjutan (/beli wa 6)
    if (text.startsWith('/beli')) {
        const parts = text.split(' ')
        if (parts.length < 3) {
            await sendTelegramMessage(botToken, chatId, "Format salah. Gunakan: <code>/beli [layanan] [negara]</code>\nContoh: <code>/beli wa 6</code>")
            return c.text('OK')
        }

        const serviceCode = parts[1].toLowerCase()
        const countryCode = parts[2]
        
        try {
            // A. Cek Harga Asli dari Provider
            const nokos = new NokosService(nokosApiKey)
            const providerData = await nokos.getPrices(serviceCode, countryCode, 's2')
            
            // Format fallback JSON mentah API Nokos
            const pricesObj = providerData[countryCode] || providerData
            const serviceData = pricesObj[serviceCode]

            if (!serviceData || (serviceData.count !== undefined && serviceData.count <= 0)) {
                await sendTelegramMessage(botToken, chatId, "❌ Layanan atau negara tidak tersedia/kosong stoknya.")
                return c.text('OK')
            }
            
            // B. Konversi Harga (Raw USD/Asing -> IDR)
            const rawCost = Number(serviceData.cost ?? serviceData.price ?? 0)
            const costIDR = rawCost * exchangeRate // Perbaikan Kritis: Dikalikan 17.900
            
            // C. Kalkulasi Final Price menggunakan helper Anda (Pastikan me-return harga IDR)
            const { finalPrice, markupApplied } = await calculateFinalPrice(c.env.DB, costIDR, serviceCode, countryCode)

            // D. Buat Transaction ID
            const trxId = `TRX-${Date.now()}`

            // E. EKSEKUSI POTONG SALDO ATOMIK
            await atomicPurchase(c.env.DB, chatId, finalPrice, serviceCode, countryCode, trxId)
            
            await sendTelegramMessage(botToken, chatId, `⏳ Memproses pesanan...\nLayanan: <b>${serviceCode.toUpperCase()}</b>\nSaldo dipotong: Rp ${finalPrice.toLocaleString('id-ID')}`)

            // F. Tembak API Beli Nomor Nokos
            const order = await nokos.getNumber(serviceCode, countryCode, 's2')

            // G. Update Database Transaksi menjadi sukses
            await c.env.DB.prepare(`
                UPDATE transactions 
                SET status = 'success', nokos_activation_id = ?, phone_number = ?, provider_cost = ?, markup_applied = ?, updated_at = CURRENT_TIMESTAMP
                WHERE transaction_id = ?
            `).bind(order.activation_id, order.phone, costIDR, markupApplied, trxId).run()

            await sendTelegramMessage(botToken, chatId, `✅ <b>SUKSES!</b>\n\n📱 Nomor Anda: <code>${order.phone}</code>\n🔖 ID Aktivasi: ${order.activation_id}\n\n<i>Silakan kirim kode OTP di aplikasi target, lalu ketik <code>/otp ${order.activation_id}</code> untuk mengecek SMS yang masuk.</i>`)

        } catch (error: any) {
            // H. Jika gagal setelah saldo dipotong, REFUND ATOMIK
            if (error.message !== "Saldo tidak mencukupi atau transaksi gagal") {
                await c.env.DB.prepare(`
                    UPDATE telegram_users SET balance = balance + (
                        SELECT final_price FROM transactions WHERE transaction_id = ?
                    ) WHERE telegram_id = ?
                `).bind(trxId, chatId).run() // Menggunakan parameter trxId agar akurat
                
                await c.env.DB.prepare(`
                    UPDATE transactions SET status = 'failed' WHERE transaction_id = ?
                `).bind(trxId).run()
            }
            await sendTelegramMessage(botToken, chatId, `❌ <b>GAGAL:</b> ${error.message}`)
        }
        
        return c.text('OK')
    }

    return c.text('OK')
})
