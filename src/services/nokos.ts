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

    // BARU: Menarik seluruh katalog layanan
    async getServices(): Promise<{code: string, name: string}[]> {
        const response = await fetch(`${this.baseUrl}?action=getServices`, {
            method: 'GET',
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (data.success && data.data) {
            return data.data;
        }
        throw new Error(data.error || "Gagal menarik daftar layanan");
    }

    // BARU: Menarik seluruh katalog negara
    async getCountries(): Promise<{id: number, name: string, prefix: string}[]> {
        const response = await fetch(`${this.baseUrl}?action=getCountries`, {
            method: 'GET',
            headers: this.getHeaders()
        });
        const data = await response.json();
        if (data.success && data.data) {
            return data.data;
        }
        throw new Error(data.error || "Gagal menarik daftar negara");
    }

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
        
        throw new Error(data.error || "Gagal memesan nomor");
    }

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
