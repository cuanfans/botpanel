import { Hono } from 'hono'
import { atomicPurchase } from '../db/queries'
import { calculateFinalPrice } from '../utils/pricing'
import { NokosService } from '../services/nokos'

export const telegramRouter = new Hono<{ Bindings: { DB: D1Database } }>()

// Helper kirim pesan Telegram
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
    }).catch(() => {}) 
}

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

// ==========================================
// RENDERER MENU UTAMA
// ==========================================
async function showStartMenu(db: D1Database, botToken: string, chatId: string, username: string, promoChannel: string, contactCs: string, messageIdToEdit?: number) {
    const userRecord = await db.prepare("SELECT balance FROM telegram_users WHERE telegram_id = ?").bind(chatId).first<{balance: number}>()
    const statsRecord = await db.prepare("SELECT COUNT(*) as total FROM telegram_users").first<{total: number}>()
    
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
                      `┗ <b>Channel :</b> ${promoChannel}\n\n` +
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
                { text: "🎧 Contact CS", url: contactCs }
            ],
            [{ text: "📜 Syarat Ketentuan", callback_data: "menu_terms" }]
        ]
    }
    await sendTelegramMessage(botToken, chatId, startText, startKeyboard, messageIdToEdit)
}

async function showDepositMenu(botToken: string, chatId: string, messageIdToEdit?: number) {
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
}

async function showOrderMenu(botToken: string, chatId: string, messageIdToEdit?: number) {
    const srvText = `📚 <b>PILIH LAYANAN OTP</b>\n\nSilakan pilih server penyedia OTP yang ingin Anda gunakan:`
    const srvKb = {
        inline_keyboard: [
            [{ text: "⚡ Server 1 (Express)", callback_data: "srv_s1_1" }],
            [{ text: "💎 Server 2 (Premium)", callback_data: "srv_s2_1" }],
            [{ text: "🔙 Kembali", callback_data: "menu_start" }]
        ]
    }
    await sendTelegramMessage(botToken, chatId, srvText, srvKb, messageIdToEdit)
}

// Endpoint Utama Webhook Telegram
telegramRouter.post('/webhook', async (c) => {
    const body = await c.req.json()
    
    // Ambil Configs
    const configsRaw = await c.env.DB.prepare("SELECT config_key, config_value FROM panel_configs").all<{config_key: string, config_value: string}>()
    const configs = configsRaw.results?.reduce((acc, curr) => {
        acc[curr.config_key] = curr.config_value; return acc
    }, {} as Record<string, string>) || {}

    const botToken = configs['bot_token']
    const nokosApiKey = configs['nokos_api_key']
    const rawQrisKey = configs['qris_api_key'] || ''
    const qrisApiKey = rawQrisKey.replace(/^Bearer\s+/i, '').trim()
    const globalQrisWebhook = (configs['qris_global_webhook'] || '').trim()
    
    const qrisGatewayUrl = (configs['qris_gateway_url'] || 'https://qrispay.pages.dev/api/trx').trim()
    const promoChannel = (configs['promo_channel'] || '@InfoNokosMochi').trim()
    const contactCs = (configs['contact_cs'] || 'https://t.me/CSAnda').trim()
    const termsText = (configs['terms_conditions'] || 'Syarat dan ketentuan belum diatur.').trim()
    
    const reqUrl = new URL(c.req.url)
    const autoWebhookUrl = `${reqUrl.origin}/api/qris/webhook`
    const finalWebhookUrl = globalQrisWebhook || autoWebhookUrl
    
    if (!botToken) return c.text('OK')

    // ==========================================
    // A. PENANGANAN KLIK TOMBOL (CALLBACK QUERY)
    // ==========================================
    if (body.callback_query) {
        const cb = body.callback_query
        const chatId = cb.message.chat.id
        const messageId = cb.message.message_id
        const username = cb.from.username ? `@${cb.from.username}` : (cb.from.first_name || 'User')
        let data = cb.data

        // Balas cepat agar tidak loading, berikan popup alert khusus jika menu referral
        const isReferral = data === 'menu_referral';
        c.executionCtx.waitUntil(
            fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    callback_query_id: cb.id,
                    text: isReferral ? "Fitur Referral sedang dikembangkan. Mohon bersabar!" : undefined,
                    show_alert: isReferral
                })
            })
        )

        if (isReferral) return c.text('OK');

        try {
            // 1. MENU UTAMA, DEPOSIT & STATIC PAGES
            if (data === 'menu_start') {
                await showStartMenu(c.env.DB, botToken, String(chatId), username, promoChannel, contactCs, messageId);
            }
            else if (data === 'menu_deposit') {
                await showDepositMenu(botToken, String(chatId), messageId);
            }
            else if (data === 'menu_order') {
                await showOrderMenu(botToken, String(chatId), messageId);
            }
            else if (data === 'menu_help') {
                const helpText = `📄 <b>CARA PENGGUNAAN BOT</b>\n\n` +
                                 `1. Lakukan pengisian saldo via menu <b>💳 Deposit</b>.\n` +
                                 `2. Pilih menu <b>🛒 Order OTP</b>, lalu pilih Server dan Layanan.\n` +
                                 `3. Pilih negara dan harga yang Anda inginkan.\n` +
                                 `4. Nomor akan muncul. Gunakan nomor tersebut di aplikasi tujuan Anda.\n` +
                                 `5. Ketik perintah <code>/otp [ID_Aktivasi]</code> (misal: <code>/otp 12345</code>) untuk mengecek kode SMS masuk.\n` +
                                 `6. Saldo hanya terpotong jika SMS berhasil masuk.\n\n` +
                                 `<i>Butuh bantuan lebih lanjut? Klik menu Contact CS.</i>`;
                await sendTelegramMessage(botToken, chatId, helpText, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu_start" }]] }, messageId);
            }
            else if (data === 'menu_terms') {
                const termsMsg = `📜 <b>SYARAT & KETENTUAN</b>\n\n${termsText}`;
                await sendTelegramMessage(botToken, chatId, termsMsg, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu_start" }]] }, messageId);
            }
            // HISTORI ORDER
            else if (data === 'menu_history_order') {
                const txs = await c.env.DB.prepare("SELECT service_code, phone_number, final_price, status, created_at FROM transactions WHERE telegram_id = ? ORDER BY id DESC LIMIT 5").bind(String(chatId)).all<any>();
                let text = `🧾 <b>5 HISTORI ORDER TERAKHIR</b>\n\n`;
                if (!txs.results || txs.results.length === 0) {
                    text += `<i>Belum ada histori order.</i>`;
                } else {
                    txs.results.forEach((tx, i) => {
                        const icon = tx.status === 'success' ? '✅' : (tx.status === 'failed' || tx.status === 'refunded' ? '❌' : '⏳');
                        text += `${i+1}. <b>${tx.service_code.toUpperCase()}</b> - <code>${tx.phone_number || 'N/A'}</code>\n` +
                                `   Harga: Rp ${tx.final_price.toLocaleString('id-ID')} | Status: ${icon} ${tx.status}\n` +
                                `   Waktu: ${new Date(tx.created_at).toLocaleString('id-ID')}\n\n`;
                    });
                }
                await sendTelegramMessage(botToken, chatId, text, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu_start" }]] }, messageId);
            }
            // HISTORI DEPOSIT
            else if (data === 'menu_history_deposit') {
                const depos = await c.env.DB.prepare("SELECT amount, status, created_at FROM deposits WHERE telegram_id = ? ORDER BY id DESC LIMIT 5").bind(String(chatId)).all<any>();
                let text = `🧾 <b>5 HISTORI DEPOSIT TERAKHIR</b>\n\n`;
                if (!depos.results || depos.results.length === 0) {
                    text += `<i>Belum ada histori deposit.</i>`;
                } else {
                    depos.results.forEach((dep, i) => {
                        const icon = dep.status === 'settlement' ? '✅' : (dep.status === 'failed' || dep.status === 'expired' ? '❌' : '⏳');
                        text += `${i+1}. <b>Rp ${dep.amount.toLocaleString('id-ID')}</b>\n` +
                                `   Status: ${icon} ${dep.status}\n` +
                                `   Waktu: ${new Date(dep.created_at).toLocaleString('id-ID')}\n\n`;
                    });
                }
                await sendTelegramMessage(botToken, chatId, text, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu_start" }]] }, messageId);
            }
            
            // 2. PROSES DEPOSIT 
            else if (data.startsWith('depo_')) {
                const nominal = data.split('_')[1]
                if (nominal === 'custom') {
                    await sendTelegramMessage(botToken, chatId, `Silakan ketik nominal deposit Anda.\nFormat: <code>/depo 1000</code>`)
                } else {
                    const amount = Math.floor(Number(nominal))
                    if (!qrisApiKey) {
                        await sendTelegramMessage(botToken, chatId, `❌ <b>Gagal:</b> API Key Gopay kosong di pengaturan panel.`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu_deposit" }]] }, messageId)
                        return c.text('OK')
                    }

                    await sendTelegramMessage(botToken, chatId, `⏳ Sedang membuat invoice QRIS untuk <b>Rp ${amount.toLocaleString('id-ID')}</b>...`, undefined, messageId)
                    const orderId = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`
                    
                    try {
                        await c.env.DB.prepare(`INSERT INTO deposits (order_id, telegram_id, amount, status) VALUES (?, ?, ?, 'pending')`).bind(orderId, String(chatId), amount).run()

                        const qrisPayload: any = { order_id: orderId, amount: amount, webhook_url: finalWebhookUrl }
                        const qrisCall = await fetch(qrisGatewayUrl, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${qrisApiKey}`,
                                'Content-Type': 'application/json',
                                'Accept': 'application/json',
                                'User-Agent': 'Cloudflare-Worker'
                            },
                            body: JSON.stringify(qrisPayload)
                        })
                        
                        const rawQrisResponse = await qrisCall.text()
                        let qrisRes;
                        try {
                            qrisRes = JSON.parse(rawQrisResponse)
                        } catch (e) {
                            throw new Error(`Invalid Gateway Response (HTTP ${qrisCall.status}):\n<code>${rawQrisResponse.substring(0, 150)}</code>`)
                        }

                        if (qrisCall.ok && (qrisRes.status === 'success' || qrisRes.paylink || qrisRes.qris_url || qrisRes.raw_qris)) {
                            const finalUrl = qrisRes.paylink || qrisRes.qris_url || qrisRes.checkout_url || qrisRes.data?.qris_url;
                            const rawQris = qrisRes.raw_qris || qrisRes.data?.raw_qris;
                            const qrImageUrl = rawQris ? `https://quickchart.io/qr?text=${encodeURIComponent(rawQris)}&size=300&margin=2` : null;

                            await c.env.DB.prepare(`UPDATE deposits SET qris_url = ?, webhook_url = ? WHERE order_id = ?`).bind(finalUrl || qrImageUrl || '', finalWebhookUrl, orderId).run()

                            const successText = `✅ <b>INVOICE DIBUAT</b>\n\n`+
                                                `<b>Order ID:</b> <code>${orderId}</code>\n`+
                                                `<b>Nominal:</b> Rp ${amount.toLocaleString('id-ID')}\n\n`+
                                                `📸 <b>Instruksi Pembayaran:</b>\n`+
                                                `Silakan screenshot atau simpan gambar QRIS ini, lalu scan menggunakan aplikasi e-wallet (DANA, GoPay, ShopeePay, OVO) atau Mobile Banking Anda.\n\n`+
                                                `⏳ Saldo otomatis masuk 1-2 detik setelah lunas.`;

                            const inline_keyboard = [];
                            if (finalUrl) inline_keyboard.push([{ text: "💳 Buka Halaman Bayar", url: finalUrl }]);
                            inline_keyboard.push([{ text: "🔙 Kembali", callback_data: "menu_deposit" }]);
                            const payBtn = { inline_keyboard };

                            if (qrImageUrl) {
                                await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ chat_id: chatId, message_id: messageId })
                                }).catch(() => {});

                                await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ chat_id: chatId, photo: qrImageUrl, caption: successText, reply_markup: payBtn, parse_mode: 'HTML' })
                                });
                            } else {
                                await sendTelegramMessage(botToken, chatId, successText, payBtn, messageId)
                            }
                        } else {
                            await c.env.DB.prepare("UPDATE deposits SET status = 'failed' WHERE order_id = ?").bind(orderId).run()
                            const errMsg = qrisRes.error || qrisRes.message || JSON.stringify(qrisRes)
                            await sendTelegramMessage(botToken, chatId, `❌ <b>Gateway Error:</b>\n<code>${errMsg}</code>`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu_deposit" }]] }, messageId)
                        }
                    } catch (err: any) {
                        await sendTelegramMessage(botToken, chatId, `❌ <b>Sistem Error:</b>\n<code>${err.message}</code>`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: "menu_deposit" }]] }, messageId)
                    }
                }
            }
            
            // 3. PAGINATION LAYANAN
            else if (data.startsWith('srv_')) {
                const parts = data.split('_')
                const server = parts[1] || 's2'
                const page = parseInt(parts[2] || '1')
                const limit = 14
                
                const totalSrv = await c.env.DB.prepare("SELECT COUNT(*) as t FROM nokos_services").first<{t: number}>()
                const maxPage = Math.ceil((totalSrv?.t || 0) / limit) || 1
                
                let srvs = [];
                const popularCodes = ['wa', 'tg', 'ka', 'lf', 'fb', 'ig', 'go', 'amb', 'jg', 'ni', 'fr', 'xh', 'bha', 'xd', 'ot'];
                
                if (page === 1) {
                    const placeholders = popularCodes.map(() => '?').join(',');
                    srvs = await c.env.DB.prepare(`SELECT code, name FROM nokos_services WHERE code IN (${placeholders})`).bind(...popularCodes).all<{code: string, name: string}>();
                    srvs = srvs.results || [];
                    srvs.sort((a, b) => popularCodes.indexOf(a.code) - popularCodes.indexOf(b.code));
                } else {
                    const offset = (page - 1) * limit
                    const placeholders = popularCodes.map(() => '?').join(',');
                    srvs = await c.env.DB.prepare(`SELECT code, name FROM nokos_services WHERE code NOT IN (${placeholders}) ORDER BY name LIMIT ? OFFSET ?`)
                        .bind(...popularCodes, limit, offset).all<{code: string, name: string}>();
                    srvs = srvs.results || [];
                }
                
                const inline_keyboard = []
                let row = []
                for(let i = 0; i < srvs.length; i++){
                    let name = srvs[i].name
                    if(srvs[i].code === 'wa') name = 'WhatsApp'
                    if(srvs[i].code === 'tg') name = 'Telegram'
                    if(srvs[i].code === 'lf') name = 'TikTok'
                    if(srvs[i].code === 'ka') name = 'Shopee'
                    if(srvs[i].code === 'go') name = 'Google/Gmail/YT'
                    if(srvs[i].code === 'ot') name = 'Any Other'
                    
                    row.push({ text: name, callback_data: `sv_${server}_${srvs[i].code}` })
                    if(row.length === 2) { inline_keyboard.push(row); row = []; }
                }
                if(row.length > 0) inline_keyboard.push(row)
                
                const navRow = []
                if(page > 1) navRow.push({ text: "◀️ Prev", callback_data: `srv_${server}_${page-1}` })
                navRow.push({ text: `${page}/${maxPage}`, callback_data: "ignore" })
                if(page < maxPage) navRow.push({ text: "Next ▶️", callback_data: `srv_${server}_${page+1}` })
                if(navRow.length > 0) inline_keyboard.push(navRow)
                
                inline_keyboard.push([
                    { text: "🔍 Cari Layanan (Ketik /cari)", callback_data: "ignore" },
                    { text: "🔙 Kembali", callback_data: "menu_order" }
                ])
                
                const srvText = `📚 <b>PILIH LAYANAN OTP</b>\n\n💻 <b>Server :</b> ${server === 's1' ? 'Server 1 (Express)' : 'Server 2 (Premium)'}\n\nNomor OTP Indonesia dan Internasional dengan kualitas premium dan stok melimpah.\n\n<i>Silakan pilih layanan:</i>`
                await sendTelegramMessage(botToken, chatId, srvText, { inline_keyboard }, messageId)
            }
            
            // 4. PAGINATION NEGARA
            else if (data.startsWith('sv_') || data.startsWith('cty_')) {
                const parts = data.split('_')
                const isCtyNav = parts[0] === 'cty'
                const server = parts[1]
                const serviceCode = parts[2]
                const page = isCtyNav ? parseInt(parts[3]) : 1
                const limit = 14
                
                const srvInfo = await c.env.DB.prepare("SELECT name FROM nokos_services WHERE code = ?").bind(serviceCode).first<{name: string}>()
                const srvName = srvInfo?.name || serviceCode.toUpperCase()

                const totalCty = await c.env.DB.prepare("SELECT COUNT(*) as t FROM nokos_countries").first<{t: number}>()
                const maxPage = Math.ceil((totalCty?.t || 0) / limit) || 1
                
                let ctys = [];
                const popularCtyIds = [6, 22, 187, 16, 4, 73, 10, 7, 52, 3, 1, 5, 2, 19];

                if (page === 1) {
                    const placeholders = popularCtyIds.map(() => '?').join(',');
                    ctys = await c.env.DB.prepare(`SELECT id, name FROM nokos_countries WHERE id IN (${placeholders})`).bind(...popularCtyIds).all<{id: number, name: string}>();
                    ctys = ctys.results || [];
                    ctys.sort((a, b) => popularCtyIds.indexOf(a.id) - popularCtyIds.indexOf(b.id));
                } else {
                    const offset = (page - 1) * limit
                    const placeholders = popularCtyIds.map(() => '?').join(',');
                    ctys = await c.env.DB.prepare(`SELECT id, name FROM nokos_countries WHERE id NOT IN (${placeholders}) ORDER BY name LIMIT ? OFFSET ?`)
                        .bind(...popularCtyIds, limit, offset).all<{id: number, name: string}>();
                    ctys = ctys.results || [];
                }
                
                const inline_keyboard = []
                let row = []
                for(let i = 0; i < ctys.length; i++){
                    const cty = ctys[i]
                    row.push({ text: `${getFlagEmoji(cty.name)} ${cty.name}`, callback_data: `ct_${server}_${serviceCode}_${cty.id}` })
                    if(row.length === 2) { inline_keyboard.push(row); row = []; }
                }
                if(row.length > 0) inline_keyboard.push(row)
                
                const navRow = []
                if(page > 1) navRow.push({ text: "◀️ Prev", callback_data: `cty_${server}_${serviceCode}_${page-1}` })
                navRow.push({ text: `${page}/${maxPage}`, callback_data: "ignore" })
                if(page < maxPage) navRow.push({ text: "Next ▶️", callback_data: `cty_${server}_${serviceCode}_${page+1}` })
                if(navRow.length > 0) inline_keyboard.push(navRow)
                
                inline_keyboard.push([
                    { text: "🔙 Kembali", callback_data: `srv_${server}_1` },
                ])
                
                const ctyText = `✨ <b>PILIH NEGARA: ${srvName.toUpperCase()}</b> (Hal. ${page})\n\nMenampilkan ${totalCty?.t || 0} negara yang memiliki stok ketersediaan saat ini:\n\n<i>Pilih negara tujuan Anda:</i>`
                await sendTelegramMessage(botToken, chatId, ctyText, { inline_keyboard }, messageId)
            }

            // 5. CEK HARGA NOKOS
            else if (data.startsWith('ct_')) {
                const parts = data.split('_')
                const server = parts[1]
                const serviceCode = parts[2]
                const countryId = parts[3]

                const srvInfo = await c.env.DB.prepare("SELECT name FROM nokos_services WHERE code = ?").bind(serviceCode).first<{name: string}>()
                const srvName = srvInfo?.name || serviceCode.toUpperCase()

                await sendTelegramMessage(botToken, chatId, `🔄 Mengambil data stok & harga dari server...`, undefined, messageId)

                try {
                    const nokos = new NokosService(nokosApiKey)
                    const providerData = await nokos.getPrices(serviceCode, countryId, server)
                    
                    const pricesObj = providerData[countryId] || providerData
                    const serviceData = pricesObj[serviceCode]

                    if (!serviceData || (serviceData.count !== undefined && serviceData.count <= 0)) {
                        await sendTelegramMessage(botToken, chatId, `❌ Maaf, stok untuk <b>${srvName}</b> di negara ini sedang kosong.`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: `sv_${server}_${serviceCode}` }]] }, messageId)
                    } else {
                        let priceOptions = []
                        if (serviceData.cost !== undefined || serviceData.price !== undefined) {
                            priceOptions.push(serviceData)
                        } else {
                            for (const [op, optData] of Object.entries(serviceData)) {
                                if ((optData as any).cost !== undefined || (optData as any).price !== undefined) {
                                    priceOptions.push({ ...optData as any, operator: op })
                                }
                            }
                        }

                        const inline_keyboard = []
                        let row = []

                        for (const opt of priceOptions) {
                            const rawCost = Number(opt.cost ?? opt.price ?? 0)
                            const stock = opt.count ?? 0
                            
                            const { finalPrice } = await calculateFinalPrice(c.env.DB, rawCost, serviceCode, countryId)
                            
                            row.push({ text: `Rp. ${finalPrice.toLocaleString('id-ID')} | Stok ${stock}`, callback_data: `buy_${server}_${serviceCode}_${countryId}_${finalPrice}` })
                            if(row.length === 2) { inline_keyboard.push(row); row = []; }
                        }
                        if(row.length > 0) inline_keyboard.push(row)

                        inline_keyboard.push([{ text: "🔙 Kembali", callback_data: `sv_${server}_${serviceCode}` }])

                        await sendTelegramMessage(botToken, chatId, `✨ <b>LAYANAN TERPILIH: ${srvName.toUpperCase()}</b>\n\nBerikut adalah pilihan harga yang tersedia saat ini untuk negara yang Anda pilih:\n\n<i>Pilih harga yang menurut Anda paling stabil:</i>`, { inline_keyboard }, messageId)
                    }
                } catch (e: any) {
                    await sendTelegramMessage(botToken, chatId, `❌ Gagal mengambil harga: ${e.message}`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: `sv_${server}_${serviceCode}` }]] }, messageId)
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
                    await sendTelegramMessage(botToken, chatId, `⏳ Memproses pesanan...\nLayanan: <b>${serviceCode.toUpperCase()}</b>\nSaldo dipotong: Rp ${expectedPrice.toLocaleString('id-ID')}`, undefined, messageId)

                    const nokos = new NokosService(nokosApiKey)
                    const order = await nokos.getNumber(serviceCode, countryId, server)

                    const { markupApplied } = await calculateFinalPrice(c.env.DB, order.price, serviceCode, countryId)

                    await c.env.DB.prepare(`
                        UPDATE transactions 
                        SET status = 'success', nokos_activation_id = ?, phone_number = ?, provider_cost = ?, markup_applied = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE transaction_id = ?
                    `).bind(order.activation_id, order.phone, order.price, markupApplied, trxId).run()

                    await sendTelegramMessage(botToken, chatId, `✅ <b>SUKSES!</b>\n\n📱 Nomor Anda: <code>${order.phone}</code>\n🔖 ID Aktivasi: ${order.activation_id}\n\n<i>Ketik <code>/otp ${order.activation_id}</code> untuk mengecek SMS yang masuk.</i>`, undefined, messageId)

                } catch (error: any) {
                    if (error.message !== "Saldo tidak mencukupi atau transaksi gagal") {
                        await c.env.DB.prepare(`UPDATE telegram_users SET balance = balance + (SELECT final_price FROM transactions WHERE transaction_id = ?) WHERE telegram_id = ?`).bind(trxId, String(chatId)).run() 
                        await c.env.DB.prepare(`UPDATE transactions SET status = 'failed' WHERE transaction_id = ?`).bind(trxId).run()
                    }
                    await sendTelegramMessage(botToken, chatId, `❌ <b>GAGAL:</b> ${error.message}`, { inline_keyboard: [[{ text: "🔙 Kembali", callback_data: `ct_${server}_${serviceCode}_${countryId}` }]] }, messageId)
                }
            }
        } catch (err: any) {
            console.error(err)
        }
        
        return c.text('OK')
    }

    // ==========================================
    // B. PENANGANAN PESAN TEKS (COMMAND)
    // ==========================================
    const message = body.message
    if (!message || !message.text) return c.text('OK')

    const chatId = message.chat.id.toString()
    const username = message.from.username ? `@${message.from.username}` : (message.from.first_name || 'User')
    const text = message.text.trim()

    await c.env.DB.prepare(`
        INSERT INTO telegram_users (telegram_id, username, balance) 
        VALUES (?, ?, 0) 
        ON CONFLICT(telegram_id) DO UPDATE SET username = ?, updated_at = CURRENT_TIMESTAMP
    `).bind(chatId, username, username).run()

    // --- Command: /start ---
    if (text === '/start') {
        await showStartMenu(c.env.DB, botToken, chatId, username, promoChannel, contactCs);
        return c.text('OK');
    }

    // --- Command: /deposit ---
    if (text === '/deposit') {
        await showDepositMenu(botToken, chatId);
        return c.text('OK');
    }

    // --- Command: /order ---
    if (text === '/order') {
        await showOrderMenu(botToken, chatId);
        return c.text('OK');
    }

    // --- Command: /otp <id> ---
    if (text.startsWith('/otp ')) {
        const actId = text.split(' ')[1];
        if (!actId) return c.text('OK');
        try {
            const nokos = new NokosService(nokosApiKey);
            const status = await nokos.getStatus(actId);
            
            let msg = ``;
            if (status.status === 'STATUS_WAIT_CODE') {
                msg = `⏳ Menunggu SMS masuk untuk ID <code>${actId}</code>...\n\nSilakan tunggu beberapa saat dan ketik <code>/otp ${actId}</code> kembali.`;
            } else if (status.status === 'STATUS_OK') {
                msg = `📩 <b>SMS MASUK!</b>\n\nKode/SMS: <code>${status.sms || status.code}</code>\n\nSisa saldo Anda telah disesuaikan.`;
            } else if (status.status === 'STATUS_CANCEL') {
                msg = `❌ Transaksi dibatalkan atau kadaluarsa. Jika saldo Anda terpotong, silakan hubungi admin.`;
            } else {
                msg = `Status Aktivasi: ${status.status}`;
            }
            await sendTelegramMessage(botToken, chatId, msg);
        } catch (e: any) {
            await sendTelegramMessage(botToken, chatId, `❌ Gagal cek status: ${e.message}`);
        }
        return c.text('OK');
    }

    // --- Command: /depo <nominal> ---
    if (text.startsWith('/depo ')) {
        const amount = Math.floor(Number(text.split(' ')[1]))
        if (isNaN(amount) || amount < 1000 || amount > 499999) {
            await sendTelegramMessage(botToken, chatId, "❌ Nominal tidak valid. Minimal Rp 1.000 dan Maksimal Rp 499.999.\nContoh: <code>/depo 15000</code>")
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

            const qrisPayload: any = { 
                order_id: orderId, 
                amount: amount,
                webhook_url: finalWebhookUrl 
            }

            const qrisCall = await fetch(qrisGatewayUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${qrisApiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Cloudflare-Worker'
                },
                body: JSON.stringify(qrisPayload)
            })
            
            const rawResponse = await qrisCall.text()
            let qrisRes;
            try {
                qrisRes = JSON.parse(rawResponse)
            } catch (e) {
                 throw new Error(`Invalid Gateway Response (HTTP ${qrisCall.status}):\n<code>${rawResponse.substring(0, 150)}</code>`)
            }

            if (qrisCall.ok && (qrisRes.status === 'success' || qrisRes.paylink || qrisRes.qris_url || qrisRes.raw_qris)) {
                const finalUrl = qrisRes.paylink || qrisRes.qris_url || qrisRes.checkout_url || qrisRes.data?.qris_url;
                const rawQris = qrisRes.raw_qris || qrisRes.data?.raw_qris;
                
                const qrImageUrl = rawQris ? `https://quickchart.io/qr?text=${encodeURIComponent(rawQris)}&size=300&margin=2` : null;
                await c.env.DB.prepare(`UPDATE deposits SET qris_url = ?, webhook_url = ? WHERE order_id = ?`).bind(finalUrl || qrImageUrl || '', finalWebhookUrl, orderId).run()

                const successText = `✅ <b>INVOICE DIBUAT</b>\n\n`+
                                    `<b>Order ID:</b> <code>${orderId}</code>\n`+
                                    `<b>Nominal:</b> Rp ${amount.toLocaleString('id-ID')}\n\n`+
                                    `📸 <b>Instruksi Pembayaran:</b>\n`+
                                    `Silakan screenshot atau simpan gambar QRIS ini, lalu scan menggunakan aplikasi e-wallet (DANA, GoPay, ShopeePay, OVO) atau Mobile Banking Anda.\n\n`+
                                    `⏳ Saldo otomatis masuk 1-2 detik setelah lunas.`;

                const inline_keyboard = [];
                if (finalUrl) inline_keyboard.push([{ text: "💳 Buka Halaman Bayar", url: finalUrl }]);
                const payBtn = { inline_keyboard };

                if (qrImageUrl) {
                    await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            photo: qrImageUrl,
                            caption: successText,
                            reply_markup: inline_keyboard.length > 0 ? payBtn : undefined,
                            parse_mode: 'HTML'
                        })
                    });
                } else {
                    await sendTelegramMessage(botToken, chatId, successText, inline_keyboard.length > 0 ? payBtn : undefined);
                }

            } else {
                await c.env.DB.prepare("UPDATE deposits SET status = 'failed' WHERE order_id = ?").bind(orderId).run()
                const errMsg = qrisRes.error || qrisRes.message || JSON.stringify(qrisRes)
                await sendTelegramMessage(botToken, chatId, `❌ <b>Gagal dari Gateway:</b>\n<code>${errMsg}</code>`)
            }
        } catch (err: any) {
            await sendTelegramMessage(botToken, chatId, `❌ <b>Error:</b>\n<code>${err.message}</code>`)
        }
        
        return c.text('OK')
    }

    return c.text('OK')
})
