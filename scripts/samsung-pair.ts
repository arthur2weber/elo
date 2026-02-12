import WebSocket from 'ws';

interface TVConfig {
  ip: string;
  name: string;
}

class SamsungTVPairing {
  private ws: WebSocket | null = null;
  private uri: string;

  constructor(private config: TVConfig) {
    const encodedName = Buffer.from(config.name).toString('base64');
    // Port 8002 is for Secure WebSocket (wss)
    this.uri = `wss://${config.ip}:8002/api/v2/channels/samsung.remote.control?name=${encodedName}`;
    console.log(`[SamsungPair] Target URI: ${this.uri}`);
  }

  public start(): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log(`[SamsungPair] Connecting to ${this.config.ip}... (Please watch your TV)`);
       
      // Create new socket instance each time
      this.ws = new WebSocket(this.uri, { 
        rejectUnauthorized: false, 
        handshakeTimeout: 5000 
      });

      this.ws.on('open', () => {
        console.log('[SamsungPair] Connection OPEN. Waiting for Token...');
        console.log('[SamsungPair] NOTE: Passive mode. Waiting for handshake...');
      });

      this.ws.on('message', (data: any) => {
        const msgStr = data.toString();
        try {
            const response = JSON.parse(msgStr);
            
            if (response.event === 'ms.channel.connect') {
                if (response.data && response.data.token) {
                    console.log('\nSUCCESS! Token received!');
                    console.log('------------------------------------------------');
                    console.log('TOKEN:', response.data.token);
                    console.log('------------------------------------------------\n');
                    resolve(response.data.token);
                    this.ws?.close();
                } else {
                    console.log('[SamsungPair] Connected, but NO token yet.');
                }
            } else if (response.event === 'ms.channel.unauthorized') {
                 console.log('[SamsungPair] UNAUTHORIZED. Please click ALLOW on TV!');
            }
        } catch (e) {
            // ignore non-json
        }
      });

      this.ws.on('close', (code, reason) => {
        if (code === 1005 || code === 1006) {
             console.log('[SamsungPair] TV closed connection (Expected if waiting for Auth).');
        }
        reject(new Error(`Socket closed ${code}`));
      });

      this.ws.on('error', (err) => {
        if (!err.message.includes('1005') && !err.message.includes('1006')) {
            console.error('[SamsungPair] Error:', err.message);
        }
        reject(err);
      });
    });
  }
}

// EXECUTION
const randomSuffix = Math.floor(Math.random() * 1000);
const appName = `EloInt${randomSuffix}`;

console.log(`[Main] Attempting pairing with App Name: "${appName}"`);

const pairer = new SamsungTVPairing({
  ip: '192.168.16.106',
  name: appName
});

async function runWithRetry(attempts: number) {
    for (let i = 1; i <= attempts; i++) {
        console.log(`\n[Main] Attempt ${i}/${attempts}...`);
        try {
            const token = await pairer.start();
            console.log(`[Main] Pairing Successful! Token: ${token}`);
            process.exit(0);
        } catch (e) {
            console.log(`[Main] Waiting 2s before retry...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    console.error(`[Main] Failed after ${attempts} attempts.`);
    process.exit(1);
}

runWithRetry(15);
