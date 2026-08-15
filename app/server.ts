import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { apiRouter } from '../src/api/index'
import { verifyToken } from '../src/utils/security'
import { createApp } from 'honox/server'

// 1. Inisialisasi Base App dan Middleware
const baseApp = new Hono<{ Bindings: { DB: D1Database, JWT_SECRET: string }, Variables: { jwtPayload: any } }>()

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

    let token = getCookie(c, 'admin_session')
    if (!token) {
        const authHeader = c.req.header('Authorization')
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1]
        }
    }

    if (!token) {
        if (path.startsWith('/api/')) return c.json({ success: false, error: 'Unauthorized, Token Missing' }, 401)
        return c.redirect('/login')
    }

    try {
        const decoded = await verifyToken(token, c.env.JWT_SECRET)
        c.set('jwtPayload', decoded)
        await next()
    } catch (error) {
        if (path.startsWith('/api/')) return c.json({ success: false, error: 'Token Invalid atau Expired' }, 401)
        return c.redirect('/login')
    }
})

// 2. Pasang API routes DI DALAM baseApp
baseApp.route('/api', apiRouter)

// 3. Gabungkan baseApp ke dalam HonoX createApp (Solusi untuk mengatasi error Spread Syntax)
const app = createApp({ app: baseApp })

export default app
