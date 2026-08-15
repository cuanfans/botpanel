import { Hono } from 'hono'

export const qrisRouter = new Hono<{ Bindings: { DB: D1Database } }>()

// Endpoint yang akan "ditembak" oleh server QRIS saat ada pembayaran masuk
qrisRouter.post('/webhook', async (c) => {
    try {
        const body = await c.req.json()
        
        // Umumnya gateway QRIS mengirimkan parameter order_id, status, dan amount
        const order_id = body.order_id || body.reference_id || body.invoice_id
        const status = body.status || body.transaction_status
        const amount = Number(body.amount || body.gross_amount || 0)

        if (!order_id || !status) {
            return c.json({ success: false, error: "Invalid webhook payload format" }, 400)
        }

        // Ambil token bot untuk mengirim notifikasi sukses ke user
        const configRaw = await c.env.DB.prepare("SELECT config_value FROM panel_configs WHERE config_key = 'bot_token'").first<{config_value: string}>()
        const botToken = configRaw?.config_value

        const statusLower = String(status).toLowerCase()

        // 1. JIKA PEMBAYARAN BERHASIL (Gateway biasanya mengirim 'success', 'settlement', atau 'paid')
        if (['success', 'settlement', 'paid'].includes(statusLower)) {
            // Cari data deposit berdasarkan order_id yang statusnya MASIH 'pending'
            // (Mencegah double-claim jika gateway mengirim webhook berulang kali)
            const deposit = await c.env.DB.prepare("SELECT id, telegram_id, amount FROM deposits WHERE order_id = ? AND status = 'pending'").bind(order_id).first<{id: number, telegram_id: string, amount: number}>()
            
            if (deposit) {
                // Eksekusi Atomik D1 (Update status menjadi settlement)
                const updateDepo = await c.env.DB.prepare("UPDATE deposits SET status = 'settlement', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(deposit.id).run()
                
                if (updateDepo.meta.changes > 0) {
                    // Tambahkan saldo langsung ke user
                    await c.env.DB.prepare("UPDATE telegram_users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?").bind(deposit.amount, deposit.telegram_id).run()
                    
                    // Kirim Notifikasi Telegram ke User
                    if (botToken) {
                        const successText = `🎉 <b>DEPOSIT BERHASIL!</b>\n\n` +
                                            `<b>Order ID:</b> <code>${order_id}</code>\n` +
                                            `<b>Nominal Masuk:</b> Rp ${deposit.amount.toLocaleString('id-ID')}\n\n` +
                                            `Saldo telah ditambahkan ke akun Anda. Silakan ketik /start untuk mengecek saldo terbaru atau /order untuk membeli layanan.`;
                        
                        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: deposit.telegram_id,
                                text: successText,
                                parse_mode: 'HTML'
                            })
                        }).catch(() => {}) // Abaikan error jika bot diblokir user
                    }
                }
            }
        } 
        // 2. JIKA PEMBAYARAN KADALUARSA ATAU GAGAL
        else if (['expired', 'failed', 'cancel', 'deny'].includes(statusLower)) {
            const deposit = await c.env.DB.prepare("SELECT id FROM deposits WHERE order_id = ? AND status = 'pending'").bind(order_id).first<{id: number}>()
            if (deposit) {
                await c.env.DB.prepare("UPDATE deposits SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(statusLower === 'expired' ? 'expired' : 'failed', deposit.id).run()
            }
        }

        // Gateway QRIS mewajibkan kita membalas HTTP 200 agar mereka berhenti melakukan retry ping webhook
        return c.json({ success: true, message: "Webhook successfully processed" }, 200)

    } catch (err: any) {
        console.error("Webhook Error Processing:", err.message)
        return c.json({ success: false, error: err.message }, 500)
    }
})
