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
        try {
            const response = await fetch(url, {
                ...options,
                headers: this.getHeaders()
            });

            const text = await response.text();
            
            let data;
            try {
                data = JSON.parse(text);
            } catch (e) {
                throw new Error(`HTTP ${response.status} | Invalid JSON (Raw): ${text.substring(0, 150)}...`);
            }

            if (data && data.success === true) {
                return data.data;
            }

            throw new Error(data?.error || `HTTP ${response.status} | Unknown JSON Error: ${text.substring(0, 150)}`);
        } catch (err: any) {
            throw new Error(err.message);
        }
    }

    async getBalance(): Promise<number> {
        const data = await this.request('getBalance');
        return data.balance;
    }

    // Modifikasi: Selalu kembalikan Array, apa pun format dari Nokos
    async getServices(): Promise<{code: string, name: string}[]> {
        const data = await this.request('getServices');
        
        if (Array.isArray(data)) {
            return data;
        } else if (typeof data === 'object' && data !== null) {
            // Konversi dari { "wa": "WhatsApp" } menjadi array objects
            return Object.entries(data).map(([code, name]) => ({
                code: code,
                name: String(name)
            }));
        }
        
        return [];
    }

    // Modifikasi: Selalu kembalikan Array, apa pun format dari Nokos
    async getCountries(): Promise<{id: number, name: string, prefix: string}[]> {
        const data = await this.request('getCountries');
        
        if (Array.isArray(data)) {
            return data;
        } else if (typeof data === 'object' && data !== null) {
             // Konversi object map jika Nokos mengembalikannya dalam bentuk object
             return Object.entries(data).map(([id, info]: [string, any]) => {
                 if(typeof info === 'object') {
                     return { id: parseInt(id), name: info.name || id, prefix: info.prefix || '' }
                 } else {
                     return { id: parseInt(id), name: String(info), prefix: '' }
                 }
             });
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
        const body = new URLSearchParams();
        body.append('id', activationId);

        try {
            await this.request('cancelActivation', {
                method: 'POST',
                body: body.toString()
            });
            return true;
        } catch (error) {
            return false;
        }
    }
}
