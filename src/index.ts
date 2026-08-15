import { Hono } from 'hono'
import { apiRouter } from './api'

// Import handler untuk frontend HonoX
import { createApp } from 'honox/server'

const app = new Hono<{ Bindings: { DB: D1Database } }>()

// 1. Mount API Backend di jalur /api/
app.route('/api', apiRouter)

// 2. Mount HonoX Frontend untuk sisanya
const frontendApp = createApp()
app.route('/', frontendApp)

export default app
