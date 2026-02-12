const WebSocket = require('ws');

const IP = '192.168.16.106';
const APP_NAME = Buffer.from('EloTestToken').toString('base64'); 
const URL_8002 = `wss://${IP}:8002/api/v2/channels/samsung.remote.control?name=${APP_NAME}&token=`;

function tryConnect(url, label) {
    console.log(`[${label}] Connecting to ${url}...`);
    const ws = new WebSocket(url, {
        rejectUnauthorized: false,
        headers: {
            'Origin': 'https://' + IP + ':8002' // Attempt to mock Origin
        }
    });

    ws.on('open', () => {
        console.log(`[${label}] CONNECTED! Sending Command IMMEDIATELY...`);
        
        const cmd = JSON.stringify({
            method: "ms.remote.control",
            params: {
                Cmd: "Click",
                DataOfCmd: "KEY_VOLUP",
                Option: "false",
                TypeOfRemote: "SendRemoteKey"
            }
        });
        ws.send(cmd);
    });

    ws.on('message', (data) => {
        console.log(`[${label}] MSG: ${data.toString()}`);
    });

    ws.on('close', (code, reason) => {
        console.log(`[${label}] CLOSED: ${code} ${reason}`);
    });

    ws.on('error', (err) => {
        console.log(`[${label}] ERROR: ${err.message}`);
    });
}

console.log("=== STARTING TIZEN DEBUG PAIRING (IMMEDIATE) ===");
tryConnect(URL_8002, "Secure-8002-FAST");
