import WebSocket from 'ws';

const IP = '192.168.16.106';

// Standard ioBroker name (Base64 of 'ioBroker')
const NAME = 'aW9Ccm9rZXI='; 

function attempt(port: number, secure: boolean) {
    return new Promise((resolve, reject) => {
        const protocol = secure ? 'wss' : 'ws';
        const url = `${protocol}://${IP}:${port}/api/v2/channels/samsung.remote.control?name=${NAME}`;
        
        console.log(`[Attempt] Connecting to ${port} (${secure ? 'Secure' : 'Insecure'})...`);
        
        const ws = new WebSocket(url, { 
            rejectUnauthorized: false,
            handshakeTimeout: 3000
        });

        ws.on('open', () => {
            console.log(`[${port}] Connected! Waiting for 'ms.channel.connect'...`);
        });

        ws.on('message', (data: any) => {
            const msg = data.toString();
            console.log(`[${port}] RX: ${msg}`);
            if (msg.includes('token')) {
                resolve(true); // Success
            }
        });

        ws.on('close', (code) => {
            console.log(`[${port}] Closed: ${code}`);
            reject(new Error(`Closed ${code}`));
        });

        ws.on('error', (err) => {
            console.log(`[${port}] Error: ${err.message}`);
            reject(err);
        });
    });
}

(async () => {
    console.log("=== FINAL PAIRING ATTEMPT ===");
    console.log("Check TV Settings -> General -> External Device Manager -> Device Connection Manager");
    console.log("Ensure 'Access Notification' is ON (First Time Only)\n");

    for (let i=0; i<5; i++) {
        console.log(`\n--- Try #${i+1} ---`);
        try {
            // Try 8002 first
            await attempt(8002, true);
        } catch(e) {
            // connection failed
        }
        
        await new Promise(r => setTimeout(r, 2000));
    }
})();
