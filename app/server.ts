import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { createApiRouter } from '../src/api/index'
import { verifyToken } from '../src/utils/security'
import { createApp } from 'honox/server'

const baseApp = new Hono<{ Bindings: { DB: D1Database, JWT_SECRET: string }, Variables: { jwtPayload: any } }>()

// Middleware Global Proteksi Autentikasi JWT (HS256) & Cookie
baseApp.use('*', async (c, next) => {
    const path = c.req.path
    
    // Bypass rute publik
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
        // Verifikasi JWT (algoritma HS256)
        const decoded = await verifyToken(token, c.env.JWT_SECRET)
        c.set('jwtPayload', decoded)
        await next()
    } catch (error) {
        if (path.startsWith('/api/')) return c.json({ success: false, error: 'Token Invalid atau Expired' }, 401)
        return c.redirect('/login')
    }
})

// 1. Mount API Backend dengan memanggil function pencipta router
baseApp.route('/api', createApiRouter())

// 2. Gabungkan baseApp ke dalam HonoX createApp
const app = createApp({ app: baseApp })

export default app
