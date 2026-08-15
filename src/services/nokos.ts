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

    // Fungsi pusat untuk menangkap RAW response dan HTTP Status secara transparan
    private async request(action: string, options: RequestInit = {}): Promise<any> {
        const url = `${this.baseUrl}?action=${action}`;
        try {
            const response = await fetch(url, {
                ...options,
                headers: this.getHeaders()
            });

            // Ambil sebagai teks mentah terlebih dahulu untuk debugging
            const text = await response.text();
            
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                // Jika provider merespons dengan HTML (misal: 403 Forbidden atau 500 WAF Cloudflare)
                throw new Error(`HTTP ${response.status} | Invalid JSON (Raw): ${text.substring(0, 150)}...`);
            }

            // Berdasarkan dokumentasi Nokos: Sukses
            if (data && data.success === true) {
                return data.data;
            }

            // Berdasarkan dokumentasi Nokos: Gagal namun masih berbentuk JSON
            throw new Error(data?.error || `HTTP ${response.status} | Unknown JSON Error: ${text.substring(0, 150)}`);
        } catch (err: any) {
            throw new Error(err.message);
        }
    }

    async getBalance(): Promise<number> {
        const data = await this.request('getBalance');
        return data.balance;
    }

    async getServices(): Promise<{code: string, name: string}[]> {
        return await this.request('getServices');
    }

    async getCountries(): Promise<{id: number, name: string, prefix: string}[]> {
        return await this.request('getCountries');
    }

    async getPrices(service: string, country: string, server: string = 's2'): Promise<any> {
        return await this.request(`getPrices&service=${service}&country=${country}&server=${server}`);
    }

    async getNumber(service: string, country: string, server: string = 's2'): Promise<{ activation_id: number, phone: string, price: number }> {
        const body = new URLSearchParams();
        body.append('service', service);
        body.append('country', country);
        body.append('server', server);

        return await this.request('getNumber', {
            method: 'POST',
            body: body.toString()
        });
    }

    async getStatus(activationId: string): Promise<{ status: string, code?: string, sms?: string }> {
        return await this.request(`getStatus&id=${activationId}`);
    }

    async cancelActivation(activationId: string): Promise<boolean> {
        const body = new URLSearchParams();
        body.append('id', activationId);

        try {
            const data = await this.request('cancelActivation', {
                method: 'POST',
                body: body.toString()
            });
            // Jika request di atas tidak melempar error, berarti sukses
            return true;
        } catch (error) {
            return false;
        }
    }
}
