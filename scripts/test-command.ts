import WebSocket from 'ws';

const IP = '192.168.16.106';
const TOKEN = '18319393';
const APP_NAME = 'EloInt131'; // RWxvSW50MTMx
const ENCODED_NAME = Buffer.from(APP_NAME).toString('base64');

const URL = `wss://${IP}:8002/api/v2/channels/samsung.remote.control?name=${ENCODED_NAME}&token=${TOKEN}`;

console.log(`Connecting to: ${URL}`);

const ws = new WebSocket(URL, { rejectUnauthorized: false });

ws.on('open', () => {
    console.log('CONNECTED! Waiting for handshake...');
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('MSG:', msg);

    if (msg.event === 'ms.channel.connect') {
        console.log('Handshake received! Sending KEY_HOME...');
        
        const command = {
            method: 'ms.remote.control',
            params: {
                Cmd: 'Click',
                DataOfCmd: 'KEY_HOME',
                Option: 'false',
                TypeOfRemote: 'SendRemoteKey'
            }
        };

        ws.send(JSON.stringify(command));
        console.log('Command SENT.');

        // Keep connection open for a bit to ensure it processes
        setTimeout(() => {
            console.log('Closing...');
            ws.close();
        }, 1000); // 1 second wait
    }
});

ws.on('close', (code) => {
    console.log(`Closed: ${code}`);
});

ws.on('error', (err) => {
    console.error('Error:', err);
});
