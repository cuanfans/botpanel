import { Hono } from 'hono'
import { atomicPurchase } from '../db/queries'
import { calculateFinalPrice } from '../utils/pricing'
import { NokosService } from '../services/nokos'

export const telegramRouter = new Hono<{ Bindings: { DB: D1Database } }>()

// Helper kirim pesan Telegram interaktif
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

// Endpoint Utama Webhook Telegram
telegramRouter.post('/webhook', async (c) => {
    const body = await c.req.json()
    
    const configsRaw = await c.env.DB.prepare("SELECT config_key, config_value FROM panel_configs").all<{config_key: string, config_value: string}>()
    const configs = configsRaw.results?.reduce((acc, curr) => {
        acc[curr.config_key] = curr.config_value; return acc
    }, {} as Record<string, string>) || {}

    const botToken = configs['bot_token']
    if (!botToken) return c.text('OK')

    // ==========================================
    // A. PENANGANAN KLIK TOMBOL (CALLBACK QUERY)
    // ==========================================
    if (body.callback_query) {
        const cb = body.callback_query
        const chatId = cb.message.chat.id
        const messageId = cb.message.message_id
        const data = cb.data

        if (data === 'menu_start') {
            // Logika /start akan dipanggil di bawah (redirect)
            body.message = cb.message
            body.message.text = '/start'
            body.message.from = cb.from
        }
        else if (data === 'menu_deposit') {
            // UI Sesuai Gambar: deposit.png
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
                        { text: "🔙 Kembali", callback_data: "menu_start" }
                    ]
                ]
            }
            await sendTelegramMessage(botToken, chatId, textDeposit, keyboardDeposit, messageId)
        }
        else if (data.startsWith('depo_')) {
            const nominal = data.split('_')[1]
            
            if (nominal === 'custom') {
                await sendTelegramMessage(botToken, chatId, `Silakan ketik nominal deposit Anda.\nFormat: <code>/depo 15000</code>`)
            } else {
                const amount = Number(nominal)
                
                // Ubah status loading
                await sendTelegramMessage(botToken, chatId, `⏳ Sedang membuat invoice QRIS untuk <b>Rp ${amount.toLocaleString('id-ID')}</b>...`, undefined, messageId)

                // Panggil Endpoint Internal QRIS kita sendiri
                const reqProtocol = new URL(c.req.url).origin
                const qrisCall = await fetch(`${reqProtocol}/api/qris/create-invoice`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ telegram_id: String(chatId), amount: amount })
                })
                
                const qrisRes = await qrisCall.json()

                if (qrisRes.success) {
                    const successText = `✅ <b>INVOICE DIBUAT</b>\n\n` +
                                        `<b>Order ID:</b> <code>${qrisRes.order_id}</code>\n` +
                                        `<b>Nominal:</b> Rp ${qrisRes.amount.toLocaleString('id-ID')}\n\n` +
                                        `Silakan klik tombol di bawah ini untuk membayar via QRIS/Gopay. Saldo akan masuk otomatis 1-2 detik setelah dibayar.`
                    
                    const payBtn = {
                        inline_keyboard: [
                            [{ text: "💳 Bayar Sekarang", url: qrisRes.qris_url || "https://qrispay.pages.dev" }],
                            [{ text: "🔙 Kembali", callback_data: "menu_start" }]
                        ]
                    }
                    await sendTelegramMessage(botToken, chatId, successText, payBtn, messageId)
                } else {
                    await sendTelegramMessage(botToken, chatId, `❌ <b>Gagal:</b> ${qrisRes.error}\nSilakan coba lagi nanti.`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu_start" }]] }, messageId)
                }
            }
        }
        else if (data === 'menu_order') {
            // Placeholder sebelum dilanjut ke pagination layanan
            await sendTelegramMessage(botToken, chatId, `📚 Silakan gunakan format perintah untuk saat ini:\n<code>/beli [layanan] [negara]</code>\nContoh: <code>/beli wa 6</code>`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu_start" }]] }, messageId)
        }

        // Hapus loading icon di tombol
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: cb.id })
        })
        
        if (data !== 'menu_start') return c.text('OK')
    }

    // ==========================================
    // B. PENANGANAN PESAN TEKS (COMMAND)
    // ==========================================
    const message = body.message
    if (!message || !message.text) return c.text('OK')

    const chatId = message.chat.id.toString()
    const username = message.from.username ? `@${message.from.username}` : (message.from.first_name || 'User')
    const text = message.text.trim()

    // Daftar/Update User
    await c.env.DB.prepare(`
        INSERT INTO telegram_users (telegram_id, username, balance) 
        VALUES (?, ?, 0) 
        ON CONFLICT(telegram_id) DO UPDATE SET username = ?, updated_at = CURRENT_TIMESTAMP
    `).bind(chatId, username, username).run()

    // --- Command: /start (UI Sesuai Gambar: start.png) ---
    if (text === '/start') {
        const userRecord = await c.env.DB.prepare("SELECT balance FROM telegram_users WHERE telegram_id = ?").bind(chatId).first<{balance: number}>()
        const statsRecord = await c.env.DB.prepare("SELECT COUNT(*) as total FROM telegram_users").first<{total: number}>()
        
        const now = new Date()
        const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
        const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

        const startText = `🤖 <b>BotPanel PRO</b>\n${dateStr} pukul ${timeStr} WIB\n\n` +
                          `<b>User Info :</b>\n` +
                          `┣ <b>ID :</b> <code>${chatId}</code>\n` +
                          `┗ <b>Username :</b> ${username}\n\n` +
                          `<b>Balance Info :</b>\n` +
                          `┗ <b>Balance :</b> Rp ${(userRecord?.balance || 0).toLocaleString('id-ID')}\n\n` +
                          `<b>Bot Stats :</b>\n` +
                          `┗ <b>Total User :</b> ${statsRecord?.total || 1}\n\n` +
                          `<b>Info Promo :</b>\n` +
                          `┗ <b>Channel :</b> @InfoNokosMochi\n\n` +
                          `<b>Shortcut :</b>\n` +
                          `┗ /start - Mulai Bot`

        const startKeyboard = {
            inline_keyboard: [
                [{ text: "📄 Cara Penggunaan", callback_data: "menu_help" }],
                [
                    { text: "🛒 Order OTP", callback_data: "menu_order" },
                    { text: "💳 Deposit", callback_data: "menu_deposit" }
                ],
                [
                    { text: "🧾 Histori Order", callback_data: "menu_history_order" },
                    { text: "🧾 Histori Deposit", callback_data: "menu_history_deposit" }
                ],
                [
                    { text: "🎁 Referral", callback_data: "menu_referral" },
                    { text: "🎧 Contact CS", url: "https://t.me/CSAnda" }
                ],
                [{ text: "📜 Syarat Ketentuan", callback_data: "menu_terms" }]
            ]
        }
        
        // Jika asalnya dari callback edit pesan, edit pesannya. Jika dari ketikan user, kirim pesan baru.
        if (body.callback_query) {
            await sendTelegramMessage(botToken, chatId, startText, startKeyboard, body.message.message_id)
        } else {
            await sendTelegramMessage(botToken, chatId, startText, startKeyboard)
        }
        return c.text('OK')
    }

    // --- Command: /depo <nominal> (Deposit Kustom) ---
    if (text.startsWith('/depo ')) {
        const amount = Number(text.split(' ')[1])
        if (isNaN(amount)) {
            await sendTelegramMessage(botToken, chatId, "❌ Nominal tidak valid. Contoh: <code>/depo 15000</code>")
            return c.text('OK')
        }

        const reqProtocol = new URL(c.req.url).origin
        const qrisCall = await fetch(`${reqProtocol}/api/qris/create-invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegram_id: chatId, amount: amount })
        })
        const qrisRes = await qrisCall.json()

        if (qrisRes.success) {
            const payBtn = { inline_keyboard: [[{ text: "💳 Bayar Sekarang", url: qrisRes.qris_url || "https://qrispay.pages.dev" }]] }
            await sendTelegramMessage(botToken, chatId, `✅ <b>INVOICE DIBUAT</b>\nNominal: Rp ${qrisRes.amount.toLocaleString('id-ID')}\nKlik tombol untuk membayar.`, payBtn)
        } else {
            await sendTelegramMessage(botToken, chatId, `❌ <b>Gagal:</b> ${qrisRes.error}`)
        }
        return c.text('OK')
    }

    return c.text('OK')
})
