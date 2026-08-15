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
            return data;
        }

        throw new Error(data?.error || `API Error on action: ${action}`);
    }

    async getBalance(): Promise<number> {
        const res = await this.request('getBalance');
        return res.data?.balance || res.balance || 0;
    }

    async getServices(): Promise<{code: string, name: string}[]> {
        const res = await this.request('getServices');
        const rawServices = res.services || res.data || res;

        if (typeof rawServices === 'object' && rawServices !== null) {
            return Object.values(rawServices).map((val: any) => ({
                code: String(val?.code || ''),
                name: String(val?.name || '')
            })).filter(i => i.code !== '');
        }
        return [];
    }

    async getCountries(): Promise<{id: number, name: string, prefix: string}[]> {
        const res = await this.request('getCountries');
        const rawCountries = res.countries || res.data || res;

        if (Array.isArray(rawCountries)) {
            return rawCountries.map(item => ({
                id: Number(item.id ?? item.country_id ?? 0),
                name: String(item.name || item.country_name || ''),
                prefix: String(item.prefix || '')
            })).filter(i => !isNaN(i.id));
        }

        if (typeof rawCountries === 'object' && rawCountries !== null) {
            return Object.values(rawCountries).map((val: any) => ({
                id: Number(val?.id ?? val?.country_id ?? 0),
                name: String(val?.name || val?.country_name || ''),
                prefix: String(val?.prefix || '')
            })).filter(i => !isNaN(i.id));
        }
        return [];
    }

    // DIMODIFIKASI: Parameter dibuat opsional agar bisa menarik seluruh list harga
    async getPrices(server: string = 's2', service: string = '', country: string = ''): Promise<any> {
        let url = `getPrices&server=${server}`;
        if (service) url += `&service=${service}`;
        if (country) url += `&country=${country}`;
        
        const res = await this.request(url);
        return res.data || res;
    }

    async getNumber(service: string, country: string, server: string = 's2'): Promise<{ activation_id: number, phone: string, price: number }> {
        const body = new URLSearchParams();
        body.append('service', service);
        body.append('country', country);
        body.append('server', server);

        const res = await this.request('getNumber', {
            method: 'POST',
            body: body.toString()
        });
        return res.data || res;
    }

    async getStatus(activationId: string): Promise<{ status: string, code?: string, sms?: string }> {
        const res = await this.request(`getStatus&id=${activationId}`);
        return res.data || res;
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
