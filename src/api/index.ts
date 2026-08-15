import { Hono } from 'hono'
import { qrisRouter } from './qris'
import { telegramRouter } from './telegram'
import { adminRouter } from './admin'
import { authRouter } from './auth'

export const apiRouter = new Hono<{ Bindings: { DB: D1Database, JWT_SECRET: string } }>()

// Middleware keamanan dasar untuk header API
apiRouter.use('*', async (c, next) => {
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('X-XSS-Protection', '1; mode=block')
    await next()
})

apiRouter.route('/auth', authRouter)
apiRouter.route('/qris', qrisRouter)
apiRouter.route('/telegram', telegramRouter)
apiRouter.route('/admin', adminRouter)

apiRouter.get('/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})
