import { Hono } from 'hono'

export const adminRouter = new Hono<{ Bindings: { DB: D1Database } }>()

// 1. Dapatkan Semua Konfigurasi Panel
adminRouter.get('/configs', async (c) => {
    const configs = await c.env.DB.prepare("SELECT * FROM panel_configs").all()
    return c.json({ success: true, data: configs.results })
})

// 2. Update Konfigurasi Panel
adminRouter.post('/configs', async (c) => {
    const { config_key, config_value } = await c.req.json()
    await c.env.DB.prepare(
        "UPDATE panel_configs SET config_value = ?, updated_at = CURRENT_TIMESTAMP WHERE config_key = ?"
    ).bind(config_value, config_key).run()
    return c.json({ success: true, message: "Konfigurasi diperbarui" })
})

// 3. Dapatkan Aturan Markup
adminRouter.get('/markups', async (c) => {
    const markups = await c.env.DB.prepare("SELECT * FROM markup_rules ORDER BY rule_type, target_id").all()
    return c.json({ success: true, data: markups.results })
})

// 4. Tambah / Edit Aturan Markup
adminRouter.post('/markups', async (c) => {
    const { rule_type, target_id, markup_percent, markup_flat } = await c.req.json()
    await c.env.DB.prepare(`
        INSERT INTO markup_rules (rule_type, target_id, markup_percent, markup_flat)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(rule_type, target_id) 
        DO UPDATE SET markup_percent = ?, markup_flat = ?, updated_at = CURRENT_TIMESTAMP
    `).bind(rule_type, target_id, markup_percent, markup_flat, markup_percent, markup_flat).run()
    return c.json({ success: true, message: "Aturan markup disimpan" })
})

// 5. Hapus Aturan Markup
adminRouter.delete('/markups/:id', async (c) => {
    const id = c.req.param('id')
    await c.env.DB.prepare("DELETE FROM markup_rules WHERE id = ?").bind(id).run()
    return c.json({ success: true, message: "Aturan dihapus" })
})

// 6. Lihat Data Pengguna Telegram
adminRouter.get('/users', async (c) => {
    const users = await c.env.DB.prepare("SELECT * FROM telegram_users ORDER BY balance DESC LIMIT 100").all()
    return c.json({ success: true, data: users.results })
})

// 7. Lihat Laporan Transaksi
adminRouter.get('/transactions', async (c) => {
    const tx = await c.env.DB.prepare("SELECT * FROM transactions ORDER BY created_at DESC LIMIT 500").all()
    return c.json({ success: true, data: tx.results })
})

// 8. Lihat Laporan Deposit QRIS
adminRouter.get('/deposits', async (c) => {
    const deps = await c.env.DB.prepare("SELECT * FROM deposits ORDER BY created_at DESC LIMIT 500").all()
    return c.json({ success: true, data: deps.results })
})
