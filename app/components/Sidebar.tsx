import type { FC } from 'hono/jsx'

export const Sidebar: FC<{ activePath: string }> = ({ activePath }) => {
    const menus = [
        { name: 'Dashboard', path: '/' },
        { name: 'Pengaturan', path: '/settings' },
        { name: 'Harga & Margin', path: '/markups' },
        { name: 'Data User', path: '/users' },
        { name: 'Laporan Penjualan', path: '/transactions' }
    ]

    return (
        <>
            {/* Header Mobile (Hanya tampil di layar kecil) */}
            <div class="md:hidden flex items-center justify-between bg-[#0d5fa3] text-white p-4 shadow-md z-40 relative">
                <div class="text-xl font-bold">BotPanel PRO</div>
                <button onclick="toggleSidebar()" class="p-2 focus:outline-none hover:bg-blue-800 rounded">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                </button>
            </div>

            {/* Overlay Gelap Mobile */}
            <div id="mobile-overlay" onclick="toggleSidebar()" class="fixed inset-0 bg-black bg-opacity-50 z-40 hidden md:hidden transition-opacity"></div>

            {/* Sidebar Utama (Responsive: Fixed di Mobile, Relative di Desktop) */}
            <aside id="mobile-sidebar" class="fixed inset-y-0 left-0 z-50 w-64 bg-[#0d5fa3] text-white flex flex-col shadow-xl min-h-screen transform -translate-x-full transition-transform duration-300 md:relative md:translate-x-0">
                <div class="flex items-center justify-between p-6 border-b border-blue-800">
                    <div class="text-2xl font-bold">BotPanel PRO</div>
                    <button onclick="toggleSidebar()" class="md:hidden text-white focus:outline-none hover:text-gray-300">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
                <nav class="flex-1 p-4 space-y-2 overflow-y-auto">
                    {menus.map((menu) => (
                        <a 
                            href={menu.path} 
                            class={`block px-4 py-3 rounded-lg transition-colors font-semibold ${
                                activePath === menu.path 
                                    ? 'bg-[#1d8eed] shadow-md' 
                                    : 'hover:bg-blue-800'
                            }`}
                        >
                            {menu.name}
                        </a>
                    ))}
                </nav>
                <div class="p-4 border-t border-blue-800">
                    <button onclick="logout()" class="w-full text-left px-4 py-2 text-red-200 hover:text-white hover:bg-red-600 rounded-lg transition font-bold text-sm">
                        Keluar (Logout)
                    </button>
                    <div class="mt-4 text-xs text-blue-300 text-center">
                        Sistem Relay v1.0 &copy; 2026
                    </div>
                </div>
            </aside>
            
            <script dangerouslySetInnerHTML={{__html: `
                function toggleSidebar() {
                    const sidebar = document.getElementById('mobile-sidebar');
                    const overlay = document.getElementById('mobile-overlay');
                    if(sidebar.classList.contains('-translate-x-full')) {
                        sidebar.classList.remove('-translate-x-full');
                        overlay.classList.remove('hidden');
                    } else {
                        sidebar.classList.add('-translate-x-full');
                        overlay.classList.add('hidden');
                    }
                }

                async function logout() {
                    if(confirm('Apakah Anda yakin ingin keluar?')) {
                        try {
                            await fetch('/api/auth/logout', { method: 'POST' });
                            window.location.href = '/login';
                        } catch (err) {
                            console.error('Logout error:', err);
                        }
                    }
                }
            `}} />
        </>
    )
}
