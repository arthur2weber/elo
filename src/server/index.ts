import express from 'express';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { startDeviceMonitor } from './device-monitor';
import { startDecisionLoop } from './decision-loop';
import { startDiscovery } from './discovery';
import { loadAutomations, runAutomations } from './automation_engine';

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(bodyParser.json());

app.post('/events', async (req, res) => {
    const event = req.body;
    // Trigger automations immediately on event ingress
    runAutomations(event);
    res.json({ success: true, processed: true });
});

app.get('/', (req: express.Request, res: express.Response) => {
    res.send('Welcome to the ELO Automation Engine!');
});

// Add additional routes and middleware as needed

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    await loadAutomations();

    server.listen(PORT, () => {
        console.log(`[ELO] Brain active on port ${PORT}`);
    });

    const monitorEnabled = process.env.ELO_MONITOR_ENABLED !== 'false';
    if (monitorEnabled) {
        console.log('[ELO] Starting Device Monitor...');
        const intervalMs = Number.parseInt(process.env.ELO_MONITOR_INTERVAL_MS || '5000', 10);
        const healthUrl = process.env.ELO_HEALTH_URL;
        startDeviceMonitor({ intervalMs, healthUrl });
    }

    const discoveryEnabled = process.env.ELO_DISCOVERY_ENABLED !== 'false';
    if (discoveryEnabled) {
        console.log('[ELO] Starting Network Discovery...');
        startDiscovery();
    }

    const decisionEnabled = process.env.ELO_DECISION_LOOP_ENABLED !== 'false';
    if (decisionEnabled) {
        console.log('[ELO] Starting Decision Loop...');
        const intervalMs = Number.parseInt(process.env.ELO_DECISION_INTERVAL_MS || '10000', 10);
        const logLimit = Number.parseInt(process.env.ELO_DECISION_LOG_LIMIT || '100', 10);
        const requestLimit = Number.parseInt(process.env.ELO_DECISION_REQUEST_LIMIT || '50', 10);
        startDecisionLoop({ intervalMs, logLimit, requestLimit });
    }
};

startServer();