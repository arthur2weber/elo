import { getLocalDb } from './database';
import { RequestLogEntry, readRecentRequests } from '../cli/utils/storage-files';
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

const getDb = () => getLocalDb();

const SNAPSHOT_OMIT_KEYS = new Set(['raw', 'rawHex', 'headers', 'body', 'html', 'dump', 'log', 'trace']);
const MAX_SNAPSHOT_STRING = 512;
const MAX_PAYLOAD_STRING = 512;

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

export const buildDeviceStatusSnapshot = async (): Promise<DeviceStatusSnapshot[]> => {
  const db = getDb();
  // Get latest event per device, excluding discovery events
  const rows = db.prepare(`
    SELECT device_id, event_type, timestamp, state
    FROM events
    WHERE device_id != 'discovery' AND event_type != 'device_discovery'
    AND (device_id, timestamp) IN (
      SELECT device_id, MAX(timestamp)
      FROM events
      WHERE device_id != 'discovery' AND event_type != 'device_discovery'
      GROUP BY device_id
    )
    ORDER BY timestamp DESC
  `).all();

  return rows.map((row: any) => ({
    device: row.device_id,
    lastEvent: row.event_type,
    timestamp: row.timestamp,
    payload: sanitizeSnapshotPayload(JSON.parse(row.state))
  }));
};

export const buildDeviceStatusHistory = async (limit = 20): Promise<DeviceStatusHistoryEntry[]> => {
  const db = getDb();
  // Get recent events per device, excluding duplicates and discovery
  const rows = db.prepare(`
    SELECT device_id, event_type, timestamp, state
    FROM events
    WHERE device_id != 'discovery' AND event_type != 'device_discovery'
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(limit * 2); // Get more to filter duplicates

  const history: DeviceStatusHistoryEntry[] = [];
  const lastSignature = new Map<string, string>();

  // Process in chronological order (reverse the DESC order)
  rows.reverse().forEach((row: any) => {
    const payload = sanitizeSnapshotPayload(JSON.parse(row.state));
    const signature = JSON.stringify({ event: row.event_type, payload });
    if (lastSignature.get(row.device_id) === signature) {
      return;
    }
    lastSignature.set(row.device_id, signature);
    history.push({
      device: row.device_id,
      event: row.event_type,
      timestamp: row.timestamp,
      payload
    });
  });

  return history.slice(-limit);
};

export const formatDecisionContext = (context: StructuredDecisionContext) => {
  return JSON.stringify(context, null, 2);
};

export const buildDecisionContext = async (
  devices: DeviceConfig[]
): Promise<StructuredDecisionContext> => {
  const [statusSnapshot, statusHistory, requests] = await Promise.all([
    buildDeviceStatusSnapshot(),
    buildDeviceStatusHistory(),
    readRecentRequests(50)
  ]);

  return {
    devices,
    statusSnapshot,
    statusHistory,
    requests: sanitizeRequestsForContext(requests)
  };
};
