import type { Context } from 'hono'
import { Sidebar } from '../../components/Sidebar'

export default async function Users(c: Context) {
    const db = c.env.DB as D1Database
    
    // Ambil data users diurutkan dari saldo terbanyak
    const usersRaw = await db.prepare(
        "SELECT telegram_id, username, balance, created_at FROM telegram_users ORDER BY balance DESC LIMIT 100"
    ).all<{telegram_id: string, username: string, balance: number, created_at: string}>()

    return (
        <div class="flex h-screen bg-gray-100 font-sans overflow-hidden">
            <Sidebar activePath="/users" />
            
            <main class="flex-1 p-10 overflow-y-auto">
                <h1 class="text-3xl font-extrabold text-gray-800 mb-2">Data Pengguna</h1>
                <p class="text-gray-500 mb-8">Daftar pengguna bot beserta saldo akhir mereka yang dijamin konsisten oleh sistem D1 Atomic.</p>

                <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-gray-50 border-b border-gray-200 text-sm text-gray-500 uppercase tracking-wider">
                                <th class="p-4 font-bold">Telegram ID</th>
                                <th class="p-4 font-bold">Username</th>
                                <th class="p-4 font-bold text-right">Total Saldo</th>
                                <th class="p-4 font-bold">Terdaftar Pada</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            {usersRaw.results?.map(user => (
                                <tr class="hover:bg-gray-50">
                                    <td class="p-4 font-mono text-sm text-gray-600">{user.telegram_id}</td>
                                    <td class="p-4 font-semibold text-gray-800">@{user.username || 'unknown'}</td>
                                    <td class="p-4 text-right font-bold text-green-600">
                                        {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(user.balance)}
                                    </td>
                                    <td class="p-4 text-sm text-gray-500">{new Date(user.created_at).toLocaleString('id-ID')}</td>
                                </tr>
                            ))}
                            {(!usersRaw.results || usersRaw.results.length === 0) && (
                                <tr>
                                    <td colSpan={4} class="p-8 text-center text-gray-400">Belum ada pengguna.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    )
}
