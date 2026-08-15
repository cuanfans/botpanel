export async function calculateFinalPrice(
    db: D1Database, 
    providerCost: number, 
    serviceCode: string, 
    countryCode: string
): Promise<{ finalPrice: number, markupApplied: number }> {
    
    // Ambil semua aturan markup yang relevan dalam satu query untuk efisiensi
    const rules = await db.prepare(`
        SELECT rule_type, target_id, markup_percent, markup_flat 
        FROM markup_rules 
        WHERE rule_type = 'unit' AND target_id = ?
           OR rule_type = 'country' AND target_id = ?
           OR rule_type = 'service' AND target_id = ?
    `).bind(`${countryCode}_${serviceCode}`, countryCode, serviceCode).all<{
        rule_type: string, target_id: string, markup_percent: number, markup_flat: number
    }>()

    let activeRule = null;

    // Evaluasi dari yang paling spesifik
    if (rules.results) {
        const unitRule = rules.results.find(r => r.rule_type === 'unit');
        const countryRule = rules.results.find(r => r.rule_type === 'country');
        const serviceRule = rules.results.find(r => r.rule_type === 'service');

        if (unitRule) activeRule = unitRule;
        else if (countryRule) activeRule = countryRule;
        else if (serviceRule) activeRule = serviceRule;
    }

    let markupPercent = 0;
    let markupFlat = 0;

    if (activeRule) {
        markupPercent = activeRule.markup_percent;
        markupFlat = activeRule.markup_flat;
    } else {
        // Fallback ke Global Setting jika tidak ada rule khusus
        const globalConfigs = await db.prepare(`
            SELECT config_key, config_value FROM panel_configs 
            WHERE config_key IN ('markup_global_percent', 'markup_global_flat')
        `).all<{config_key: string, config_value: string}>();
        
        if (globalConfigs.results) {
            const globalPercent = globalConfigs.results.find(c => c.config_key === 'markup_global_percent');
            const globalFlat = globalConfigs.results.find(c => c.config_key === 'markup_global_flat');
            
            markupPercent = globalPercent ? parseFloat(globalPercent.config_value) : 0;
            markupFlat = globalFlat ? parseFloat(globalFlat.config_value) : 0;
        }
    }

    // Kalkulasi final: Persentase ditambah Flat
    const percentageAmount = (providerCost * markupPercent) / 100;
    const totalMarkup = percentageAmount + markupFlat;
    
    // Pembulatan ke atas (ceiling) agar tidak rugi desimal
    const finalPrice = Math.ceil(providerCost + totalMarkup);

    return {
        finalPrice: finalPrice,
        markupApplied: Math.ceil(totalMarkup)
    }
}
