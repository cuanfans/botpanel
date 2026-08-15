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

// Helper Bendera Negara
function getFlagEmoji(countryName: string): string {
    const flags: Record<string, string> = {
        'Indonesia': '🇮🇩', 'USA': '🇺🇸', 'United Kingdom': '🇬🇧', 'Philippines': '🇵🇭', 
        'Brazil': '🇧🇷', 'Vietnam': '🇻🇳', 'Malaysia': '🇲🇾', 'Thailand': '🇹🇭', 
        'China': '🇨🇳', 'Ukraine': '🇺🇦', 'Myanmar': '🇲🇲', 'Kazakhstan': '🇰🇿', 
        'Nigeria': '🇳🇬', 'Bangladesh': '🇧🇩', 'Türkiye': '🇹🇷', 'Russia': '🇷🇺', 'India': '🇮🇳'
    }
    for (const [key, flag] of Object.entries(flags)) {
        if (countryName.toLowerCase().includes(key.toLowerCase())) return flag
    }
    return '🏳️'
}

// Endpoint Utama Webhook Telegram
telegramRouter.post('/webhook', async (c) => {
    const body = await c.req.json()
    
    const configsRaw = await c.env.DB.prepare("SELECT config_key, config_value FROM panel_configs").all<{config_key: string, config_value: string}>()
    const configs = configsRaw.results?.reduce((acc, curr) => {
        acc[curr.config_key] = curr.config_value; return acc
    }, {} as Record<string, string>) || {}

    const botToken = configs['bot_token']
    const nokosApiKey = configs['nokos_api_key']
    const rawQrisKey = configs['qris_api_key'] || ''
    const qrisApiKey = rawQrisKey.replace(/^Bearer\s+/i, '').trim()
    const globalQrisWebhook = (configs['qris_global_webhook'] || '').trim()
    
    if (!botToken) return c.text('OK')

    // ==========================================
    // A. PENANGANAN KLIK TOMBOL (CALLBACK QUERY)
    // ==========================================
    if (body.callback_query) {
        const cb = body.callback_query
        const chatId = cb.message.chat.id
        const messageId = cb.message.message_id
        const data = cb.data

        try {
            // 1. MENU UTAMA & STATIC
            if (data === 'menu_start') {
                body.message = cb.message; body.message.text = '/start'; body.message.from = cb.from;
            }
            else if (data === 'menu_deposit') {
                body.message = cb.message; body.message.text = '/deposit'; body.message.from = cb.from;
            }
            else if (data === 'menu_order') {
                // Langsung arahkan ke Layanan Server 2 Halaman 1
                data = 'srv_s2_1'
            }
            else if (['menu_help', 'menu_history_order', 'menu_history_deposit', 'menu_referral', 'menu_terms'].includes(data)) {
                await sendTelegramMessage(botToken, chatId, `Fitur <b>${data.replace('menu_', '')}</b> sedang dalam pengembangan.`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu_start" }]] }, messageId)
            }
            // 2. PROSES DEPOSIT
            else if (data.startsWith('depo_')) {
                const nominal = data.split('_')[1]
                
                if (nominal === 'custom') {
                    await sendTelegramMessage(botToken, chatId, `Silakan ketik nominal deposit Anda.\nFormat: <code>/depo 15000</code>`)
                } else {
                    const amount = Math.floor(Number(nominal)) // Pastikan angka bulat
                    
                    if (!qrisApiKey) {
                        await sendTelegramMessage(botToken, chatId, `❌ <b>Gagal:</b> API Key Gopay kosong di pengaturan panel.`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu_start" }]] }, messageId)
                        return c.text('OK')
                    }

                    await sendTelegramMessage(botToken, chatId, `⏳ Sedang membuat invoice QRIS untuk <b>Rp ${amount.toLocaleString('id-ID')}</b>...`, undefined, messageId)

                    const orderId = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`
                    
                    try {
                        await c.env.DB.prepare(`INSERT INTO deposits (order_id, telegram_id, amount, status) VALUES (?, ?, ?, 'pending')`).bind(orderId, String(chatId), amount).run()

                        const qrisPayload: any = { order_id: orderId, amount: amount }
                        if (globalQrisWebhook) qrisPayload.webhook_url = globalQrisWebhook

                        const qrisCall = await fetch('https://qrispay.pages.dev/api/trx', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${qrisApiKey}`,
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify(qrisPayload)
                        })
                        
                        const rawQrisResponse = await qrisCall.text()
                        let qrisRes;
                        try {
                            qrisRes = JSON.parse(rawQrisResponse)
                        } catch (e) {
                            throw new Error(`Invalid Gateway Response (HTTP ${qrisCall.status}): ${rawQrisResponse.substring(0, 100)}`)
                        }

                        if (qrisCall.ok && (qrisRes.qris_url || qrisRes.checkout_url)) {
                            const successText = `✅ <b>INVOICE DIBUAT</b>\n\n<b>Order ID:</b> <code>${orderId}</code>\n<b>Nominal:</b> Rp ${amount.toLocaleString('id-ID')}\n\nSilakan klik tombol di bawah ini untuk membayar via QRIS. Saldo akan masuk otomatis 1-2 detik setelah lunas.`
                            const payBtn = {
                                inline_keyboard: [
                                    [{ text: "💳 Bayar Sekarang", url: qrisRes.qris_url || qrisRes.checkout_url }],
                                    [{ text: "🔙 Kembali", callback_data: "menu_start" }]
                                ]
                            }
                            await sendTelegramMessage(botToken, chatId, successText, payBtn, messageId)
                        } else {
                            await c.env.DB.prepare("UPDATE deposits SET status = 'failed' WHERE order_id = ?").bind(orderId).run()
                            const errMsg = qrisRes.error || qrisRes.message || JSON.stringify(qrisRes)
                            await sendTelegramMessage(botToken, chatId, `❌ <b>Gateway Error:</b>\n<code>${errMsg}</code>`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu_start" }]] }, messageId)
                        }
                    } catch (err: any) {
                        await sendTelegramMessage(botToken, chatId, `❌ <b>Sistem Error:</b>\n<code>${err.message}</code>`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu_start" }]] }, messageId)
                    }
                }
            }
            
            // 3. PAGINATION LAYANAN (SERVICES)
            if (data.startsWith('srv_')) {
                const parts = data.split('_')
                const server = parts[1] || 's2'
                const page = parseInt(parts[2] || '1')
                const limit = 14
                const offset = (page - 1) * limit
                
                const totalSrv = await c.env.DB.prepare("SELECT COUNT(*) as t FROM nokos_services").first<{t: number}>()
                const maxPage = Math.ceil((totalSrv?.t || 0) / limit) || 1
                
                const srvs = await c.env.DB.prepare("SELECT code, name FROM nokos_services ORDER BY name LIMIT ? OFFSET ?").bind(limit, offset).all<{code: string, name: string}>()
                
                const inline_keyboard = []
                let row = []
                for(let i = 0; i < (srvs.results?.length || 0); i++){
                    const srv = srvs.results[i]
                    row.push({ text: srv.name, callback_data: `sv_${server}_${srv.code}` })
                    if(row.length === 2) { inline_keyboard.push(row); row = []; }
                }
                if(row.length > 0) inline_keyboard.push(row)
                
                const navRow = []
                if(page > 1) navRow.push({ text: "◀️", callback_data: `srv_${server}_${page-1}` })
                navRow.push({ text: `${page}/${maxPage}`, callback_data: "ignore" })
                if(page < maxPage) navRow.push({ text: "▶️", callback_data: `srv_${server}_${page+1}` })
                if(navRow.length > 0) inline_keyboard.push(navRow)
                
                inline_keyboard.push([
                    { text: "🔍 Search", callback_data: "search_srv" },
                    { text: "🔙 Kembali", callback_data: "menu_start" }
                ])
                
                await sendTelegramMessage(botToken, chatId, `📚 <b>PILIH LAYANAN OTP</b>\n\n💻 Server : ${server === 's1' ? 'Server Express' : 'Server Plus'}\n\nSilakan pilih layanan:`, { inline_keyboard }, messageIdToEdit)
            }
            
            // 4. PAGINATION NEGARA (COUNTRIES)
            else if (data.startsWith('sv_') || data.startsWith('cty_')) {
                const parts = data.split('_')
                const isCtyNav = parts[0] === 'cty'
                const server = parts[1]
                const serviceCode = parts[2]
                const page = isCtyNav ? parseInt(parts[3]) : 1
                const limit = 14
                const offset = (page - 1) * limit
                
                const srvInfo = await c.env.DB.prepare("SELECT name FROM nokos_services WHERE code = ?").bind(serviceCode).first<{name: string}>()
                const srvName = srvInfo?.name || serviceCode.toUpperCase()

                const totalCty = await c.env.DB.prepare("SELECT COUNT(*) as t FROM nokos_countries").first<{t: number}>()
                const maxPage = Math.ceil((totalCty?.t || 0) / limit) || 1
                
                const ctys = await c.env.DB.prepare("SELECT id, name FROM nokos_countries ORDER BY name LIMIT ? OFFSET ?").bind(limit, offset).all<{id: number, name: string}>()
                
                const inline_keyboard = []
                let row = []
                for(let i = 0; i < (ctys.results?.length || 0); i++){
                    const cty = ctys.results[i]
                    row.push({ text: `${getFlagEmoji(cty.name)} ${cty.name}`, callback_data: `ct_${server}_${serviceCode}_${cty.id}` })
                    if(row.length === 2) { inline_keyboard.push(row); row = []; }
                }
                if(row.length > 0) inline_keyboard.push(row)
                
                const navRow = []
                if(page > 1) navRow.push({ text: "◀️", callback_data: `cty_${server}_${serviceCode}_${page-1}` })
                navRow.push({ text: `${page}/${maxPage}`, callback_data: "ignore" })
                if(page < maxPage) navRow.push({ text: "▶️", callback_data: `cty_${server}_${serviceCode}_${page+1}` })
                if(navRow.length > 0) inline_keyboard.push(navRow)
                
                inline_keyboard.push([
                    { text: "🔙 Kembali", callback_data: `srv_${server}_1` },
                    { text: "🔍 Cari Negara", callback_data: "search_cty" }
                ])
                
                await sendTelegramMessage(botToken, chatId, `✨ <b>PILIH NEGARA: ${srvName.toUpperCase()}</b> (Hal. ${page})\n\nMenampilkan negara yang memiliki stok ketersediaan:\n\n<i>Pilih negara tujuan Anda:</i>`, { inline_keyboard }, messageIdToEdit)
            }

            // 5. CEK HARGA NOKOS
            else if (data.startsWith('ct_')) {
                const parts = data.split('_')
                const server = parts[1]
                const serviceCode = parts[2]
                const countryId = parts[3]

                const srvInfo = await c.env.DB.prepare("SELECT name FROM nokos_services WHERE code = ?").bind(serviceCode).first<{name: string}>()
                const srvName = srvInfo?.name || serviceCode.toUpperCase()

                await sendTelegramMessage(botToken, chatId, `🔄 Mengambil data harga terkini dari provider...`, undefined, messageIdToEdit)

                try {
                    const nokos = new NokosService(nokosApiKey)
                    const providerData = await nokos.getPrices(serviceCode, countryId, server)
                    
                    const pricesObj = providerData[countryId] || providerData
                    const serviceData = pricesObj[serviceCode]

                    if (!serviceData || (serviceData.count !== undefined && serviceData.count <= 0)) {
                        await sendTelegramMessage(botToken, chatId, `❌ Maaf, stok untuk <b>${srvName}</b> di negara ini sedang kosong.`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: `sv_${server}_${serviceCode}` }]] }, messageIdToEdit)
                    } else {
                        // Jika Nokos mengembalikan list harga (seperti di screenshot) atau single price
                        let priceOptions = []
                        if (Array.isArray(serviceData)) {
                            priceOptions = serviceData
                        } else {
                            priceOptions = [serviceData]
                        }

                        const inline_keyboard = []
                        let row = []

                        for (const opt of priceOptions) {
                            const rawCost = Number(opt.cost ?? opt.price ?? 0)
                            const stock = opt.count ?? 0
                            
                            // Kalkulasi Margin per iterasi
                            const { finalPrice } = await calculateFinalPrice(c.env.DB, rawCost, serviceCode, countryId)
                            
                            row.push({ text: `Rp. ${finalPrice.toLocaleString('id-ID')} | Stok ${stock}`, callback_data: `buy_${server}_${serviceCode}_${countryId}_${finalPrice}` })
                            if(row.length === 2) { inline_keyboard.push(row); row = []; }
                        }
                        if(row.length > 0) inline_keyboard.push(row)

                        inline_keyboard.push([{ text: "🔙 Kembali", callback_data: `sv_${server}_${serviceCode}` }])

                        await sendTelegramMessage(botToken, chatId, `✨ <b>LAYANAN TERPILIH: ${srvName.toUpperCase()}</b>\n\nBerikut adalah pilihan harga yang tersedia saat ini untuk negara yang Anda pilih:\n\n<i>Pilih harga yang menurut Anda paling stabil:</i>`, { inline_keyboard }, messageIdToEdit)
                    }
                } catch (e: any) {
                    await sendTelegramMessage(botToken, chatId, `❌ Gagal mengambil harga: ${e.message}`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: `sv_${server}_${serviceCode}` }]] }, messageIdToEdit)
                }
            }

            // 6. PROSES PEMBELIAN ATOMIK
            else if (data.startsWith('buy_')) {
                const parts = data.split('_')
                const server = parts[1]
                const serviceCode = parts[2]
                const countryId = parts[3]
                const expectedPrice = Number(parts[4])
                const trxId = `TRX-${Date.now()}`

                try {
                    await atomicPurchase(c.env.DB, String(chatId), expectedPrice, serviceCode, countryId, trxId)
                    await sendTelegramMessage(botToken, chatId, `⏳ Memproses pesanan...\nLayanan: <b>${serviceCode.toUpperCase()}</b>\nSaldo dipotong: Rp ${expectedPrice.toLocaleString('id-ID')}`, undefined, messageIdToEdit)

                    const nokos = new NokosService(nokosApiKey)
                    const order = await nokos.getNumber(serviceCode, countryId, server)

                    // Kalkulasi ulang margin untuk disimpan ke histori
                    const { markupApplied } = await calculateFinalPrice(c.env.DB, order.price, serviceCode, countryId)

                    await c.env.DB.prepare(`
                        UPDATE transactions 
                        SET status = 'success', nokos_activation_id = ?, phone_number = ?, provider_cost = ?, markup_applied = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE transaction_id = ?
                    `).bind(order.activation_id, order.phone, order.price, markupApplied, trxId).run()

                    await sendTelegramMessage(botToken, chatId, `✅ <b>SUKSES!</b>\n\n📱 Nomor Anda: <code>${order.phone}</code>\n🔖 ID Aktivasi: ${order.activation_id}\n\n<i>Ketik <code>/otp ${order.activation_id}</code> untuk mengecek SMS yang masuk.</i>`, undefined, messageIdToEdit)

                } catch (error: any) {
                    if (error.message !== "Saldo tidak mencukupi atau transaksi gagal") {
                        await c.env.DB.prepare(`UPDATE telegram_users SET balance = balance + (SELECT final_price FROM transactions WHERE transaction_id = ?) WHERE telegram_id = ?`).bind(trxId, String(chatId)).run() 
                        await c.env.DB.prepare(`UPDATE transactions SET status = 'failed' WHERE transaction_id = ?`).bind(trxId).run()
                    }
                    await sendTelegramMessage(botToken, chatId, `❌ <b>GAGAL:</b> ${error.message}`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: `ct_${server}_${serviceCode}_${countryId}` }]] }, messageIdToEdit)
                }
            }

        } catch (err: any) {
            console.error(err)
        } finally {
            await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ callback_query_id: cb.id })
            })
        }
        
        if (!['menu_start', 'menu_deposit', 'menu_order'].includes(data)) return c.text('OK')
    }

    // ==========================================
    // B. PENANGANAN PESAN TEKS (COMMAND)
    // ==========================================
    const message = body.message
    if (!message || !message.text) return c.text('OK')

    const chatId = message.chat.id.toString()
    const username = message.from.username ? `@${message.from.username}` : (message.from.first_name || 'User')
    const text = message.text.trim()
    const isFromCallback = !!body.callback_query
    const messageIdToEdit = isFromCallback ? message.message_id : undefined

    await c.env.DB.prepare(`
        INSERT INTO telegram_users (telegram_id, username, balance) 
        VALUES (?, ?, 0) 
        ON CONFLICT(telegram_id) DO UPDATE SET username = ?, updated_at = CURRENT_TIMESTAMP
    `).bind(chatId, username, username).run()

    // --- Command: /start ---
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
        await sendTelegramMessage(botToken, chatId, startText, startKeyboard, messageIdToEdit)
        return c.text('OK')
    }

    // --- Command: /deposit ---
    if (text === '/deposit') {
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
        await sendTelegramMessage(botToken, chatId, textDeposit, keyboardDeposit, messageIdToEdit)
        return c.text('OK')
    }

    // --- Command: /depo <nominal> ---
    if (text.startsWith('/depo ')) {
        const amount = Math.floor(Number(text.split(' ')[1]))
        if (isNaN(amount) || amount < 5000) {
            await sendTelegramMessage(botToken, chatId, "❌ Nominal tidak valid. Minimal Rp 5.000.\nContoh: <code>/depo 15000</code>")
            return c.text('OK')
        }

        if (!qrisApiKey) {
            await sendTelegramMessage(botToken, chatId, `❌ <b>Gagal:</b> API Key Gopay belum dikonfigurasi.`)
            return c.text('OK')
        }

        const orderId = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`
        
        try {
            await c.env.DB.prepare(`INSERT INTO deposits (order_id, telegram_id, amount, status) VALUES (?, ?, ?, 'pending')`)
                .bind(orderId, String(chatId), amount).run()

            const qrisPayload: any = { order_id: orderId, amount: amount }
            if (globalQrisWebhook) qrisPayload.webhook_url = globalQrisWebhook

            const qrisCall = await fetch('https://qrispay.pages.dev/api/trx', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${qrisApiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(qrisPayload)
            })
            
            const rawResponse = await qrisCall.text()
            let qrisRes;
            try {
                qrisRes = JSON.parse(rawResponse)
            } catch (e) {
                 throw new Error(`Invalid Gateway Response: ${rawResponse.substring(0, 100)}`)
            }

            if (qrisCall.ok && (qrisRes.qris_url || qrisRes.checkout_url)) {
                const payBtn = { inline_keyboard: [[{ text: "💳 Bayar Sekarang", url: qrisRes.qris_url || qrisRes.checkout_url }]] }
                await sendTelegramMessage(botToken, chatId, `✅ <b>INVOICE DIBUAT</b>\n\n<b>Order ID:</b> <code>${orderId}</code>\n<b>Nominal:</b> Rp ${amount.toLocaleString('id-ID')}\n\nKlik tombol di bawah untuk membayar.`, payBtn)
            } else {
                await c.env.DB.prepare("UPDATE deposits SET status = 'failed' WHERE order_id = ?").bind(orderId).run()
                await sendTelegramMessage(botToken, chatId, `❌ <b>Gagal dari Gateway:</b>\n<code>${qrisRes.error || qrisRes.message || JSON.stringify(qrisRes)}</code>`)
            }
        } catch (err: any) {
            await sendTelegramMessage(botToken, chatId, `❌ <b>Error:</b>\n<code>${err.message}</code>`)
        }
        
        return c.text('OK')
    }

    return c.text('OK')
})
