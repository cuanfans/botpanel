import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { generateToken, hashPassword } from '../utils/security'

export const authRouter = new Hono<{ Bindings: { DB: D1Database, JWT_SECRET: string } }>()

authRouter.post('/login', async (c) => {
    const { username, password } = await c.req.json()

    if (!username || !password) {
        return c.json({ success: false, error: "Username dan password wajib diisi" }, 400)
    }

    const hashedPassword = await hashPassword(password)

    // Cek database
    const user = await c.env.DB.prepare(
        "SELECT id, username, role FROM admin_users WHERE username = ? AND password_hash = ?"
    ).bind(username, hashedPassword).first<{id: number, username: string, role: string}>()

    if (!user) {
        return c.json({ success: false, error: "Kredensial tidak valid atau salah" }, 401)
    }

    // Generate JWT Token (algoritma HS256 ditekankan secara eksplisit di utils)
    const payload = {
        sub: user.id,
        username: user.username,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 12) // Kadaluarsa dalam 12 Jam
    }

    const token = await generateToken(payload, c.env.JWT_SECRET)

    // Set Cookie HTTP-Only untuk sesi HonoX SSR (Sangat aman dari eksploitasi XSS)
    setCookie(c, 'admin_session', token, {
        path: '/',
        secure: true,
        httpOnly: true,
        maxAge: 60 * 60 * 12,
        sameSite: 'Strict'
    })

    return c.json({ success: true, message: "Login berhasil", token })
})

authRouter.post('/logout', async (c) => {
    deleteCookie(c, 'admin_session', { path: '/' })
    return c.json({ success: true, message: "Logout berhasil" })
})
