import { css } from 'hono/css'
import type { Context } from 'hono'

// Fungsi SSR untuk mengambil data langsung dari D1 Binding
async function getDashboardStats(c: Context) {
    const db = c.env.DB as D1Database
    
    // Gunakan query terpisah atau BATCH untuk efisiensi
    const usersCount = await db.prepare("SELECT COUNT(*) as total FROM telegram_users").first<{total: number}>()
    const totalBalance = await db.prepare("SELECT SUM(balance) as total FROM telegram_users").first<{total: number}>()
    const totalProfit = await db.prepare("SELECT SUM(markup_applied) as total FROM transactions WHERE status = 'success'").first<{total: number}>()
    
    return {
        users: usersCount?.total || 0,
        balance: totalBalance?.total || 0,
        profit: totalProfit?.total || 0
    }
}

export default async function Dashboard(c: Context) {
    // Jalankan operasi server-side
    const stats = await getDashboardStats(c)

    // Render ke HTML murni di sisi Server
    return (
        <div class="flex h-screen bg-gray-100 font-sans">
            {/* Sidebar (Bisa dipisah ke app/components/Sidebar.tsx) */}
            <aside class="w-64 bg-[#0d5fa3] text-white flex flex-col shadow-xl">
                <div class="p-6 text-2xl font-bold border-b border-blue-800">
                    BotPanel PRO
                </div>
                <nav class="flex-1 p-4 space-y-2">
                    <a href="/" class="block px-4 py-3 bg-[#1d8eed] rounded-lg font-semibold">Dashboard</a>
                    <a href="/settings" class="block px-4 py-3 hover:bg-blue-800 rounded-lg transition-colors">Pengaturan Bot</a>
                    <a href="/markups" class="block px-4 py-3 hover:bg-blue-800 rounded-lg transition-colors">Harga & Margin</a>
                    <a href="/users" class="block px-4 py-3 hover:bg-blue-800 rounded-lg transition-colors">Data User</a>
                    <a href="/transactions" class="block px-4 py-3 hover:bg-blue-800 rounded-lg transition-colors">Laporan Penjualan</a>
                </nav>
            </aside>

            {/* Konten Utama */}
            <main class="flex-1 p-10 overflow-y-auto">
                <h1 class="text-3xl font-extrabold text-gray-800 mb-8">Ikhtisar Sistem</h1>
                
                {/* Statistik Cards */}
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                        <h2 class="text-gray-500 font-semibold mb-2">Total Pengguna Bot</h2>
                        <p class="text-4xl font-black text-[#0d5fa3]">{stats.users}</p>
                    </div>
                    <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                        <h2 class="text-gray-500 font-semibold mb-2">Total Dana Tersimpan (Rp)</h2>
                        <p class="text-4xl font-black text-green-600">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(stats.balance)}
                        </p>
                    </div>
                    <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
                        <h2 class="text-gray-500 font-semibold mb-2">Total Keuntungan Margin (Rp)</h2>
                        <p class="text-4xl font-black text-purple-600">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(stats.profit)}
                        </p>
                    </div>
                </div>

                {/* Sekilas Info Keamanan */}
                <div class="bg-blue-50 border-l-4 border-[#1d8eed] p-5 rounded-r-xl">
                    <h3 class="font-bold text-[#0d5fa3] mb-1">Status Keamanan Sistem: AMAN</h3>
                    <p class="text-sm text-blue-900">Sistem menggunakan eksekusi <i>Atomic Database Update</i> (D1) untuk mencegah kebocoran saldo akibat eksekusi ganda (race condition) saat proses /beli dari user.</p>
                </div>
            </main>
        </div>
    )
}
