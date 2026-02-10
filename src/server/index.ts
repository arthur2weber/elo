import express from 'express';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { startDeviceMonitor } from './device-monitor';
import { startDecisionLoop } from './decision-loop';

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(bodyParser.json());

app.get('/', (req: express.Request, res: express.Response) => {
    res.send('Welcome to the n8n AI Manager!');
});

// Add additional routes and middleware as needed

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const monitorEnabled = process.env.ELO_MONITOR_ENABLED !== 'false';
if (monitorEnabled) {
    const intervalMs = Number.parseInt(process.env.ELO_MONITOR_INTERVAL_MS || '1000', 10);
    const n8nHealthUrl = process.env.N8N_HEALTH_URL || 'http://localhost:5678/healthz';
    startDeviceMonitor({ intervalMs, n8nHealthUrl });
}

const decisionEnabled = process.env.ELO_DECISION_LOOP_ENABLED !== 'false';
if (decisionEnabled) {
    const intervalMs = Number.parseInt(process.env.ELO_DECISION_INTERVAL_MS || '10000', 10);
    const logLimit = Number.parseInt(process.env.ELO_DECISION_LOG_LIMIT || '100', 10);
    const requestLimit = Number.parseInt(process.env.ELO_DECISION_REQUEST_LIMIT || '50', 10);
    startDecisionLoop({ intervalMs, logLimit, requestLimit });
}