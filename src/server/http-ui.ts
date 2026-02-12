import express from 'express';
import path from 'path';
import fs from 'fs';
import AIAgent from '../ai/agent';
import { readDevices, updateDevice, deleteDevice } from '../cli/utils/device-registry';
import { appendRequestLog, readRecentAiUsage, readRecentLogs, readRecentRequests } from '../cli/utils/storage-files';
import type { AiUsageLogEntry } from '../cli/utils/storage-files';
import { getLatestSuggestions, getPendingSuggestions } from '../cli/utils/suggestions';
import { getPreferenceSummary } from '../cli/utils/preferences';
import { buildDecisionContext, buildDeviceStatusHistory, buildDeviceStatusSnapshot, formatDecisionContext } from './decision-context';
import { maskConfigValue, readConfig, writeConfig } from './config';
import { dispatchAction } from './action-dispatcher';
import { triggerDriverGeneration } from './generators/driver-generator';

const DEFAULT_LIMIT = 50;
const STATUS_HISTORY_LIMIT = 20;
const DEFAULT_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_API_BASE_URL',
  'GEMINI_API_MODEL',
  'THINKING_BUDGET'
];

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
  /(rating|placar|jogador|torneio|liga|pontua|partida|score|match|game|automation engine|modelo de linguagem|sem acesso ao ambiente|não tenho acesso|sou uma inteligência artificial|capacidade de interagir|mundo físico|minha programação|aparelho de ar-condicionado|luzes indicadoras|sinta o ar|ouça o aparelho|verifique a energia)/i.test(text);

const fallbackReply = () =>
  'Bom dia (DEBUG). Estou à disposição para cuidar da casa e dos dispositivos. O que deseja ajustar agora?';

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
  const [devices, logs, requests, pending, suggestions, preferenceSummary] = await Promise.all([
    readDevices(),
    readRecentLogs(limit),
    readRecentRequests(limit),
    getPendingSuggestions(),
    getLatestSuggestions(),
    getPreferenceSummary()
  ]);
  const statusSnapshot = buildDeviceStatusSnapshot(logs);
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

export const registerHttpUi = (app: express.Express) => {
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
      const limit = parseLimit(req.query.limit, DEFAULT_LIMIT);
      const [devices, logs] = await Promise.all([readDevices(), readRecentLogs(limit)]);
      const statusSnapshot = buildDeviceStatusSnapshot(logs);
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

    try {
      const sessionKey = typeof sessionId === 'string' && sessionId.trim()
        ? sessionId.trim()
        : typeof user === 'string' && user.trim()
          ? `user:${user.trim()}`
          : 'default';
      const [devices, logs, requests] = await Promise.all([
        readDevices(),
        readRecentLogs(DEFAULT_LIMIT),
        readRecentRequests(DEFAULT_LIMIT)
      ]);
      const statusSnapshot = buildDeviceStatusSnapshot(logs);
      const statusHistory = buildDeviceStatusHistory(logs, Math.min(DEFAULT_LIMIT, STATUS_HISTORY_LIMIT));
      const contextPayload = buildDecisionContext(devices, statusSnapshot, statusHistory, requests);
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

      // START DEBUG LOG
      console.log('DEBUG CHECK:', { replyText, match: isOffTopic(replyText) });
      // END DEBUG LOG

      // START MODIFIED BLOCK
      if (!parsed || isOffTopic(replyText)) {
        const fallback = fallbackReply();
        rememberMessage(sessionKey, {
          role: 'assistant',
          message: fallback,
          timestamp: new Date().toISOString()
        });
        await appendRequestLog({
          timestamp: new Date().toISOString(),
          user: typeof user === 'string' ? user : 'default',
          request: message,
          context,
          payload: {
            channel: 'web-ui',
            sessionId: typeof sessionId === 'string' ? sessionId : undefined,
            originalReply: rawReply,
            fallbackReason: !parsed ? 'json_parse_error' : 'off_topic_detected'
          }
        });
        res.json({ success: true, data: { reply: fallback, action: null } });
        return;
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

      res.json({ success: true, data: { reply: clamped, action: parsed.action } });
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

  app.post('/api/devices/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const updated = await updateDevice(id, updates);
      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
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
        forceRegenerate: true
      });

      res.json({ success: true, message: 'Driver regeneration triggered background process.' });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.post('/api/devices/:id/actions/:action', async (req, res) => {
    try {
      const { id, action } = req.params;
      const result = await dispatchAction(`${id}=${action}`);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  app.get('/', (_req, res) => {
    res.sendFile(path.join(uiDir, 'index.html'));
  });

  app.use(express.static(uiDir));
};
