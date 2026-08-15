import { createRoute } from 'honox/factory'
import { Sidebar } from '../../components/Sidebar'

export const POST = createRoute(async (c) => {
    const db = c.env.DB as D1Database
    const body = await c.req.parseBody()
    const action = body['action']

    if (action === 'delete') {
        const id = body['id']
        await db.prepare("DELETE FROM markup_rules WHERE id = ?").bind(id).run()
    } else if (action === 'add') {
        const rule_type = body['rule_type']
        const target_id = body['target_id']
        const markup_percent = parseFloat(body['markup_percent'] as string)
        const markup_flat = parseFloat(body['markup_flat'] as string)

        await db.prepare(`
            INSERT INTO markup_rules (rule_type, target_id, markup_percent, markup_flat)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(rule_type, target_id) 
            DO UPDATE SET markup_percent = ?, markup_flat = ?, updated_at = CURRENT_TIMESTAMP
        `).bind(rule_type, target_id, markup_percent, markup_flat, markup_percent, markup_flat).run()
    } else if (action === 'update_global') {
        const percent = body['global_percent']
        const flat = body['global_flat']
        await db.prepare("UPDATE panel_configs SET config_value = ? WHERE config_key = 'markup_global_percent'").bind(percent).run()
        await db.prepare("UPDATE panel_configs SET config_value = ? WHERE config_key = 'markup_global_flat'").bind(flat).run()
    }

    return c.redirect('/markups')
})

export default createRoute(async (c) => {
    const db = c.env.DB as D1Database
    
    const globals = await db.prepare("SELECT config_key, config_value FROM panel_configs WHERE config_key IN ('markup_global_percent', 'markup_global_flat')").all<{config_key: string, config_value: string}>()
    const globalPercent = globals.results?.find(g => g.config_key === 'markup_global_percent')?.config_value || '0'
    const globalFlat = globals.results?.find(g => g.config_key === 'markup_global_flat')?.config_value || '0'

    // Ambil Rules
    const rules = await db.prepare("SELECT * FROM markup_rules ORDER BY rule_type, target_id").all<{id: number, rule_type: string, target_id: string, markup_percent: number, markup_flat: number}>()

    // Ambil Data Katalog yang telah disinkronkan untuk Form Dropdown
    const services = await db.prepare("SELECT * FROM nokos_services").all<{code: string, name: string}>()
    const countries = await db.prepare("SELECT * FROM nokos_countries").all<{id: number, name: string, prefix: string}>()

    return c.render(
        <div class="flex flex-col md:flex-row h-screen bg-gray-100 font-sans overflow-hidden">
            <Sidebar activePath="/markups" />
            
            <main class="flex-1 p-4 md:p-10 overflow-y-auto w-full">
                <h1 class="text-2xl md:text-3xl font-extrabold text-gray-800 mb-2">Harga & Margin Keuntungan</h1>
                <p class="text-sm md:text-base text-gray-500 mb-6 md:mb-8">Atur keuntungan global, atau override margin untuk negara/layanan tertentu.</p>
                
                <form method="POST" class="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 md:p-6 mb-8 flex flex-col md:flex-row items-start md:items-end gap-4">
                    <input type="hidden" name="action" value="update_global" />
                    <div class="w-full md:flex-1">
                        <label class="block text-sm font-bold text-gray-700 mb-1">Global Persentase (%)</label>
                        <input type="number" step="0.01" name="global_percent" value={globalPercent} class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" required />
                    </div>
                    <div class="w-full md:flex-1">
                        <label class="block text-sm font-bold text-gray-700 mb-1">Global Flat (Rp)</label>
                        <input type="number" name="global_flat" value={globalFlat} class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" required />
                    </div>
                    <div class="w-full md:w-auto mt-2 md:mt-0">
                        <button type="submit" class="w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-2 px-6 rounded-lg">Simpan Global</button>
                    </div>
                </form>

                <h2 class="text-lg md:text-xl font-bold text-gray-800 mb-4">Tambah Aturan Override</h2>
                <form method="POST" class="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 md:p-6 mb-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-start md:items-end">
                    <input type="hidden" name="action" value="add" />
                    
                    <div class="sm:col-span-2 md:col-span-1">
                        <label class="block text-sm font-bold text-gray-700 mb-1">Tipe Aturan</label>
                        <select id="rule_type" name="rule_type" class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none bg-white">
                            <option value="service">Per Layanan</option>
                            <option value="country">Per Negara</option>
                            <option value="unit">Produk Spesifik (Srv+Cty)</option>
                        </select>
                    </div>

                    <div class="sm:col-span-2 md:col-span-1 relative">
                        <label class="block text-sm font-bold text-gray-700 mb-1">Pilih Target</label>
                        <input type="hidden" id="target_id_hidden" name="target_id" required />
                        
                        {/* Selector Dinamis via JS Native */}
                        <select id="selector_service" class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none bg-white">
                            {services.results?.map(s => <option value={s.code}>{s.name} ({s.code})</option>)}
                        </select>
                        <select id="selector_country" class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none bg-white hidden">
                            {countries.results?.map(c => <option value={c.id.toString()}>{c.name} ({c.id})</option>)}
                        </select>
                        <input type="text" id="selector_unit" placeholder="Cth: wa_6" class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none hidden" />
                    </div>

                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">Persen (%)</label>
                        <input type="number" step="0.01" name="markup_percent" defaultValue="0" class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" required />
                    </div>
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-1">Flat (Rp)</label>
                        <input type="number" name="markup_flat" defaultValue="0" class="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none" required />
                    </div>
                    <div class="sm:col-span-2 md:col-span-1 mt-2 md:mt-0">
                        <button type="submit" class="w-full bg-[#0d5fa3] hover:bg-[#1d8eed] text-white font-bold py-2 rounded-lg" onclick="setTargetId()">Tambah</button>
                    </div>
                </form>

                <div class="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto w-full">
                    <table class="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                            <tr class="bg-gray-50 border-b border-gray-200 text-xs md:text-sm text-gray-500 uppercase tracking-wider">
                                <th class="p-3 md:p-4 font-bold">Tipe</th>
                                <th class="p-3 md:p-4 font-bold">Target ID</th>
                                <th class="p-3 md:p-4 font-bold">Margin (%)</th>
                                <th class="p-3 md:p-4 font-bold">Margin Flat (Rp)</th>
                                <th class="p-3 md:p-4 font-bold text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 text-sm">
                            {rules.results?.map(rule => (
                                <tr class="hover:bg-gray-50">
                                    <td class="p-3 md:p-4 font-semibold text-gray-700 uppercase">{rule.rule_type}</td>
                                    <td class="p-3 md:p-4 font-mono text-blue-600">{rule.target_id}</td>
                                    <td class="p-3 md:p-4">{rule.markup_percent}%</td>
                                    <td class="p-3 md:p-4">Rp {rule.markup_flat}</td>
                                    <td class="p-3 md:p-4 text-right">
                                        <form method="POST" class="inline">
                                            <input type="hidden" name="action" value="delete" />
                                            <input type="hidden" name="id" value={rule.id.toString()} />
                                            <button type="submit" class="text-red-500 hover:text-red-700 font-bold text-xs md:text-sm px-3 py-1 bg-red-50 rounded">Hapus</button>
                                        </form>
                                    </td>
                                </tr>
                            ))}
                            {(!rules.results || rules.results.length === 0) && (
                                <tr>
                                    <td colSpan={5} class="p-6 md:p-8 text-center text-gray-400 text-sm">Belum ada aturan override spesifik. Sistem mengikuti Harga Global.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <script dangerouslySetInnerHTML={{__html: `
                    const ruleType = document.getElementById('rule_type');
                    const selSrv = document.getElementById('selector_service');
                    const selCty = document.getElementById('selector_country');
                    const selUnit = document.getElementById('selector_unit');
                    const hiddenTarget = document.getElementById('target_id_hidden');

                    ruleType.addEventListener('change', (e) => {
                        selSrv.classList.add('hidden');
                        selCty.classList.add('hidden');
                        selUnit.classList.add('hidden');
                        
                        if(e.target.value === 'service') selSrv.classList.remove('hidden');
                        else if(e.target.value === 'country') selCty.classList.remove('hidden');
                        else selUnit.classList.remove('hidden');
                    });

                    function setTargetId() {
                        if (ruleType.value === 'service') hiddenTarget.value = selSrv.value;
                        else if (ruleType.value === 'country') hiddenTarget.value = selCty.value;
                        else hiddenTarget.value = selUnit.value;
                    }
                `}} />
            </main>
        </div>
    )
})
