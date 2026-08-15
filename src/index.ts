import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { apiRouter } from './api'
import { verifyToken } from './utils/security'

// Import handler untuk frontend HonoX
import { createApp } from 'honox/server'

const app = new Hono<{ Bindings: { DB: D1Database, JWT_SECRET: string }, Variables: { jwtPayload: any } }>()

// Middleware Global Proteksi Autentikasi JWT (HS256) & Cookie
app.use('*', async (c, next) => {
    const path = c.req.path
    
    // Bypass rute publik: Webhook QRIS, Webhook Telegram, Login Page, Proses Login Auth API, dan Aset Statis
    if (
        path.startsWith('/api/qris/webhook') || 
        path.startsWith('/api/telegram/webhook') || 
        path.startsWith('/api/auth') || 
        path === '/login' ||
        path.startsWith('/static') ||
        path.startsWith('/favicon.ico')
    ) {
        return await next()
    }

    // Ambil token dari Cookie (untuk akses Panel Web SSR) atau Header (jika via curl API)
    let token = getCookie(c, 'admin_session')
    
    if (!token) {
        const authHeader = c.req.header('Authorization')
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1]
        }
    }

    // Blokir jika token tidak ditemukan
    if (!token) {
        if (path.startsWith('/api/')) return c.json({ success: false, error: 'Unauthorized, Token Missing' }, 401)
        return c.redirect('/login')
    }

    try {
        // Verifikasi JWT (fungsi di utils akan memaksa algoritma HS256)
        const decoded = await verifyToken(token, c.env.JWT_SECRET)
        c.set('jwtPayload', decoded)
        await next()
    } catch (error) {
        // Jika token tidak valid / kadaluarsa (manipulasi HS256 akan terdeteksi di sini)
        if (path.startsWith('/api/')) return c.json({ success: false, error: 'Token Invalid atau Expired' }, 401)
        return c.redirect('/login')
    }
})

// 1. Mount API Backend di jalur /api/
app.route('/api', apiRouter)

// 2. Mount HonoX Frontend untuk sisanya
const frontendApp = createApp()
app.route('/', frontendApp)

export default app
