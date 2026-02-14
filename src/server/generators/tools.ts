import axios from 'axios';
import { Socket } from 'net';
import { promisify } from 'util';

/**
 * Ferramentas de rede para a IA usar durante a geração de drivers.
 * Essas funções são seguras e limitadas apenas a sondagem.
 */

/**
 * Verifica se uma porta TCP está aberta em um host.
 */
export async function checkPort(ip: string, port: number): Promise<{ open: boolean; banner?: string; error?: string }> {
    return new Promise((resolve) => {
        const socket = new Socket();
        let banner = '';

        socket.setTimeout(2000);

        socket.on('connect', () => {
             // Tenta ler um banner (alguns serviços enviam logo na conexão)
            socket.write('HEAD / HTTP/1.0\r\n\r\n'); // Tenta provocar uma resposta HTTP ou erro
        });

        socket.on('data', (data) => {
            banner += data.toString().slice(0, 500); // Limita tamanho
            socket.destroy();
        });

        socket.on('close', () => {
             resolve({ open: true, banner: banner.length > 0 ? banner : undefined });
        });

        socket.on('error', (err) => {
             resolve({ open: false, error: err.message });
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({ open: false, error: 'Timeout' });
        });

        socket.connect(port, ip);
    });
}

/**
 * Realiza uma requisição HTTP simples para testar um endpoint.
 */
export async function testHttp(url: string, method: 'GET' | 'POST' = 'GET', headers: Record<string, string> = {}, body?: string): Promise<{ status: number; data: any; headers: any }> {
    try {
        const response = await axios({
            url,
            method,
            headers,
            data: body,
            timeout: 5000,
            validateStatus: () => true // Não lança erro em 4xx/5xx
        });

        return {
            status: response.status,
            data: typeof response.data === 'string' ? response.data.slice(0, 1000) : response.data,
            headers: response.headers
        };
    } catch (error: any) {
        return {
            status: 0,
            data: error.message,
            headers: {}
        };
    }
}

/**
 * Tenta descobrir serviços mDNS/Bonjour na rede (simulação simples usando dig/avahi se disponível, ou apenas log).
 * Nota: Como o mDNS é broadcast, pode ser difícil capturar algo específico sob demanda sem um listener de longa duração.
 * Por enquanto, vamos focar em portas e HTTP.
 */

// Definição das ferramentas em formato Gemini Function Declaration
export const DRIVER_TOOLS_DECLARATIONS = [
    {
        name: 'check_port',
        description: 'Check if a specific TCP port is open on an IP address. Useful for discovering running services.',
        parameters: {
            type: 'OBJECT',
            properties: {
                ip: { type: 'STRING', description: 'The IPv4 address of the target device.' },
                port: { type: 'INTEGER', description: 'The port number to check (e.g., 80, 8080, 554).' }
            },
            required: ['ip', 'port']
        }
    },
    {
        name: 'test_http_get',
        description: 'Perform an HTTP GET request to test if an API endpoint exists and check its status/body.',
        parameters: {
            type: 'OBJECT',
            properties: {
                url: { type: 'STRING', description: 'The full URL to test (e.g., http://192.168.1.100:8080/info).' }
            },
            required: ['url']
        }
    }
];

// Mapa para executar as ferramentas
export const DRIVER_TOOLS_HANDLERS: any = {
    'check_port': (args: any) => checkPort(args.ip, args.port),
    'test_http_get': (args: any) => testHttp(args.url, 'GET')
};
