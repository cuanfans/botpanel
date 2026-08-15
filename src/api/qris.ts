import { Hono } from 'hono'
import { verifyQrisSignature } from '../utils/hmac'

export const qrisRouter = new Hono<{ Bindings: { DB: D1Database } }>()

// Webhook untuk menerima notifikasi dari Gateway QRIS
qrisRouter.post('/webhook', async (c) => {
    const payloadText = await c.req.text()
    const signatureHeader = c.req.header('X-Signature') || ''
    
    // Ambil Secret Key dari konfigurasi D1
    const config = await c.env.DB.prepare(
        "SELECT config_value FROM panel_configs WHERE config_key = 'qris_api_key'"
    ).first<{ config_value: string }>()

    if (!config || !config.config_value) {
        return c.json({ error: "Sistem belum dikonfigurasi" }, 500)
    }

    const isValid = await verifyQrisSignature(payloadText, signatureHeader, config.config_value)
    
    if (!isValid) {
        return c.json({ error: "WEBHOOK INVALID - Akses ditolak!" }, 403)
    }

    try {
        const data = JSON.parse(payloadText)
        
        // Cek status transaksi
        if (data.transaction_status === 'settlement') {
            const orderId = data.order_id
            
            // 1. Dapatkan data deposit pending (Atomik cek)
            const deposit = await c.env.DB.prepare(
                "SELECT * FROM deposits WHERE order_id = ? AND status = 'pending'"
            ).bind(orderId).first<{ telegram_id: string, amount: number }>()

            if (deposit) {
                // 2. Eksekusi Batch untuk memastikan konsistensi (Update Deposit & Tambah Saldo)
                const batch = await c.env.DB.batch([
                    c.env.DB.prepare("UPDATE deposits SET status = 'settlement', updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND status = 'pending'").bind(orderId),
                    c.env.DB.prepare("UPDATE telegram_users SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?").bind(deposit.amount, deposit.telegram_id)
                ])
                
                // Verifikasi batch berhasil
                if (batch[0].meta.changes > 0 && batch[1].meta.changes > 0) {
                    // Berhasil update
                    return c.json({ message: "WEBHOOK VALID - Saldo ditambahkan" }, 200)
                }
            }
        }
        
        return c.json({ message: "WEBHOOK VALID - Tidak ada tindakan diperlukan" }, 200)
    } catch (e) {
        return c.json({ error: "Payload tidak valid" }, 400)
    }
})

// Endpoint internal untuk membuat invoice QRIS (Dipanggil oleh bot telegram)
qrisRouter.post('/create-invoice', async (c) => {
    const body = await c.req.json()
    const { telegram_id, amount } = body

    if (amount < 5000 || amount > 499999) {
        return c.json({ error: "Deposit harus antara 5.000 dan 499.999" }, 400)
    }

    const orderId = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    
    try {
        // Simpan data pending ke database
        await c.env.DB.prepare(`
            INSERT INTO deposits (order_id, telegram_id, amount, status)
            VALUES (?, ?, ?, 'pending')
        `).bind(orderId, telegram_id, amount).run()

        // TODO: Lakukan HTTP POST ke endpoint Eksternal Pembuat QRIS sesuai base URL penyedia
        // Contoh return sementara
        return c.json({ 
            success: true, 
            order_id: orderId,
            amount: amount,
            message: "Invoice berhasil dibuat"
        })
    } catch (error) {
        return c.json({ error: "Terjadi kesalahan sistem" }, 500)
    }
})
