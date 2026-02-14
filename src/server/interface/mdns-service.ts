import { Bonjour, Browser } from 'bonjour-service';
import os from 'os';
const multicastDns = require('multicast-dns');

/**
 * MDNS Service for ELO
 * Announces the service on the local network as 'elo.local'
 * Also discovers other mDNS services if needed.
 */
export class MdnsService {
  private bonjour: Bonjour;
  private mdns: any;
  private browser: Browser | null = null;
  private serviceName: string;
  private servicePort: number;
  private hostname: string = 'elo.local';

  constructor(port = 3000, name = 'Elo - Casa Inteligente') {
    this.bonjour = new Bonjour();
    this.serviceName = name;
    this.servicePort = port;
    try {
      this.mdns = multicastDns();
    } catch (e) {
      console.warn('[mDNS] Failed to initialize low-level multicast-dns (likely port 5353 busy). Discovery limited.', e);
    }
  }

  /**
   * Get the primary local IP address of the machine
   */
  private getLocalIp(): string | null {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal && !name.includes('docker') && !name.includes('br-')) {
            return net.address;
        }
      }
    }
    return null;
  }

  /**
   * Start announcing the service on the network
   */
  start(): void {
    const ip = this.getLocalIp();

    // 1. Publish standard HTTP service via Bonjour
    try {
      this.bonjour.publish({
        name: this.serviceName,
        type: 'http',
        port: this.servicePort,
        protocol: 'tcp',
        txt: {
          desc: 'Elo Home Automation Server',
          version: '1.0',
          api: '/api'
        }
      });
      console.log(`[mDNS] Service published: ${this.serviceName} on port ${this.servicePort} (_http._tcp)`);
    } catch (error) {
      console.error('[mDNS] Failed to publish service:', error);
    }

    // 2. Setup Responder for Hostname Resolution (elo.local -> IP)
    if (this.mdns && ip) {
        console.log(`[mDNS] Setting up hostname responder for ${this.hostname} -> ${ip}`);
        
        this.mdns.on('query', (query: any) => {
            const validQuestions = query.questions.filter((q: any) => q.name === this.hostname && q.type === 'A');
            
            if (validQuestions.length > 0) {
                try {
                this.mdns.respond({
                    answers: [{
                    name: this.hostname,
                    type: 'A',
                    ttl: 300,
                    data: ip
                    }]
                });
                } catch (err) {
                    // Suppress send errors
                }
            }
        });
        
        console.log(`[mDNS] Access via http://${this.hostname}:${this.servicePort} (Hostname spoofing active)`);
    } else {
        console.warn(`[mDNS] Could not setup hostname responder. IP: ${ip}, Handler: ${!!this.mdns}`);
    }
  }

  /**
   * Stop announcing and browsing
   */
  stop(): void {
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }
    try {
        if (this.mdns) {
            this.mdns.destroy();
        }
    } catch {}
    this.bonjour.unpublishAll();
    this.bonjour.destroy();
    console.log('[mDNS] Service stopped');
  }
}

// Singleton instance
let mdnsService: MdnsService | null = null;

export const initMdnsService = (port = 3000): MdnsService => {
  if (!mdnsService) {
    mdnsService = new MdnsService(port);
    mdnsService.start();
  }
  return mdnsService;
};
