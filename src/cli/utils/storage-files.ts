import Database from 'better-sqlite3';
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

const getDbPath = () => path.join(process.cwd(), 'data', 'elo.db');

const getDb = () => new Database(getDbPath());

const dbAll = async (db: any, query: string, params: any[] = []): Promise<any[]> => {
  return db.prepare(query).all(...params);
};

const dbGet = async (db: any, query: string, params: any[] = []): Promise<any> => {
  return db.prepare(query).get(...params);
};

const dbRun = async (db: any, query: string, params: any[] = []): Promise<any> => {
  return db.prepare(query).run(...params);
};

const getBasePath = () => process.env.ELO_FILES_PATH || process.cwd();

export const getLogsDir = () => path.join(getBasePath(), 'logs');
export const getRequestsLogPath = () => path.join(getLogsDir(), 'requests.jsonl');
export const getAiUsageLogPath = () => path.join(getLogsDir(), 'ai-usage.jsonl');

// Events with aggregation: group by device/hour, keep latest state
export const appendLogEntry = async (entry: LogEntry) => {
  const db = getDb();
  try {
    const timestamp = entry.timestamp || new Date().toISOString();
    const deviceId = entry.device;

    // Check if we already have an event for this device in this hour
    const existing = await dbGet(db, `
      SELECT id, state FROM events 
      WHERE device_id = ? AND strftime('%H', timestamp) = ?
      ORDER BY timestamp DESC LIMIT 1
    `, [deviceId, new Date(timestamp).getHours().toString().padStart(2, '0')]) as { id: number; state: string } | undefined;

    if (existing) {
      // Update existing aggregated event with latest state
      const currentState = JSON.parse(existing.state);
      const newState = { ...currentState, ...entry.payload };
      await dbRun(db, `
        UPDATE events SET 
          timestamp = ?, 
          event_type = ?, 
          state = ?
        WHERE id = ?
      `, [timestamp, entry.event, JSON.stringify(newState), existing.id]);
    } else {
      // Insert new aggregated event
      await dbRun(db, `
        INSERT INTO events (device_id, timestamp, event_type, state, aggregated)
        VALUES (?, ?, ?, ?, 1)
      `, [deviceId, timestamp, entry.event, JSON.stringify(entry.payload || {})]);
    }
  } finally {
    db.close();
  }
};

export const readRecentLogs = async (limit = 50): Promise<LogEntry[]> => {
  const db = getDb();
  try {
    const rows = await dbAll(db, `
      SELECT timestamp, device_id as device, event_type as event, state as payload
      FROM events
      ORDER BY timestamp DESC
      LIMIT ?
    `, [limit]);

    return rows.map((row: any) => ({
      timestamp: row.timestamp,
      device: row.device,
      event: row.event,
      payload: JSON.parse(row.payload)
    }));
  } finally {
    db.close();
  }
};

// Requests with basic aggregation by user/hour
export const appendRequestLog = async (entry: RequestLogEntry) => {
  const db = getDb();
  try {
    const timestamp = entry.timestamp || new Date().toISOString();
    const user = entry.user || 'default';

    // For requests, we'll aggregate count per user/hour - but since schema doesn't support it,
    // we'll just insert individual requests for now (can optimize later)
    await dbRun(db, `
      INSERT INTO requests (user, request, context, timestamp)
      VALUES (?, ?, ?, ?)
    `, [user, entry.request, entry.context, timestamp]);

    return { logPath: 'sqlite:requests', entry };
  } finally {
    db.close();
  }
};

export const readRecentRequests = async (limit = 50): Promise<RequestLogEntry[]> => {
  const db = getDb();
  try {
    const rows = await dbAll(db, `
      SELECT timestamp, user, request, context 
      FROM requests 
      ORDER BY timestamp DESC 
      LIMIT ?
    `, [limit]);

    return rows.map((row: any) => ({
      timestamp: row.timestamp,
      user: row.user,
      request: row.request,
      context: row.context,
      payload: {}
    }));
  } finally {
    db.close();
  }
};

// AI Usage with aggregation by source/hour
export const appendAiUsageLog = async (entry: AiUsageLogEntry) => {
  const db = getDb();
  try {
    const timestamp = entry.timestamp || new Date().toISOString();
    const hour = new Date(timestamp).getHours();
    const source = entry.source;
    const tags = Array.isArray(entry.tags) ? Array.from(new Set(entry.tags.map((tag) => String(tag).trim()).filter(Boolean))) : [];

    const existing = await dbGet(db, `
      SELECT id, prompt_chars, response_chars, thinking_budget, tags 
      FROM ai_usage 
      WHERE source = ? AND strftime('%H', timestamp) = ?
      ORDER BY timestamp DESC LIMIT 1
    `, [source, hour.toString().padStart(2, '0')]) as { id: number; prompt_chars: number; response_chars: number; thinking_budget: number; tags: string } | undefined;

    if (existing) {
      const existingTags = JSON.parse(existing.tags || '[]');
      const combinedTags = Array.from(new Set([...existingTags, ...tags]));
      await dbRun(db, `
        UPDATE ai_usage SET 
          prompt_chars = ?, 
          response_chars = ?, 
          thinking_budget = ?, 
          tags = ?
        WHERE id = ?
      `, [
        existing.prompt_chars + (entry.promptChars || 0),
        existing.response_chars + (entry.responseChars || 0),
        (existing.thinking_budget || 0) + (entry.thinkingBudget || 0),
        JSON.stringify(combinedTags),
        existing.id
      ]);
    } else {
      await dbRun(db, `
        INSERT INTO ai_usage (timestamp, source, prompt_chars, response_chars, thinking_budget, tags)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        timestamp,
        source,
        entry.promptChars || 0,
        entry.responseChars || 0,
        entry.thinkingBudget || 0,
        JSON.stringify(tags)
      ]);
    }

    return { logPath: 'sqlite:ai_usage', entry };
  } finally {
    db.close();
  }
};

export const readRecentAiUsage = async (limit = 200): Promise<AiUsageLogEntry[]> => {
  const db = getDb();
  try {
    const rows = await dbAll(db, `
      SELECT timestamp, source, prompt_chars, response_chars, thinking_budget, tags 
      FROM ai_usage 
      ORDER BY timestamp DESC 
      LIMIT ?
    `, [limit]);

    return rows.map((row: any) => ({
      timestamp: row.timestamp,
      source: row.source,
      tags: JSON.parse(row.tags || '[]'),
      model: 'aggregated', // Since schema doesn't have model, use aggregated
      promptChars: row.prompt_chars,
      responseChars: row.response_chars,
      latencyMs: 0, // Schema doesn't have latency
      thinkingBudget: row.thinking_budget,
      extra: { aggregated: true }
    }));
  } finally {
    db.close();
  }
};
