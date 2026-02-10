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

const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const getBasePath = () => process.env.ELO_FILES_PATH || process.cwd();

export const getLogsDir = () => path.join(getBasePath(), 'logs');
export const getRequestsLogPath = () => path.join(getLogsDir(), 'requests.jsonl');

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
  const payload = {
    timestamp: entry.timestamp || new Date().toISOString(),
    user: entry.user ?? 'default',
    request: entry.request,
    context: entry.context ?? '',
    payload: entry.payload ?? {}
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
