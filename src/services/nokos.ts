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

    private async request(action: string, options: RequestInit = {}): Promise<any> {
        const url = `${this.baseUrl}?action=${action}`;
        const response = await fetch(url, {
            ...options,
            headers: this.getHeaders()
        });

        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(`HTTP ${response.status} | Invalid JSON: ${text.substring(0, 100)}`);
        }

        if (data && data.success === true) {
            // Jika respons mengandung properti bersarang seperti 'services' atau 'countries'
            if (data.services) return data.services;
            if (data.countries) return data.countries;
            return data.data;
        }

        throw new Error(data?.error || `API Error on action: ${action}`);
    }

    async getBalance(): Promise<number> {
        const data = await this.request('getBalance');
        return data.balance;
    }

    // Parser yang disesuaikan khusus untuk objek bersarang "services"
    async getServices(): Promise<{code: string, name: string}[]> {
        const data = await this.request('getServices');
        
        if (Array.isArray(data)) {
            return data.map(item => ({
                code: String(item.code || ''),
                name: String(item.name || '')
            })).filter(i => i.code !== '');
        } 
        
        if (typeof data === 'object' && data !== null) {
            // Menangani bentuk objek {"aa": {"code": "aa", "name": "Probo"}, ...}
            return Object.values(data).map((val: any) => ({
                code: String(val?.code || ''),
                name: String(val?.name || '')
            })).filter(i => i.code !== '');
        }

        return [];
    }

    // Parser fleksibel untuk countries
    async getCountries(): Promise<{id: number, name: string, prefix: string}[]> {
        const data = await this.request('getCountries');
        
        if (Array.isArray(data)) {
            return data.map(item => ({
                id: Number(item.id ?? 0),
                name: String(item.name || ''),
                prefix: String(item.prefix || '')
            })).filter(i => !isNaN(i.id));
        }

        if (typeof data === 'object' && data !== null) {
            return Object.values(data).map((val: any) => ({
                id: Number(val?.id ?? 0),
                name: String(val?.name || ''),
                prefix: String(val?.prefix || '')
            })).filter(i => !isNaN(i.id));
        }

        return [];
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
        try {
            await this.request('cancelActivation', {
                method: 'POST',
                body: new URLSearchParams({ id: activationId }).toString()
            });
            return true;
        } catch {
            return false;
        }
    }
}
