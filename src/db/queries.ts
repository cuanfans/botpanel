export async function atomicPurchase(
    db: D1Database, 
    telegramId: string, 
    finalPrice: number, 
    serviceCode: string, 
    countryCode: string, 
    trxId: string
) {
    // 1. UPDATE atomik yang hanya akan berhasil BILA balance >= finalPrice
    const deduction = await db.prepare(`
        UPDATE telegram_users 
        SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ? AND balance >= ?
    `).bind(finalPrice, telegramId, finalPrice).run();

    // 2. Cek apakah row berhasil diperbarui (jika 0, artinya saldo kurang atau user tidak ada)
    if (deduction.meta.changes === 0) {
        throw new Error("Saldo tidak mencukupi atau transaksi gagal");
    }

    // 3. Jika berhasil potong, insert riwayat transaksi
    await db.prepare(`
        INSERT INTO transactions (transaction_id, telegram_id, service_code, country_code, provider_cost, markup_applied, final_price, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'processing')
    `).bind(trxId, telegramId, serviceCode, countryCode, 0, 0, finalPrice).run(); 
    
    return true;
}
