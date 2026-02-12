import { LogEntry, RequestLogEntry } from '../cli/utils/storage-files';
import { DeviceConfig } from '../cli/utils/device-registry';

export type DeviceStatusSnapshot = {
  device: string;
  lastEvent: string;
  timestamp: string;
  payload?: Record<string, unknown>;
};

export type DecisionRequestEntry = {
  timestamp: string;
  user?: string;
  request: string;
  contextLength?: number;
  payload?: Record<string, unknown>;
};

export type DeviceStatusHistoryEntry = {
  device: string;
  event: string;
  timestamp: string;
  payload?: Record<string, unknown>;
};

export type StructuredDecisionContext = {
  devices: DeviceConfig[];
  statusSnapshot: DeviceStatusSnapshot[];
  statusHistory: DeviceStatusHistoryEntry[];
  requests: DecisionRequestEntry[];
};

const SNAPSHOT_OMIT_KEYS = new Set(['raw', 'rawHex', 'headers', 'body', 'html', 'dump', 'log', 'trace']);
const MAX_SNAPSHOT_STRING = 512;
const MAX_PAYLOAD_STRING = 512;

const shouldSkipLogEntry = (entry: LogEntry) => {
  if (entry.device === 'discovery') {
    return true;
  }
  if (entry.event === 'device_discovery') {
    return true;
  }
  return false;
};

const truncate = (value: string, limit: number) => (value.length > limit
  ? `${value.slice(0, limit)}… [truncated ${value.length - limit} chars]`
  : value);

const sanitizeSnapshotPayload = (payload?: Record<string, unknown>) => {
  if (!payload) {
    return undefined;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SNAPSHOT_OMIT_KEYS.has(key)) {
      continue;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      result[key] = truncate(trimmed, MAX_SNAPSHOT_STRING);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    }
  }
  return Object.keys(result).length ? result : undefined;
};

const sanitizeRequestPayload = (payload?: Record<string, unknown>) => {
  if (!payload) {
    return undefined;
  }
  const allowedKeys = ['channel', 'sessionId', 'contextLength', 'fallbackReason', 'action', 'originalReply'];
  const result: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (!(key in payload)) {
      continue;
    }
    const value = payload[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      result[key] = truncate(trimmed, MAX_PAYLOAD_STRING);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    }
  }
  return Object.keys(result).length ? result : undefined;
};

const sanitizeRequestsForContext = (entries: RequestLogEntry[]): DecisionRequestEntry[] => {
  return entries.map((entry) => {
    const context = typeof entry.context === 'string' ? entry.context : '';
    const sanitized: DecisionRequestEntry = {
      timestamp: entry.timestamp,
      user: entry.user,
      request: entry.request
    };
    const payload = sanitizeRequestPayload(entry.payload);
    if (payload) {
      sanitized.payload = payload;
    }
    if (context.length) {
      sanitized.contextLength = context.length;
    }
    return sanitized;
  });
};

export const buildDeviceStatusSnapshot = (logs: LogEntry[]): DeviceStatusSnapshot[] => {
  const latest = new Map<string, DeviceStatusSnapshot>();

  logs.forEach((entry) => {
    if (shouldSkipLogEntry(entry)) {
      return;
    }
    const current = latest.get(entry.device);
    if (!current || entry.timestamp >= current.timestamp) {
      latest.set(entry.device, {
        device: entry.device,
        lastEvent: entry.event,
        timestamp: entry.timestamp,
        payload: sanitizeSnapshotPayload(entry.payload)
      });
    }
  });

  return Array.from(latest.values());
};

export const buildDeviceStatusHistory = (logs: LogEntry[], limit = 20): DeviceStatusHistoryEntry[] => {
  const chronological = logs
    .filter((entry) => !shouldSkipLogEntry(entry))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const history: DeviceStatusHistoryEntry[] = [];
  const lastSignature = new Map<string, string>();

  chronological.forEach((entry) => {
    const payload = sanitizeSnapshotPayload(entry.payload);
    const signature = JSON.stringify({ event: entry.event, payload });
    if (lastSignature.get(entry.device) === signature) {
      return;
    }
    lastSignature.set(entry.device, signature);
    history.push({
      device: entry.device,
      event: entry.event,
      timestamp: entry.timestamp,
      payload
    });
  });

  return history.slice(-limit);
};

export const formatDecisionContext = (context: StructuredDecisionContext) => {
  return JSON.stringify(context, null, 2);
};

export const buildDecisionContext = (
  devices: DeviceConfig[],
  statusSnapshot: DeviceStatusSnapshot[],
  statusHistory: DeviceStatusHistoryEntry[],
  requests: RequestLogEntry[]
): StructuredDecisionContext => ({
  devices,
  statusSnapshot,
  statusHistory,
  requests: sanitizeRequestsForContext(requests)
});
