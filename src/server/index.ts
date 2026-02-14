import express from 'express';
import bodyParser from 'body-parser';
import { createServer } from 'http';
import { startDeviceMonitor } from './device-monitor';
import { startDecisionLoop } from './decision-loop';
import { startDiscovery } from './discovery';
import { loadAutomations, runAutomations } from './automation_engine';
import { registerHttpUi } from './http-ui';
import { syncCameraStreams } from './go2rtc-sync';
import { PeopleRegistryService } from './people-registry';
import { FaceDetectionWorker } from './face-detection-worker';
import { initNotificationService } from './notification-service';
import { initPresenceDetector } from './presence-detector';
import { MetricsStore } from './metrics-store';
import { BaselineCalculator } from './baseline-calculator';
import { TrendAnalyzer } from './trend-analyzer';
import { ProactiveSuggestions } from './proactive-suggestions';
import { DailyBriefingGenerator } from './daily-briefing';
import { AutomationEngineV2 } from './automation-engine-v2';
import { initCorrelationEngine } from './correlation-engine';
import { RuleProposer } from './rule-proposer';
import { getLocalDb, getKnowledgeDb, closeAllDatabases } from './database';
// import { createVoiceGateway } = require('./voice-gateway.js');

const app = express();
const server = createServer(app);

app.use(bodyParser.json());

// Register voice gateway routes
const { createVoiceGateway } = require('./voice-gateway.js');
const voiceRouter = createVoiceGateway();
app.use('/api/voice', voiceRouter);

// Initialize face detection worker (will be started later)
const faceDetectionWorker = new FaceDetectionWorker();

// Register people registry routes
const peopleRegistry = new PeopleRegistryService(faceDetectionWorker);
app.use('/api', peopleRegistry.getRouter());

app.post('/events', async (req, res) => {
    const event = req.body;
    // Trigger automations immediately on event ingress
    runAutomations(event);
    res.json({ success: true, processed: true });
});

// API routes are registered in registerHttpUi.

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    await loadAutomations();

    // Initialize face detection worker
    try {
        await faceDetectionWorker.initialize();
        console.log('[ELO] Face detection worker initialized successfully');
    } catch (faceErr) {
        console.error('[ELO] Face detection initialization failed (non-fatal):', faceErr);
    }

    // Initialize notification service
    const notificationConfig = {
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID,
      enabled: process.env.TELEGRAM_NOTIFICATIONS_ENABLED === 'true'
    };
    initNotificationService(notificationConfig);

    // Initialize presence detector
    initPresenceDetector();

    // Initialize Phase 5: Mordomo Invisível (Invisible Butler)
    console.log('[ELO] Initializing Phase 5: Mordomo Invisível...');

    // Initialize database connections (local + knowledge)
    const localDb = getLocalDb();
    const knowledgeDb = getKnowledgeDb();

    // Initialize Phase 5 components
    const metricsStore = new MetricsStore(localDb);
    const baselineCalculator = new BaselineCalculator(metricsStore, localDb);
    const trendAnalyzer = new TrendAnalyzer(metricsStore, localDb);
    const proactiveSuggestions = new ProactiveSuggestions(trendAnalyzer, baselineCalculator, metricsStore, localDb);
    const dailyBriefingGenerator = new DailyBriefingGenerator(
      proactiveSuggestions,
      metricsStore,
      trendAnalyzer,
      baselineCalculator,
      localDb
    );

    // Initialize Automation Engine v2 (Phase 4)
    const automationEngineV2 = new AutomationEngineV2(knowledgeDb);
    await automationEngineV2.initialize();

    console.log('[ELO] Phase 4 Automation Engine v2 initialized successfully');

    // Schedule daily briefing generation (8 AM daily)
    dailyBriefingGenerator.scheduleDailyBriefing();

    console.log('[ELO] Phase 5 components initialized successfully');

    // Initialize Phase 3: Correlation Engine + Rule Proposer
    console.log('[ELO] Initializing Phase 3: Correlation Engine + Rule Proposer...');
    const correlationEngine = initCorrelationEngine();
    const ruleProposer = new RuleProposer(knowledgeDb);

    // Schedule periodic correlation analysis (every 6 hours)
    const CORRELATION_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
    const runCorrelationCycle = async () => {
      try {
        console.log('[ELO] Running correlation analysis cycle...');
        const result = await correlationEngine.analyzeCorrelations();
        if (result.patterns.length > 0) {
          console.log(`[ELO] Found ${result.patterns.length} correlation patterns, proposing rules...`);
          const proposedRules = await ruleProposer.proposeRulesFromPatterns();
          if (proposedRules.length > 0) {
            await ruleProposer.saveProposedRules(proposedRules);
            console.log(`[ELO] Saved ${proposedRules.length} proposed rules for review`);
          }
        } else {
          console.log('[ELO] No significant correlation patterns found');
        }
      } catch (error) {
        console.error('[ELO] Correlation analysis error:', error);
      }
    };

    // Run first analysis after 5 minutes, then every 6 hours
    setTimeout(runCorrelationCycle, 5 * 60 * 1000);
    setInterval(runCorrelationCycle, CORRELATION_INTERVAL);

    // API routes for correlation and proposed rules
    app.get('/api/correlations', async (_req, res) => {
      try {
        const patterns = correlationEngine.getHighConfidencePatterns();
        res.json({ success: true, data: patterns });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.get('/api/rules/proposed', async (_req, res) => {
      try {
        const rules = await ruleProposer.getProposedRules();
        res.json({ success: true, data: rules });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.post('/api/rules/proposed/:id/approve', async (req, res) => {
      try {
        await ruleProposer.approveRule(Number(req.params.id));
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.post('/api/rules/proposed/:id/reject', async (req, res) => {
      try {
        await ruleProposer.rejectRule(Number(req.params.id));
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    console.log('[ELO] Phase 3 Correlation Engine initialized successfully');

    // Register HTTP UI routes with Phase 5 components
    registerHttpUi(app, dailyBriefingGenerator);

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

    // Register existing camera streams with go2rtc
    syncCameraStreams().catch((err: Error) => console.error('[ELO] Failed to sync camera streams:', err));

    // Start face detection worker
    faceDetectionWorker.start()
        .then(() => console.log('[ELO] Face detection worker started'))
        .catch((err: Error) => console.error('[ELO] Failed to start face detection:', err));

    const decisionEnabled = process.env.ELO_DECISION_LOOP_ENABLED !== 'false';
    if (decisionEnabled) {
        console.log('[ELO] Starting Decision Loop...');
        const intervalMs = Number.parseInt(process.env.ELO_DECISION_INTERVAL_MS || '10000', 10);
        const logLimit = Number.parseInt(process.env.ELO_DECISION_LOG_LIMIT || '100', 10);
        const requestLimit = Number.parseInt(process.env.ELO_DECISION_REQUEST_LIMIT || '50', 10);
        startDecisionLoop({ intervalMs, logLimit, requestLimit });
    }
};

startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});