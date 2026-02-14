import express from 'express';
import path from 'path';
import fs from 'fs';
import AIAgent from '../ai/agent';
import { readDevices, updateDevice, deleteDevice } from '../cli/utils/device-registry';
import { appendRequestLog, readRecentAiUsage, readRecentLogs, readRecentRequests, appendCorrection } from '../cli/utils/storage-files';
import type { AiUsageLogEntry } from '../cli/utils/storage-files';
import { getLatestSuggestions, getPendingSuggestions } from '../cli/utils/suggestions';
import { getPreferenceSummary } from '../cli/utils/preferences';
import { buildDecisionContext, buildDeviceStatusHistory, buildDeviceStatusSnapshot, formatDecisionContext } from './decision-context';
import { maskConfigValue, readConfig, writeConfig } from './config';
import { dispatchAction } from './action-dispatcher';
import { getDriver } from '../cli/utils/drivers';
import { triggerDriverGeneration } from './generators/driver-generator';
import axios from 'axios';
import { discoveryMetrics } from './discovery';
import * as go2rtc from './go2rtc';
import { registerCameraStream } from './go2rtc-sync';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { updateRuleConfidence, getAllRules } from './rules-engine';
import { createVoiceGateway } from './voice-gateway';
import { DailyBriefingGenerator } from './daily-briefing';

const DEFAULT_LIMIT = 50;
const STATUS_HISTORY_LIMIT = 20;
const DEFAULT_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_API_BASE_URL',
  'GEMINI_API_MODEL',
  'THINKING_BUDGET'
];

// Simple in-memory cache for snapshots (deviceId -> {data, timestamp})
const snapshotCache = new Map<string, { data: Buffer; contentType: string; timestamp: number }>();
const CACHE_DURATION_MS = 30000; // 30 seconds

const detectCorrection = (message: string): { isCorrection: boolean; deviceId?: string; action?: string; correctionType?: string } => {
  const lowerMessage = message.toLowerCase().trim();

  // Common correction patterns
  const correctionPatterns = [
    { pattern: /\b(muito|too)\s+(alto|alta|loud|quente|hot|frio|cold|claro|bright|escuro|dark|forte|strong|fraco|weak)\b/, type: 'parameter' },
    { pattern: /\b(demais|too much|enough|pare|pára|stop)\b/, type: 'stop' },
    { pattern: /\b(mais|more|menos|less|mais alto|louder|mais baixo|softer)\b/, type: 'adjustment' },
    { pattern: /\b(assim está bom|that's better|perfeito|perfect)\b/, type: 'approval' }
  ];

  for (const { pattern, type } of correctionPatterns) {
    if (pattern.test(lowerMessage)) {
      return { isCorrection: true, correctionType: type };
    }
  }

  return { isCorrection: false };
};

const validateCameraCredentials = async (ip: string, username: string, password: string, brand?: string): Promise<{ valid: boolean; error?: string }> => {
  // Temporary: Accept admin/admin credentials without validation for development
  if (username === 'admin' && password === 'admin') {
    return { valid: true };
  }
  
  try {
    // Try different endpoints based on brand or generic
    const testUrls = [];
    
    if (brand?.toLowerCase().includes('hikvision')) {
      testUrls.push(`http://${ip}/ISAPI/System/status`);
    } else if (brand?.toLowerCase().includes('reolink')) {
      testUrls.push(`http://${ip}/cgi-bin/api.cgi?cmd=GetDevInfo&user=${username}&password=${password}`);
    } else {
      // Generic test - try a common status endpoint
      testUrls.push(`http://${ip}/status`);
      testUrls.push(`http://${ip}/cgi-bin/status`);
    }

    for (const url of testUrls) {
      try {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        const response = await axios.get(url, {
          headers: {
            'Authorization': `Basic ${auth}`,
            'User-Agent': 'ELO-Camera-Validation/1.0'
          },
          timeout: 5000
        });
        
        if (response.status === 200) {
          return { valid: true };
        }
      } catch (error) {
        // Continue to next URL
        continue;
      }
    }
    
    return { valid: false, error: 'Credenciais inválidas ou câmera não responde' };
  } catch (error) {
    return { valid: false, error: `Erro na validação: ${(error as Error).message}` };
  }
};

const resolveUiDir = () => {
  const candidates = [
    path.join(__dirname, 'ui'),
    path.join(process.cwd(), 'src', 'server', 'ui')
  ];
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  return match ?? candidates[0];
};

const parseLimit = (value: unknown, fallback = DEFAULT_LIMIT) => {
  if (typeof value !== 'string') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const stripMarkdown = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/[#>*`_-]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const clampChatReply = (text: string) => {
  const plain = stripMarkdown(text);
  const sentences = plain.split(/(?<=[.!?])\s+/).filter(Boolean);
  const limited = sentences.slice(0, 2).join(' ');
  return limited.length > 240 ? `${limited.slice(0, 237)}...` : limited;
};

const parseChatJson = (text: string) => {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { action?: string | null; message?: string };
    if (typeof parsed.message !== 'string') return null;
    return {
      action: typeof parsed.action === 'string' ? parsed.action : null,
      message: parsed.message
    };
  } catch {
    return null;
  }
};

const isOffTopic = (text: string) =>
  /()/i.test(text);

const fallbackReply = () =>
  'Bom dia. Estou à disposição para cuidar da casa e dos dispositivos. O que deseja ajustar agora?';

type ChatMessage = {
  role: 'user' | 'assistant';
  message: string;
  timestamp: string;
};

const chatMemory = new Map<string, ChatMessage[]>();
const MAX_CHAT_HISTORY = 8;

const formatHistory = (entries: ChatMessage[]) =>
  entries.map((entry) => `${entry.role === 'user' ? 'Usuário' : 'ELO'}: ${entry.message}`).join(' | ');

const rememberMessage = (sessionKey: string, entry: ChatMessage) => {
  const history = chatMemory.get(sessionKey) ?? [];
  history.push(entry);
  chatMemory.set(sessionKey, history.slice(-MAX_CHAT_HISTORY));
};

const buildOverview = async (limit: number) => {
  const [devices, logs, requests, pending, suggestions, preferenceSummary, statusSnapshot] = await Promise.all([
    readDevices(),
    readRecentLogs(limit),
    readRecentRequests(limit),
    getPendingSuggestions(),
    getLatestSuggestions(),
    getPreferenceSummary(),
    buildDeviceStatusSnapshot()
  ]);
  const discovery = logs.filter((entry) => entry.event === 'device_discovery');

  return {
    timestamp: new Date().toISOString(),
    counts: {
      devices: devices.length,
      logs: logs.length,
      requests: requests.length,
      pendingSuggestions: pending.length
    },
    devices,
    statusSnapshot,
    logs,
    requests,
    pendingSuggestions: pending,
    suggestions,
    discovery,
    preferenceSummary
  };
};

const buildAiUsageReport = async (limit: number) => {
  const entries = await readRecentAiUsage(limit);
  if (entries.length === 0) {
    return {
      summary: {
        totalRequests: 0,
        totalPromptChars: 0,
        totalResponseChars: 0,
        avgPromptChars: 0,
        avgResponseChars: 0,
        avgLatencyMs: 0,
        windowStart: null,
        windowEnd: null
      },
      byTag: [],
      bySource: [],
      recent: [] as AiUsageLogEntry[]
    };
  }

  let totalPromptChars = 0;
  let totalResponseChars = 0;
  let totalLatencyMs = 0;

  const byTag = new Map<string, { tag: string; requests: number; promptChars: number; responseChars: number; latencyMs: number }>();
  const bySource = new Map<string, { source: string; requests: number; promptChars: number; responseChars: number; latencyMs: number }>();

  entries.forEach((entry) => {
    const promptChars = Number.isFinite(entry.promptChars) ? entry.promptChars : 0;
    const responseChars = Number.isFinite(entry.responseChars) ? entry.responseChars : 0;
    const latencyMs = Number.isFinite(entry.latencyMs) ? entry.latencyMs : 0;

    totalPromptChars += promptChars;
    totalResponseChars += responseChars;
    totalLatencyMs += latencyMs;

    const sourceKey = entry.source || 'unknown';
    const sourceStats = bySource.get(sourceKey) ?? { source: sourceKey, requests: 0, promptChars: 0, responseChars: 0, latencyMs: 0 };
    sourceStats.requests += 1;
    sourceStats.promptChars += promptChars;
    sourceStats.responseChars += responseChars;
    sourceStats.latencyMs += latencyMs;
    bySource.set(sourceKey, sourceStats);

    const tags = Array.isArray(entry.tags) && entry.tags.length ? entry.tags : ['untagged'];
    tags.forEach((tag) => {
      const safeTag = tag || 'untagged';
      const tagStats = byTag.get(safeTag) ?? { tag: safeTag, requests: 0, promptChars: 0, responseChars: 0, latencyMs: 0 };
      tagStats.requests += 1;
      tagStats.promptChars += promptChars;
      tagStats.responseChars += responseChars;
      tagStats.latencyMs += latencyMs;
      byTag.set(safeTag, tagStats);
    });
  });

  const average = (total: number, count: number) => (count > 0 ? Math.round(total / count) : 0);

  return {
    summary: {
      totalRequests: entries.length,
      totalPromptChars,
      totalResponseChars,
      avgPromptChars: average(totalPromptChars, entries.length),
      avgResponseChars: average(totalResponseChars, entries.length),
      avgLatencyMs: average(totalLatencyMs, entries.length),
      windowStart: entries[0]?.timestamp ?? null,
      windowEnd: entries[entries.length - 1]?.timestamp ?? null
    },
    byTag: Array.from(byTag.values()).sort((a, b) => b.promptChars - a.promptChars || b.requests - a.requests),
    bySource: Array.from(bySource.values()).sort((a, b) => b.promptChars - a.promptChars || b.requests - a.requests),
    recent: entries.slice(-20).reverse()
  };
};

export const registerHttpUi = (app: express.Express, dailyBriefingGenerator?: DailyBriefingGenerator) => {
  const uiDir = resolveUiDir();
  const agent = new AIAgent();

  app.get('/api/status', async (req, res) => {
    try {
      const limit = parseLimit(req.query.limit, DEFAULT_LIMIT);
      const overview = await buildOverview(limit);
      res.json({ success: true, data: overview });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/devices', async (req, res) => {
    try {
      const [devices, statusSnapshot] = await Promise.all([
        readDevices(),
        buildDeviceStatusSnapshot()
      ]);
      res.json({ success: true, data: { devices, statusSnapshot } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/discovery', async (req, res) => {
    try {
      const limit = parseLimit(req.query.limit, DEFAULT_LIMIT);
      const logs = await readRecentLogs(limit);
      const discovery = logs.filter((entry) => entry.event === 'device_discovery');
      res.json({ success: true, data: discovery });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/discovery/metrics', async (req, res) => {
    try {
      res.json({ success: true, data: discoveryMetrics });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/ai-usage', async (req, res) => {
    try {
      const limit = parseLimit(req.query.limit, 200);
      const usage = await buildAiUsageReport(limit);
      res.json({ success: true, data: usage });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/requests', async (req, res) => {
    try {
      const limit = parseLimit(req.query.limit, DEFAULT_LIMIT);
      const requests = await readRecentRequests(limit);
      res.json({ success: true, data: requests });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/suggestions', async (_req, res) => {
    try {
      const suggestions = await getLatestSuggestions();
      res.json({ success: true, data: suggestions });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.post('/api/chat', async (req, res) => {
    const { message, user, context, sessionId } = req.body ?? {};
    if (!message || typeof message !== 'string') {
      res.status(400).json({ success: false, error: 'message is required' });
      return;
    }

    // Check if this is a correction message
    const correction = detectCorrection(message);
    if (correction.isCorrection) {
      try {
        // For corrections, we need to find the last action that might need correction
        // This is a simplified approach - in production, you'd want more sophisticated logic
        const recentRequests = await readRecentRequests(10);
        const lastActionRequest = recentRequests.find(r => r.payload?.action);

        if (lastActionRequest && lastActionRequest.payload?.action && typeof lastActionRequest.payload.action === 'string') {
          const actionParts = lastActionRequest.payload.action.split('=');
          if (actionParts.length === 2) {
            const [deviceId, action] = actionParts;

            // Create a correction based on the detected type
            let correctedParams = {};
            if (correction.correctionType === 'stop') {
              correctedParams = { state: 'off' };
            } else if (correction.correctionType === 'parameter') {
              // This would need more sophisticated parsing in production
              correctedParams = { volume: 50, temperature: 22 }; // Default corrections
            }

            // Send correction
            const correctionResponse = await fetch(`${req.protocol}://${req.get('host')}/api/corrections`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                deviceId,
                action,
                originalParams: lastActionRequest.payload?.originalParams || {},
                correctedParams,
                context: {
                  time: new Date().toTimeString().slice(0, 5),
                  day: new Date().getDay(),
                  peoplePresent: []
                }
              })
            });

            if (correctionResponse.ok) {
              res.json({
                success: true,
                data: {
                  reply: 'Entendi a correção. Vou ajustar minhas ações futuras.',
                  action: null,
                  correction: true
                }
              });
              return;
            }
          }
        }
      } catch (error) {
        console.error('[Chat] Failed to process correction:', error);
        // Fall through to normal chat processing
      }
    }

    try {
      const sessionKey = typeof sessionId === 'string' && sessionId.trim()
        ? sessionId.trim()
        : typeof user === 'string' && user.trim()
          ? `user:${user.trim()}`
          : 'default';
      const [devices, statusSnapshot, statusHistory, requests] = await Promise.all([
        readDevices(),
        buildDeviceStatusSnapshot(),
        buildDeviceStatusHistory(Math.min(DEFAULT_LIMIT, STATUS_HISTORY_LIMIT)),
        readRecentRequests(DEFAULT_LIMIT)
      ]);
      const contextPayload = await buildDecisionContext(devices);
      const context = formatDecisionContext(contextPayload);
      const history = chatMemory.get(sessionKey) ?? [];
      const historyText = history.length ? formatHistory(history) : undefined;
      rememberMessage(sessionKey, {
        role: 'user',
        message,
        timestamp: new Date().toISOString()
      });
      const rawReply = await agent.processInputWithContext({ message, context, history: historyText });
      const parsed = parseChatJson(rawReply);
      const replyText = parsed ? parsed.message : rawReply;

      // START MODIFIED BLOCK
      // if (isOffTopic(replyText)) {
      //   const fallback = fallbackReply();
      //   rememberMessage(sessionKey, {
      //     role: 'assistant',
      //     message: fallback,
      //     timestamp: new Date().toISOString()
      //   });
      //   await appendRequestLog({
      //     timestamp: new Date().toISOString(),
      //     user: typeof user === 'string' ? user : 'default',
      //     request: message,
      //     context,
      //     payload: {
      //       channel: 'web-ui',
      //       sessionId: typeof sessionId === 'string' ? sessionId : undefined,
      //       originalReply: rawReply,
      //       fallbackReason: 'off_topic_detected'
      //     }
      //   });
      //   res.json({ success: true, data: { reply: fallback, action: null } });
      //   return;
      // }
      
      // If parsing failed, we use the raw reply as the message (Best Effort)
      if (!parsed) {
         console.warn('[Chat] JSON Parsing failed. Using raw reply.');
      }
      // END MODIFIED BLOCK

      const clamped = clampChatReply(replyText);
      rememberMessage(sessionKey, {
        role: 'assistant',
        message: clamped,
        timestamp: new Date().toISOString()
      });
      await appendRequestLog({
        timestamp: new Date().toISOString(),
        user: typeof user === 'string' ? user : 'default',
        request: message,
        context,
        payload: {
          channel: 'web-ui',
          contextLength: context.length,
          sessionId: typeof sessionId === 'string' ? sessionId : undefined
        }
      });

      if (parsed?.action) {
        await dispatchAction(parsed.action);
      }

      res.json({ success: true, data: { reply: clamped, action: parsed ? parsed.action : null } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.post('/api/corrections', async (req, res) => {
    const { deviceId, action, originalParams, correctedParams, context } = req.body ?? {};

    if (!deviceId || typeof deviceId !== 'string') {
      res.status(400).json({ success: false, error: 'deviceId is required and must be a string' });
      return;
    }

    if (!action || typeof action !== 'string') {
      res.status(400).json({ success: false, error: 'action is required and must be a string' });
      return;
    }

    if (!originalParams || typeof originalParams !== 'object') {
      res.status(400).json({ success: false, error: 'originalParams is required and must be an object' });
      return;
    }

    if (!correctedParams || typeof correctedParams !== 'object') {
      res.status(400).json({ success: false, error: 'correctedParams is required and must be an object' });
      return;
    }

    try {
      const correctionEntry = {
        deviceId,
        action,
        originalParams,
        correctedParams,
        context: context || {
          time: new Date().toTimeString().slice(0, 5), // HH:MM format
          day: new Date().getDay(), // 0-6, Sunday=0
          peoplePresent: []
        },
        timestamp: new Date().toISOString()
      };

      await appendCorrection(correctionEntry);

      // Emit event for real-time processing
      const { emitUserCorrection } = await import('./event-bus');
      emitUserCorrection({
        deviceId,
        action,
        originalParams,
        correctedParams,
        context: correctionEntry.context,
        timestamp: correctionEntry.timestamp
      });

      // Penalize rules that may have caused this correction
      try {
        const rules = await getAllRules();
        const relevantRules = rules.filter(rule =>
          rule.triggerType === 'event' &&
          rule.triggerConfig.eventType === 'device_action' &&
          rule.triggerConfig.deviceId === deviceId &&
          rule.triggerConfig.action === action
        );

        for (const rule of relevantRules) {
          // Check if the rule's action matches the original params that were corrected
          const ruleAction = rule.actions[0];
          if (ruleAction && JSON.stringify(ruleAction.params) === JSON.stringify(originalParams)) {
            await updateRuleConfidence(rule.id, false);
            console.log(`[CorrectionsAPI] Decreased confidence for rule ${rule.id} due to user correction`);
          }
        }
      } catch (error) {
        console.error('[CorrectionsAPI] Failed to update rule confidence:', error);
      }

      res.json({ success: true, data: { id: 'correction-recorded' } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/config', async (_req, res) => {
    try {
      const snapshot = await readConfig({ keys: DEFAULT_KEYS });
      const masked = Object.fromEntries(
        Object.entries(snapshot.values).map(([key, value]) => [
          key,
          {
            value: maskConfigValue(value),
            configured: Boolean(value)
          }
        ])
      );
      res.json({ success: true, data: { filePath: snapshot.filePath, values: masked } });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.post('/api/config', async (req, res) => {
    const updates = req.body?.updates ?? {};
    if (!updates || typeof updates !== 'object') {
      res.status(400).json({ success: false, error: 'updates object is required' });
      return;
    }

    try {
      const snapshot = await writeConfig(updates as Record<string, string>);
      const changedKeys = Object.keys(updates);
      res.json({
        success: true,
        data: {
          updated: changedKeys,
          filePath: snapshot.filePath,
          restartRequired: true
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/devices/:id/snapshot', async (req, res) => {
    try {
      const { id } = req.params;
      const devices = await readDevices();
      const device = devices.find(d => d.id === id);
      
      if (!device || device.type !== 'camera') {
        res.status(404).json({ success: false, error: 'Camera device not found' });
        return;
      }

      // Check cache first
      const cached = snapshotCache.get(id);
      if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION_MS) {
        res.setHeader('Content-Type', cached.contentType);
        res.setHeader('Cache-Control', 'public, max-age=30');
        res.setHeader('X-Cache', 'HIT');
        res.send(cached.data);
        return;
      }

      // Try to get snapshot using the device's driver
      const result = await dispatchAction(`${id}=getSnapshot`);
      
      if (result && result.success && (result as any).data) {
        // If the driver returned image data, serve it
        const resultData = (result as any).data;
        let imageBuffer: Buffer;
        let contentType = 'image/jpeg';

        if (typeof resultData === 'string' && resultData.startsWith('data:image')) {
          const base64Data = resultData.split(',')[1];
          imageBuffer = Buffer.from(base64Data, 'base64');
          contentType = resultData.split(';')[0].split(':')[1] || 'image/jpeg';
        } else if (resultData.url) {
          // For external URLs, we can't cache binary data easily
          // Just redirect without caching
          res.redirect(resultData.url);
          return;
        } else {
          res.status(404).json({ success: false, error: 'No snapshot available' });
          return;
        }

        // Cache the result
        snapshotCache.set(id, {
          data: imageBuffer,
          contentType,
          timestamp: Date.now()
        });

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=30');
        res.setHeader('X-Cache', 'MISS');
        res.send(imageBuffer);
      } else {
        res.status(500).json({ success: false, error: 'Failed to get snapshot' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/api/devices/:id/stream', async (req, res) => {
    try {
      const { id } = req.params;
      const devices = await readDevices();
      const device = devices.find(d => d.id === id);
      
      if (!device || device.type?.toLowerCase() !== 'camera') {
        res.status(404).json({ success: false, error: 'Camera device not found' });
        return;
      }

      // Build the raw RTSP URL from driver config
      const driverEntry = await getDriver(id);
      if (!driverEntry || !(driverEntry.config as any).actions?.getStream) {
        res.status(404).json({ success: false, error: 'Stream action not available' });
        return;
      }

      const action = (driverEntry.config as any).actions.getStream;
      let rtspUrl = action.url;
      
      // Replace placeholders with device credentials
      if (device.username) rtspUrl = rtspUrl.replace(/{username}/g, device.username);
      if (device.password) rtspUrl = rtspUrl.replace(/{password}/g, device.password);
      if (device.ip) rtspUrl = rtspUrl.replace(/{ip}/g, device.ip);

      // For RTSP sources: register TWO sources for go2rtc:
      //   1) Native RTSP with UDP (snapshots + H265-capable clients)
      //   2) FFmpeg transcoding H265→H264 with UDP (Chrome/Firefox WebRTC)
      // go2rtc automatically picks the right source based on client codec support.
      const go2rtcSources: string[] = [];
      if (rtspUrl.startsWith('rtsp://')) {
        go2rtcSources.push(`${rtspUrl}#transport=udp`);
        go2rtcSources.push(`ffmpeg:${rtspUrl}#input=rtsp/udp#video=h264`);
      } else {
        go2rtcSources.push(rtspUrl);
      }
      
      // Register stream in go2rtc (idempotent) - all sources in one call
      const go2rtcAvailable = await go2rtc.isAvailable();
      
      if (go2rtcAvailable) {
        await go2rtc.registerStream(id, ...go2rtcSources);
        
        const sName = go2rtc.streamName(id);
        
        res.json({ 
          success: true, 
          data: {
            streamUrl: rtspUrl,
            type: 'go2rtc',
            go2rtc: {
              available: true,
              streamName: sName,
              viewerUrl: `/go2rtc/stream.html?src=${encodeURIComponent(sName)}&mode=mse`,
              webrtcUrl: `/go2rtc/api/webrtc?src=${encodeURIComponent(sName)}`,
              mseUrl: `/go2rtc/api/stream.mp4?src=${encodeURIComponent(sName)}`,
              frameUrl: `/api/devices/${id}/frame`
            }
          }
        });
      } else {
        // Fallback: return raw RTSP URL if go2rtc is not available
        res.json({ 
          success: true, 
          data: {
            streamUrl: rtspUrl,
            type: rtspUrl.startsWith('rtsp://') ? 'rtsp' : 'http',
            go2rtc: { available: false }
          }
        });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // ── go2rtc frame (snapshot) via go2rtc ──────────────────────
  app.get('/api/devices/:id/frame', async (req, res) => {
    try {
      const { id } = req.params;
      const devices = await readDevices();
      const device = devices.find(d => d.id === id);
      
      if (!device || device.type?.toLowerCase() !== 'camera') {
        res.status(404).json({ success: false, error: 'Camera device not found' });
        return;
      }

      const frame = await go2rtc.getFrame(id);
      if (frame) {
        res.setHeader('Content-Type', frame.contentType);
        res.setHeader('Cache-Control', 'no-cache');
        res.send(frame.data);
      } else {
        res.status(502).json({ success: false, error: 'go2rtc frame not available' });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // ── go2rtc proxy: forward /go2rtc/* to go2rtc server (HTTP + WebSocket) ──
  const GO2RTC_PROXY_TARGET = process.env.GO2RTC_URL || 'http://127.0.0.1:1984';
  app.use('/go2rtc', createProxyMiddleware({
    target: GO2RTC_PROXY_TARGET,
    changeOrigin: true,
    ws: true,
    pathRewrite: { '^/go2rtc': '' },
    on: {
      error: (err, _req, res) => {
        console.error('[go2rtc-proxy]', err.message);
        if (res && 'writeHead' in res) {
          (res as any).writeHead?.(502, { 'Content-Type': 'application/json' });
          (res as any).end?.(JSON.stringify({ success: false, error: 'go2rtc proxy error' }));
        }
      }
    }
  }));

  app.post('/api/devices/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      await updateDevice(id, updates);
      
      // Read updated device to return
      const devices = await readDevices();
      const updatedDevice = devices.find(d => d.id === id);
      
      // Auto-register camera stream with go2rtc when camera is updated
      if (updates.type?.toLowerCase() === 'camera' || updates.type === 'Camera') {
        if (updatedDevice) {
          registerCameraStream(updatedDevice).catch((e: Error) => 
            console.error(`[API] Failed to register camera stream for ${id}:`, e.message)
          );
        }
      }
      
      res.json({ success: true, data: updatedDevice, message: 'Dispositivo atualizado!' });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.post('/api/devices/:id/pair', async (req, res) => {
    const { id } = req.params;
    console.log(`[API] Solicitação de emparelhamento para o dispositivo ${id}`);
    try {
      const result = await dispatchAction(`${id}=requestPairing`);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete('/api/devices/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await deleteDevice(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.post('/api/devices/:id/regenerate', async (req, res) => {
    try {
      const { id } = req.params;
      const devices = await readDevices();
      const device = devices.find(d => d.id === id);
      
      if (!device) {
        res.status(404).json({ success: false, error: 'Device not found' });
        return;
      }

      // Re-trigger generation using current device info
      // We pass forceRegenerate: true to skip the "already exists" check
      triggerDriverGeneration({
        ip: device.ip,
        name: device.name,
        type: device.type,
        protocol: device.protocol,
        source: 'manual_trigger',
        notes: (device as any).notes || (device as any).customNotes,
        forceRegenerate: true,
        // Pass credentials and metadata to prevent loss during regeneration
        brand: device.brand,
        model: device.model,
        username: device.username,
        password: device.password
      });

      res.json({ success: true, message: 'Driver regeneration triggered background process.' });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.post('/api/devices/:id/actions/:action', async (req: express.Request, res: express.Response) => {
    try {
      const { id, action } = req.params;
      const result = await dispatchAction(`${id}=${action}`);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Daily Briefing endpoints (Phase 5)
  if (dailyBriefingGenerator) {
    app.get('/api/briefing', async (req: express.Request, res: express.Response) => {
      try {
        const briefing = await dailyBriefingGenerator.generateDailyBriefing();
        res.json({ success: true, data: briefing });
      } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message });
      }
    });

    app.get('/api/briefing/text', async (req: express.Request, res: express.Response) => {
      try {
        const briefing = await dailyBriefingGenerator.generateDailyBriefing();
        const text = await dailyBriefingGenerator.generateBriefingText(briefing);
        res.set('Content-Type', 'text/plain');
        res.send(text);
      } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message });
      }
    });

    app.get('/api/briefing/html', async (req: express.Request, res: express.Response) => {
      try {
        const briefing = await dailyBriefingGenerator.generateDailyBriefing();
        const html = await dailyBriefingGenerator.generateBriefingHTML(briefing);
        res.set('Content-Type', 'text/html');
        res.send(html);
      } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message });
      }
    });
  }

  app.post('/api/system/reset', async (_req: express.Request, res: express.Response) => {
    try {
      console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      console.log('[System] Manual reset EXECUTION started...');
      console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');

      // Import database functions
      let Database;
      try {
        Database = (await import('better-sqlite3')).default;
      } catch (err) {
        throw new Error('Failed to load better-sqlite3');
      }

      const path = await import('path');
      const fs = await import('fs');

      const dbPath = path.join(process.cwd(), 'data', 'elo.db');
      
      const db = new Database(dbPath);

      // Note: This reset endpoint might need update to support async sqlite3 if used in production
      // For now, assuming better-sqlite3 logic or synchronous compatible usage
      // But sqlite3 is async. This endpoint needs refactoring if sqlite3 is used.
      
      // Let's defer this specific refactor unless requested, as it's a "reset" endpoint.
      // But we should at least not crash on import.
      
      try {
        // 1. Clear all database tables
        console.log('[System] Clearing database tables...');
        db.exec('DELETE FROM events');
        db.exec('DELETE FROM requests');
        db.exec('DELETE FROM suggestions');
        db.exec('DELETE FROM ai_usage');
        db.exec('DELETE FROM drivers');
        db.exec('DELETE FROM devices');
        db.exec('DELETE FROM decisions');

        // Reset autoincrement counters
        db.exec('DELETE FROM sqlite_sequence');

        console.log('[System] Database tables cleared.');

        // 2. Clear legacy log files (if they exist)
        const logsDir = path.join(process.cwd(), 'logs');
        const logFiles = ['events.jsonl', 'requests.jsonl', 'suggestions.jsonl', 'ai-usage.jsonl'];
        for (const file of logFiles) {
          const filePath = path.join(logsDir, file);
          if (fs.existsSync(filePath)) {
            await fs.promises.writeFile(filePath, '', 'utf-8');
          }
        }

        // 3. Clear driver files
        const driversDir = path.join(logsDir, 'drivers');
        if (fs.existsSync(driversDir)) {
          const files = await fs.promises.readdir(driversDir);
          for (const file of files) {
            if (file.endsWith('.json')) {
              await fs.promises.unlink(path.join(driversDir, file));
            }
          }
        }

        console.log('[System] Reset completed successfully.');
        res.json({ success: true, message: 'System reset completed. All devices, drivers, and tokens purged from database.' });
      } finally {
        db.close();
      }
    } catch (error) {
      console.error('[System] Reset failed:', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // Register voice gateway endpoints
  const voiceGateway = createVoiceGateway();
  app.use('/api/voice', voiceGateway);

  app.get('/', (_req: express.Request, res: express.Response) => {
    res.sendFile(path.join(uiDir, 'index.html'));
  });

  app.use(express.static(uiDir));
};
