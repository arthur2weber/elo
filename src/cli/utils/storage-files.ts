import { promises as fs } from 'fs';
import path from 'path';

export type LogEntry = {
  timestamp: string;
  device: string;
  event: string;
  payload?: Record<string, unknown>;
};

export type RequestLogEntry = {
  timestamp: string;
  user?: string;
  request: string;
  context?: string;
  payload?: Record<string, unknown>;
};

export type AiUsageLogEntry = {
  timestamp: string;
  source: string;
  tags: string[];
  model: string;
  promptChars: number;
  responseChars: number;
  latencyMs: number;
  thinkingBudget?: number | null;
  extra?: Record<string, unknown>;
};

const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const getBasePath = () => process.env.ELO_FILES_PATH || process.cwd();

export const getLogsDir = () => path.join(getBasePath(), 'logs');
export const getRequestsLogPath = () => path.join(getLogsDir(), 'requests.jsonl');
export const getAiUsageLogPath = () => path.join(getLogsDir(), 'ai-usage.jsonl');

export const appendLogEntry = async (entry: LogEntry) => {
  const logsDir = getLogsDir();
  await ensureDir(logsDir);
  const logPath = path.join(logsDir, 'events.jsonl');
  const payload = {
    timestamp: entry.timestamp || new Date().toISOString(),
    device: entry.device,
    event: entry.event,
    payload: entry.payload ?? {}
  };
  await fs.appendFile(logPath, `${JSON.stringify(payload)}\n`);
  return { logPath, entry: payload };
};

export const readRecentLogs = async (limit = 50): Promise<LogEntry[]> => {
  const logsDir = getLogsDir();
  await ensureDir(logsDir);
  const logPath = path.join(logsDir, 'events.jsonl');
  try {
    const file = await fs.readFile(logPath, 'utf-8');
    const lines = file.split('\n').filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line) as LogEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

export const appendRequestLog = async (entry: RequestLogEntry) => {
  const logsDir = getLogsDir();
  await ensureDir(logsDir);
  const logPath = getRequestsLogPath();
  const contextLimit = Number.parseInt(process.env.ELO_REQUEST_CONTEXT_LOG_LIMIT ?? '4000', 10);
  const resolvedLimit = Number.isFinite(contextLimit) && contextLimit > 0 ? contextLimit : 4000;
  const fullContext = typeof entry.context === 'string' ? entry.context : '';
  const isTruncated = fullContext.length > resolvedLimit;
  const storedContext = isTruncated
    ? `${fullContext.slice(0, resolvedLimit)}… [truncated ${fullContext.length - resolvedLimit} chars]`
    : fullContext;
  const payloadMeta: Record<string, unknown> = {
    ...(entry.payload ?? {})
  };
  if (typeof payloadMeta.contextLength !== 'number') {
    payloadMeta.contextLength = fullContext.length;
  }
  if (isTruncated) {
    payloadMeta.contextTruncated = true;
  }
  const payload = {
    timestamp: entry.timestamp || new Date().toISOString(),
    user: entry.user ?? 'default',
    request: entry.request,
    context: storedContext,
    payload: payloadMeta
  };
  await fs.appendFile(logPath, `${JSON.stringify(payload)}\n`);
  return { logPath, entry: payload };
};

export const readRecentRequests = async (limit = 50): Promise<RequestLogEntry[]> => {
  const logsDir = getLogsDir();
  await ensureDir(logsDir);
  const logPath = getRequestsLogPath();
  try {
    const file = await fs.readFile(logPath, 'utf-8');
    const lines = file.split('\n').filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line) as RequestLogEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

export const appendAiUsageLog = async (entry: AiUsageLogEntry) => {
  const logsDir = getLogsDir();
  await ensureDir(logsDir);
  const logPath = getAiUsageLogPath();
  const tags = Array.isArray(entry.tags) ? Array.from(new Set(entry.tags.map((tag) => String(tag).trim()).filter(Boolean))) : [];
  const payload = {
    timestamp: entry.timestamp || new Date().toISOString(),
    source: entry.source,
    tags,
    model: entry.model,
    promptChars: Number.isFinite(entry.promptChars) ? Math.max(0, Math.floor(entry.promptChars)) : 0,
    responseChars: Number.isFinite(entry.responseChars) ? Math.max(0, Math.floor(entry.responseChars)) : 0,
    latencyMs: Number.isFinite(entry.latencyMs) ? Math.max(0, Math.floor(entry.latencyMs)) : 0,
    thinkingBudget: typeof entry.thinkingBudget === 'number' && Number.isFinite(entry.thinkingBudget)
      ? Math.max(0, Math.floor(entry.thinkingBudget))
      : null,
    extra: entry.extra ?? {}
  };
  await fs.appendFile(logPath, `${JSON.stringify(payload)}\n`);
  return { logPath, entry: payload };
};

export const readRecentAiUsage = async (limit = 200): Promise<AiUsageLogEntry[]> => {
  const logsDir = getLogsDir();
  await ensureDir(logsDir);
  const logPath = getAiUsageLogPath();
  try {
    const file = await fs.readFile(logPath, 'utf-8');
    const lines = file.split('\n').filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line) as AiUsageLogEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};
