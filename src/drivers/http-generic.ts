import axios from 'axios';

interface HttpDriverConfig {
    deviceName: string;
    deviceType: string;
    actions: Record<string, {
        method: 'GET' | 'POST' | 'PUT';
        url: string;
        headers?: Record<string, string>;
        body?: string;
    }>;
}

export class GenericHttpDriver {
    private config: HttpDriverConfig;
    private baseUrl: string;

    constructor(config: HttpDriverConfig) {
        this.config = config;
        this.baseUrl = ''; // If needed, can be extracted from action URLs
    }

    async executeAction(actionName: string, params?: Record<string, any>) {
        const action = this.config.actions[actionName];
        if (!action) {
            throw new Error(`Action "${actionName}" not found in driver configuration for ${this.config.deviceName}`);
        }

        let url = action.url;
        let body = action.body;

        // Replace placeholders in URL and Body
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                const placeholder = `<${key}>`;
                if (url.includes(placeholder)) {
                    url = url.replace(placeholder, String(value));
                }
                // Also support simple templating in body
                if (body && typeof body === 'string' && body.includes(placeholder)) {
                    body = body.replace(placeholder, String(value));
                }
            });
        }

        // Parse body if it is a JSON string
        let payload = body;
        if (body && typeof body === 'string') {
            try {
                payload = JSON.parse(body);
            } catch (e) {
                // Keep as string if not valid JSON
            }
        }

        console.log(`[GenericHttpDriver] Executing ${actionName} on ${this.config.deviceName}: ${action.method} ${url}`);

        try {
            const response = await axios({
                method: action.method,
                url: url,
                headers: action.headers,
                data: payload,
                timeout: 5000
            });
            
            return {
                success: true,
                status: response.status,
                data: response.data
            };
        } catch (error: any) {
            console.error(`[GenericHttpDriver] Error executing ${actionName}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    getAvailableActions() {
        return Object.keys(this.config.actions);
    }
}
