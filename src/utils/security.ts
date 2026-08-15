import { sign, verify } from 'hono/jwt'

// Memastikan enkripsi secara eksplisit menggunakan algoritma HS256
export async function generateToken(payload: object, secret: string): Promise<string> {
    return await sign(payload, secret, 'HS256')
}

export async function verifyToken(token: string, secret: string): Promise<any> {
    return await verify(token, secret, 'HS256')
}

// Hashing password dengan WebCrypto API (SHA-256) agar sesuai dengan seed database
export async function hashPassword(password: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
