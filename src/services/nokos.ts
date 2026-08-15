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

    // PARSER NEGARA YANG KEBAL JSON ACAK
    async getCountries(): Promise<{id: number, name: string, prefix: string}[]> {
        const res = await this.request('getCountries');
        const rawCountries = res.countries || res.data?.countries || res.data || res;

        let result: {id: number, name: string, prefix: string}[] = [];

        if (Array.isArray(rawCountries)) {
            // Jika dikembalikan sebagai Array
            result = rawCountries.map(item => ({
                id: Number(item?.id ?? item?.country_id ?? 0),
                name: String(item?.name ?? item?.country_name ?? ''),
                prefix: String(item?.prefix ?? '')
            }));
        } else if (typeof rawCountries === 'object' && rawCountries !== null) {
            const firstVal = Object.values(rawCountries)[0];
            
            if (typeof firstVal === 'string') {
                // Jika formatnya: {"0": "Russia", "6": "Indonesia"}
                result = Object.entries(rawCountries).map(([id, name]) => ({
                    id: Number(id),
                    name: String(name),
                    prefix: ''
                }));
            } else {
                // Jika formatnya: {"0": {"id": 0, "name": "Russia"}}
                result = Object.values(rawCountries).map((val: any) => ({
                    id: Number(val?.id ?? val?.country_id ?? 0),
                    name: String(val?.name ?? val?.country_name ?? ''),
                    prefix: String(val?.prefix ?? '')
                }));
            }
        }

        return result.filter(i => i.name !== '' && !isNaN(i.id));
    }

    // PARSER HARGA YANG KEBAL JSON ACAK
    async getPrices(server: string = 's2', service: string = '', country: string = ''): Promise<any> {
        let url = `getPrices&server=${server}`;
        if (service) url += `&service=${service}`;
        if (country) url += `&country=${country}`;
        
        const res = await this.request(url);
        const pricesData = res.prices || res.data?.prices || res.data || res;
        
        // Membersihkan root object agar HANYA mengembalikan object berisi Country ID (angka)
        const cleanPrices: Record<string, any> = {};
        for (const [key, value] of Object.entries(pricesData)) {
            if (!isNaN(Number(key)) && typeof value === 'object' && value !== null) {
                cleanPrices[key] = value;
            }
        }
        
        return cleanPrices;
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
