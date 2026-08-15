export class NokosService {
    private apiKey: string;
    private baseUrl: string = 'https://nokos.co.id/api/';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private getHeaders() {
        return {
            'X-API-Key': this.apiKey,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
    }

    // Mendapatkan saldo pusat (provider)[cite: 1]
    async getBalance(): Promise<number> {
        const response = await fetch(`${this.baseUrl}?action=getBalance`, {
            method: 'GET',
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (data.success && data.data) {
            return data.data.balance;
        }
        throw new Error(data.error || "Gagal mendapatkan saldo Nokos");
    }

    // Mendapatkan harga dari server Plus (s2) secara spesifik[cite: 1]
    async getPrices(service: string, country: string, server: string = 's2'): Promise<any> {
        const response = await fetch(`${this.baseUrl}?action=getPrices&service=${service}&country=${country}&server=${server}`, {
            method: 'GET',
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (data.success) {
            return data.data;
        }
        throw new Error(data.error || "Gagal mendapatkan harga");
    }

    // Order nomor baru[cite: 1]
    async getNumber(service: string, country: string, server: string = 's2'): Promise<{ activation_id: number, phone: string, price: number }> {
        const body = new URLSearchParams();
        body.append('service', service);
        body.append('country', country);
        body.append('server', server);

        const response = await fetch(`${this.baseUrl}?action=getNumber`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: body.toString()
        });
        
        const data = await response.json();
        if (data.success && data.data) {
            return data.data;
        }
        
        // Handle Error 400 NO_NUMBERS dll[cite: 1]
        throw new Error(data.error || "Gagal memesan nomor");
    }

    // Cek status SMS / OTP[cite: 1]
    async getStatus(activationId: string): Promise<{ status: string, code?: string, sms?: string }> {
        const response = await fetch(`${this.baseUrl}?action=getStatus&id=${activationId}`, {
            method: 'GET',
            headers: this.getHeaders()
        });
        
        const data = await response.json();
        if (data.success && data.data) {
            return data.data;
        }
        throw new Error(data.error || "Gagal mengecek status");
    }

    // Membatalkan pesanan (Refund)[cite: 1]
    async cancelActivation(activationId: string): Promise<boolean> {
        const body = new URLSearchParams();
        body.append('id', activationId);

        const response = await fetch(`${this.baseUrl}?action=cancelActivation`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: body.toString()
        });

        const data = await response.json();
        return data.success === true;
    }
}
