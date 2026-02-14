import axios from 'axios';
import WebSocket from 'ws';

interface HttpDriverConfig {
    deviceName: string;
    deviceType: string;
    actions: Record<string, {
        method: 'GET' | 'POST' | 'PUT' | 'WS';
        url: string;
        headers?: Record<string, string>;
        body?: string;
    }>;
}

export interface DriverResult {
    success: boolean;
    status?: number;
    data?: any;
    error?: string;
    metadata?: Record<string, any>;
}

export class GenericHttpDriver {
    private config: HttpDriverConfig;

    constructor(config: HttpDriverConfig) {
        this.config = config;
    }

    async executeAction(actionName: string, params?: Record<string, any>): Promise<DriverResult> {
        const action = this.config.actions[actionName];
        if (!action) {
            throw new Error(`Action "${actionName}" not found in driver configuration for ${this.config.deviceName}`);
        }

        let url = action.url;
        let body = action.body;
        const method = (action.method || '').toString().toUpperCase();

        // Check if URL suggests WebSocket (wss:// or ws://)
        const isWsUrl = url.startsWith('ws://') || url.startsWith('wss://');

        // Replace placeholders in URL and Body
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                const placeholders = [`<${key}>`, `{${key}}` ];
                placeholders.forEach(placeholder => {
                    if (url.includes(placeholder)) {
                        url = url.split(placeholder).join(String(value || ''));
                    }
                    if (body && typeof body === 'string' && body.includes(placeholder)) {
                        body = body.split(placeholder).join(String(value || ''));
                    }
                });
            });
        }

        // Check for remaining placeholders
        if (url.match(/\{.*?\}/) || url.match(/<.*?>/)) {
            console.warn(`[GenericHttpDriver] Warning: URL still contains placeholders: ${url}. Keys available:`, Object.keys(params || {}));
        }

        // Clean up remaining placeholders
        // url = url.replace(/\{.*?\}/g, '').replace(/<.*?>/g, '');
        // if (body && typeof body === 'string') {
        //     body = body.replace(/\{.*?\}/g, '').replace(/<.*?>/g, '');
        // }

        if (method === 'WS' || isWsUrl) {
            return this.executeWsAction(url, body);
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

        console.log(`[GenericHttpDriver] Executing ${actionName} on ${this.config.deviceName}: ${method} ${url}`);

        try {
            const response = await axios({
                method: method as any,
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
            const errorMessage = error.message || String(error) || 'Unknown Execution Error';
            console.error(`[GenericHttpDriver] Error executing ${actionName}:`, errorMessage);
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    private async executeWsAction(url: string, body?: string): Promise<DriverResult> {
        return new Promise((resolve) => {
            console.log(`[GenericHttpDriver] Executing WebSocket action on ${url}`);
            
            const ws = new WebSocket(url, {
                handshakeTimeout: 5000,
                rejectUnauthorized: false
            });

            const timeout = setTimeout(() => {
                if (ws.readyState !== WebSocket.CLOSED) {
                    ws.terminate();
                }
                resolve({ success: false, error: 'WebSocket global timeout (30s)' });
            }, 30000);

            ws.on('open', () => {
                console.log(`[GenericHttpDriver] WebSocket connected to ${url}`);
                // NOTE: We do NOT send body here anymore. We wait for ms.channel.connect.
                // Unless the device doesn't send handshake? (Tizen always does)
                
                // Increase wait time for user interaction (Pairing can take time)
                const successTimeout = setTimeout(() => {
                    clearTimeout(timeout);
                    ws.terminate(); 
                    resolve({ success: true, data: 'Executed (Timeout waiting for response - No Token Captured)' });
                }, 25000); // 25 seconds to give user time to click Allow

                ws.on('message', (data: WebSocket.RawData) => {
                    const msg = data.toString();
                    console.log(`[GenericHttpDriver] WebSocket received from ${this.config.deviceName}:`, msg);
                    
                    try {
                        const parsed = JSON.parse(msg);
                        
                        // If we get an 'unauthorized', don't close yet. The user might be clicking 'Allow'.
                        if (parsed.event === 'ms.channel.unauthorized') {
                            console.log(`[GenericHttpDriver] Waiting for user to authorize on TV...`);
                            return; // Keep waiting for next message
                        }

                        if (parsed.event === 'ms.channel.connect') {
                            if (parsed.data && parsed.data.token) {
                                console.log(`[GenericHttpDriver] TOKEN CAPTURED:`, parsed.data.token);
                                clearTimeout(successTimeout);
                                clearTimeout(timeout);
                                ws.terminate();
                                resolve({ success: true, data: msg, metadata: { token: parsed.data.token } });
                                return;
                            }
                            // Handshake received.
                            // If we have a body to send, we send it now.
                            if (body) {
                                console.log(`[GenericHttpDriver] Handshake OK. Sending pending command...`);
                                console.log(`[GenericHttpDriver] Payload:`, body); // LOG PAYLOAD
                                ws.send(body);
                                // Give it a moment to fly, then close
                                setTimeout(() => {
                                     clearTimeout(successTimeout);
                                     clearTimeout(timeout);
                                     ws.close();
                                     resolve({ success: true, data: 'Command Sent' });
                                }, 500); 
                                return;
                            }
                        }

                        // For any other message, we resolve
                        clearTimeout(successTimeout);
                        clearTimeout(timeout);
                        ws.terminate();
                        resolve({ success: true, data: msg });
                    } catch (e) {
                        // Not JSON, resolve with raw data
                        clearTimeout(successTimeout);
                        clearTimeout(timeout);
                        ws.terminate();
                        resolve({ success: true, data: msg });
                    }
                });
            });

            ws.on('close', (code: number) => {
                clearTimeout(timeout);
                console.log(`[GenericHttpDriver] WebSocket closed with code: ${code}`);
                // Code 1005 (No Status Received) or 1006 (Abnormal Closure) 
                // is common when the TV closes the connection after a command.
                // We treat 1000 (Normal), 1005, and 1006 as "Executed" if we didn't get an explicit error.
                if (code === 1000 || code === 1005 || code === 1006) {
                    resolve({ success: true, data: `Socket closed with code ${code}` });
                } else {
                    resolve({ success: false, error: `Socket closed with code ${code}` });
                }
            });

            ws.on('error', (err: Error) => {
                clearTimeout(timeout);
                const errorMessage = err.message || String(err) || 'Unknown WebSocket Error';
                console.error(`[GenericHttpDriver] WS Error:`, errorMessage);
                
                // Many TVs hung up or reset the connection on auth failure or after command
                if (errorMessage.includes('1005') || errorMessage.includes('unexpected server response: 401')) {
                    resolve({ success: true, data: 'Auth challenge or socket hang up (Common in pairing)', metadata: { needsPairing: true } });
                } else {
                    resolve({ success: false, error: errorMessage });
                }
            });
        });
    }
    
    getAvailableActions() {
        return Object.keys(this.config.actions);
    }
}
