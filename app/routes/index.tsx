import { createRoute } from 'honox/factory'
import { Sidebar } from '../components/Sidebar'

async function getDashboardStats(db: D1Database) {
    const usersCount = await db.prepare("SELECT COUNT(*) as total FROM telegram_users").first<{total: number}>()
    const totalBalance = await db.prepare("SELECT SUM(balance) as total FROM telegram_users").first<{total: number}>()
    const totalProfit = await db.prepare("SELECT SUM(markup_applied) as total FROM transactions WHERE status = 'success'").first<{total: number}>()
    
    return {
        users: usersCount?.total || 0,
        balance: totalBalance?.total || 0,
        profit: totalProfit?.total || 0
    }
}

export default createRoute(async (c) => {
    const db = c.env.DB as D1Database
    const stats = await getDashboardStats(db)

    return c.render(
        <div class="flex flex-col md:flex-row h-screen bg-gray-100 font-sans overflow-hidden">
            <Sidebar activePath="/" />

            <main class="flex-1 p-4 md:p-10 overflow-y-auto w-full">
                <h1 class="text-2xl md:text-3xl font-extrabold text-gray-800 mb-6 md:mb-8">Ikhtisar Sistem</h1>
                
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-8 md:mb-10">
                    <div class="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-gray-200">
                        <h2 class="text-xs md:text-sm text-gray-500 font-semibold mb-2">Total Pengguna Bot</h2>
                        <p class="text-2xl md:text-4xl font-black text-[#0d5fa3]">{stats.users}</p>
                    </div>
                    <div class="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-gray-200">
                        <h2 class="text-xs md:text-sm text-gray-500 font-semibold mb-2">Total Dana Tersimpan (Rp)</h2>
                        <p class="text-2xl md:text-4xl font-black text-green-600">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(stats.balance)}
                        </p>
                    </div>
                    <div class="bg-white rounded-2xl p-5 md:p-6 shadow-sm border border-gray-200 sm:col-span-2 md:col-span-1">
                        <h2 class="text-xs md:text-sm text-gray-500 font-semibold mb-2">Keuntungan Margin (Rp)</h2>
                        <p class="text-2xl md:text-4xl font-black text-purple-600">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(stats.profit)}
                        </p>
                    </div>
                </div>

                <div class="bg-blue-50 border-l-4 border-[#1d8eed] p-4 md:p-5 rounded-r-xl">
                    <h3 class="text-sm md:text-base font-bold text-[#0d5fa3] mb-1">Status Keamanan Sistem: AMAN</h3>
                    <p class="text-xs md:text-sm text-blue-900 leading-relaxed">Sistem menggunakan eksekusi <i>Atomic Database Update</i> (D1) untuk mencegah kebocoran saldo akibat eksekusi ganda (race condition) saat proses /beli dari user.</p>
                </div>
            </main>
        </div>
    )
})
