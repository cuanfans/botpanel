import type { FC } from 'hono/jsx'

export const Sidebar: FC<{ activePath: string }> = ({ activePath }) => {
    const menus = [
        { name: 'Dashboard', path: '/' },
        { name: 'Pengaturan Bot', path: '/settings' },
        { name: 'Harga & Margin', path: '/markups' },
        { name: 'Data User', path: '/users' },
        { name: 'Laporan Penjualan', path: '/transactions' }
    ]

    return (
        <aside class="w-64 bg-[#0d5fa3] text-white flex flex-col shadow-xl min-h-screen">
            <div class="p-6 text-2xl font-bold border-b border-blue-800">
                BotPanel PRO
            </div>
            <nav class="flex-1 p-4 space-y-2">
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
            <div class="p-4 text-xs text-blue-300 border-t border-blue-800 text-center">
                Sistem Relay v1.0 &copy; 2026
            </div>
        </aside>
    )
}
