-- Tabel Admin Panel
CREATE TABLE admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'superadmin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Pengguna Telegram (Bot Users)
CREATE TABLE telegram_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL UNIQUE,
    username TEXT,
    balance REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Konfigurasi Panel (Pengaturan Global & Bot)
CREATE TABLE panel_configs (
    config_key TEXT PRIMARY KEY,
    config_value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Inisialisasi Konfigurasi Wajib
INSERT INTO panel_configs (config_key, config_value, description) VALUES 
('bot_token', '', 'Token API Telegram Bot'),
('bot_commands', '{"/start": "Selamat datang", "/deposit": "Silahkan isi saldo", "/beli": "Beli nomor"}', 'JSON Mapping Command Bot'),
('qris_api_key', '', 'Secret Key Gopay untuk API QRIS dan Validasi Webhook'),
('qris_global_webhook', '', 'URL Webhook Global (Fallback) untuk notifikasi masal'),
('nokos_api_key', '', 'API Key untuk autentikasi Nokos.co.id'),
('markup_global_percent', '10', 'Persentase margin keuntungan global default (%)'),
('markup_global_flat', '500', 'Nominal margin flat global default (Rp)');

-- Tabel Aturan Markup (Hierarki Margin)
-- type dapat berupa: 'country' (per negara), 'service' (per kategori produk), atau 'unit' (per satuan produk spesifik)
CREATE TABLE markup_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_type TEXT NOT NULL CHECK(rule_type IN ('country', 'service', 'unit')),
    target_id TEXT NOT NULL, -- Contoh: '6' untuk Indonesia, 'wa' untuk WhatsApp, atau '6_wa' untuk unit spesifik
    markup_percent REAL DEFAULT 0,
    markup_flat REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(rule_type, target_id)
);

-- Tabel Deposit (QRIS)
-- Transaksi dibatasi 5000 hingga 499999 (validasi juga ada di level backend API)
CREATE TABLE deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL UNIQUE,
    telegram_id TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount >= 5000 AND amount <= 499999),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'settlement', 'expired', 'failed')),
    qris_url TEXT,
    webhook_url TEXT, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id)
);

-- Tabel Transaksi Penjualan Layanan Nokos
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT NOT NULL UNIQUE,
    telegram_id TEXT NOT NULL,
    service_code TEXT NOT NULL,
    country_code TEXT NOT NULL,
    provider_cost REAL NOT NULL, -- Harga asli dari Nokos API
    markup_applied REAL NOT NULL, -- Total keuntungan yang diambil dari aturan markup
    final_price REAL NOT NULL, -- Harga yang dibayar user (provider_cost + markup_applied)
    status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'success', 'failed', 'refunded')),
    nokos_activation_id TEXT,
    phone_number TEXT,
    sms_code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_id) REFERENCES telegram_users(telegram_id)
);

-- Indeks untuk pencarian dan optimasi
CREATE INDEX idx_telegram_users_balance ON telegram_users(balance);
CREATE INDEX idx_deposits_order_id ON deposits(order_id);
CREATE INDEX idx_transactions_telegram_id ON transactions(telegram_id);
CREATE INDEX idx_markup_rules_target ON markup_rules(target_id);
