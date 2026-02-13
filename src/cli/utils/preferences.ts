import Database from 'better-sqlite3';
import path from 'path';

export type DecisionEntry = {
  timestamp: string;
  user?: string;
  context?: string;
  actionKey: string;
  suggestion: string;
  accepted: boolean;
  status?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'; 
  details?: Record<string, unknown>;
};

type PreferenceStats = {
  accepted: number;
  total: number;
};

const getDbPath = () => path.join(process.cwd(), 'data', 'elo.db');

const getDb = () => new Database(getDbPath());

export const appendDecision = async (entry: DecisionEntry) => {
  const db = getDb();
  try {
    const insert = db.prepare(`
      INSERT INTO decisions (timestamp, user, context, action_key, suggestion, accepted, status, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = insert.run(
      entry.timestamp || new Date().toISOString(),
      entry.user ?? 'default',
      entry.context ?? '',
      entry.actionKey,
      entry.suggestion,
      entry.accepted ? 1 : 0,
      entry.status || 'APPROVED',
      JSON.stringify(entry.details || {})
    );
    
    return {
      id: result.lastInsertRowid,
      ...entry
    };
  } finally {
    db.close();
  }
};

export const readDecisions = async (limit = 200): Promise<DecisionEntry[]> => {
  const db = getDb();
  try {
    const select = db.prepare(`
      SELECT timestamp, user, context, action_key as actionKey, suggestion, accepted, status, details
      FROM decisions
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    
    const rows = select.all(limit) as any[];
    return rows.map((row: any) => ({
      timestamp: row.timestamp,
      user: row.user,
      context: row.context,
      actionKey: row.actionKey,
      suggestion: row.suggestion,
      accepted: Boolean(row.accepted),
      status: row.status,
      details: JSON.parse(row.details || '{}')
    }));
  } finally {
    db.close();
  }
};

export const buildPreferenceStats = (decisions: DecisionEntry[]) => {
  const stats = new Map<string, PreferenceStats>();

  decisions.forEach((decision) => {
    const current = stats.get(decision.actionKey) ?? { accepted: 0, total: 0 };
    current.total += 1;
    if (decision.accepted) {
      current.accepted += 1;
    }
    stats.set(decision.actionKey, current);
  });

  return stats;
};

export const shouldAutoApprove = (actionKey: string, stats: Map<string, PreferenceStats>) => {
  const current = stats.get(actionKey);
  if (!current || current.total === 0) {
    return false;
  }
  const rate = current.accepted / current.total;
  return current.accepted >= 3 && rate >= 0.7;
};

export const buildPreferenceSummary = (decisions: DecisionEntry[]) => {
  const stats = buildPreferenceStats(decisions);

  if (stats.size === 0) {
    return 'No preference patterns detected yet.';
  }

  const lines: string[] = [];
  stats.forEach((value, actionKey) => {
    const rate = value.total === 0 ? 0 : value.accepted / value.total;
    const auto = shouldAutoApprove(actionKey, stats) ? 'auto-approve' : 'ask';
    lines.push(`${actionKey}: accepted ${value.accepted}/${value.total} (${Math.round(rate * 100)}%) => ${auto}`);
  });

  return lines.join('\n');
};

export const getPreferenceSummary = async (limit = 200) => {
  const decisions = await readDecisions(limit);
  return buildPreferenceSummary(decisions);
};
