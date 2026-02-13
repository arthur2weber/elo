import Database from 'better-sqlite3';
import path from 'path';

export type SuggestionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_APPLIED';

export type SuggestionEntry = {
  id: string;
  timestamp: string;
  actionKey: string;
  automationName: string;
  message: string;
  code?: string;
  status: SuggestionStatus;
  requiredApprovals?: number;
  askAgain?: boolean;
  rationale?: string;
  context?: string;
};

const getDbPath = () => path.join(process.cwd(), 'data', 'elo.db');

const getDb = () => new Database(getDbPath());

export const appendSuggestion = async (entry: SuggestionEntry) => {
  const db = getDb();
  try {
    const timestamp = entry.timestamp || new Date().toISOString();
    const insert = db.prepare(`
      INSERT OR REPLACE INTO suggestions (id, automation_name, message, code, status, required_approvals, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      entry.id,
      entry.automationName,
      entry.message,
      entry.code,
      entry.status,
      entry.requiredApprovals || 3,
      timestamp,
      new Date().toISOString()
    );
    return { ...entry, timestamp };
  } finally {
    db.close();
  }
};

export const readSuggestions = async (): Promise<SuggestionEntry[]> => {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT id, automation_name as automationName, message, code, status, required_approvals as requiredApprovals, created_at as timestamp, updated_at
      FROM suggestions
      ORDER BY created_at DESC
    `).all();

    return rows.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      actionKey: '', // Not stored in DB
      automationName: row.automationName,
      message: row.message,
      code: row.code,
      status: row.status as SuggestionStatus,
      requiredApprovals: row.requiredApprovals,
      askAgain: undefined, // Not stored in DB
      rationale: undefined, // Not stored in DB
      context: undefined // Not stored in DB
    }));
  } finally {
    db.close();
  }
};

export const getLatestSuggestions = async () => {
  // Since we're using INSERT OR REPLACE, each id is unique and latest
  return await readSuggestions();
};

export const getPendingSuggestions = async () => {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT id, automation_name as automationName, message, code, status, required_approvals as requiredApprovals, created_at as timestamp, updated_at
      FROM suggestions
      WHERE status = 'PENDING'
      ORDER BY created_at DESC
    `).all();

    return rows.map((row: any) => ({
      id: row.id,
      timestamp: row.timestamp,
      actionKey: '',
      automationName: row.automationName,
      message: row.message,
      code: row.code,
      status: row.status as SuggestionStatus,
      requiredApprovals: row.requiredApprovals,
      askAgain: undefined,
      rationale: undefined,
      context: undefined
    }));
  } finally {
    db.close();
  }
};

export const updateSuggestionStatus = async (id: string, status: SuggestionStatus) => {
  const db = getDb();
  try {
    const update = db.prepare(`
      UPDATE suggestions SET status = ?, updated_at = ? WHERE id = ?
    `);
    const result = update.run(status, new Date().toISOString(), id);

    if (result.changes === 0) {
      throw new Error(`Suggestion ${id} not found.`);
    }

    // Return the updated suggestion
    const row = db.prepare(`
      SELECT id, automation_name as automationName, message, code, status, required_approvals as requiredApprovals, created_at as timestamp, updated_at
      FROM suggestions WHERE id = ?
    `).get(id) as any;

    return {
      id: row.id,
      timestamp: row.timestamp,
      actionKey: '',
      automationName: row.automationName,
      message: row.message,
      code: row.code,
      status: row.status as SuggestionStatus,
      requiredApprovals: row.requiredApprovals,
      askAgain: undefined,
      rationale: undefined,
      context: undefined
    };
  } finally {
    db.close();
  }
};
