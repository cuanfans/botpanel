import type { Context } from 'hono'
import { Sidebar } from '../../components/Sidebar'

export default async function Transactions(c: Context) {
    const db = c.env.DB as D1Database
    
    // Join transaksi dengan user untuk menampilkan username, ambil 100 terakhir
    const query = `
        SELECT t.transaction_id, t.telegram_id, u.username, t.service_code, t.country_code, 
               t.provider_cost, t.markup_applied, t.final_price, t.status, t.created_at 
        FROM transactions t
        LEFT JOIN telegram_users u ON t.telegram_id = u.telegram_id
        ORDER BY t.created_at DESC LIMIT 100
    `
    const txRaw = await db.prepare(query).all<{
        transaction_id: string, telegram_id: string, username: string,
        service_code: string, country_code: string, provider_cost: number, 
        markup_applied: number, final_price: number, status: string, created_at: string
    }>()

    return (
        <div class="flex h-screen bg-gray-100 font-sans overflow-hidden">
            <Sidebar activePath="/transactions" />
            
            <main class="flex-1 p-10 overflow-y-auto">
                <h1 class="text-3xl font-extrabold text-gray-800 mb-2">Laporan Penjualan</h1>
                <p class="text-gray-500 mb-8">Riwayat 100 transaksi terakhir yang berhasil maupun gagal.</p>

                <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto">
                    <table class="w-full text-left border-collapse whitespace-nowrap">
                        <thead>
                            <tr class="bg-gray-50 border-b border-gray-200 text-sm text-gray-500 uppercase tracking-wider">
                                <th class="p-4 font-bold">Waktu</th>
                                <th class="p-4 font-bold">User</th>
                                <th class="p-4 font-bold">Item (Srv_Ct)</th>
                                <th class="p-4 font-bold text-right">Modal Nokos</th>
                                <th class="p-4 font-bold text-right text-purple-600">Margin/Untung</th>
                                <th class="p-4 font-bold text-right text-blue-600">Potong Saldo</th>
                                <th class="p-4 font-bold">Status</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 text-sm">
                            {txRaw.results?.map(tx => (
                                <tr class="hover:bg-gray-50">
                                    <td class="p-4 text-gray-500">{new Date(tx.created_at).toLocaleString('id-ID')}</td>
                                    <td class="p-4">
                                        <div class="font-semibold text-gray-800">@{tx.username || 'unknown'}</div>
                                        <div class="text-xs text-gray-400 font-mono">{tx.telegram_id}</div>
                                    </td>
                                    <td class="p-4 font-mono font-bold text-gray-700">{tx.service_code}_{tx.country_code}</td>
                                    <td class="p-4 text-right text-gray-600">Rp {tx.provider_cost}</td>
                                    <td class="p-4 text-right font-bold text-purple-600">+Rp {tx.markup_applied}</td>
                                    <td class="p-4 text-right font-bold text-[#0d5fa3]">Rp {tx.final_price}</td>
                                    <td class="p-4">
                                        <span class={`px-2 py-1 text-xs font-bold rounded-full ${
                                            tx.status === 'success' ? 'bg-green-100 text-green-700' : 
                                            tx.status === 'failed' ? 'bg-red-100 text-red-700' : 
                                            'bg-yellow-100 text-yellow-700'
                                        }`}>
                                            {tx.status.toUpperCase()}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {(!txRaw.results || txRaw.results.length === 0) && (
                                <tr>
                                    <td colSpan={7} class="p-8 text-center text-gray-400">Belum ada riwayat transaksi.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    )
}
