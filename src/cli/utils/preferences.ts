import { promises as fs } from 'fs';
import path from 'path';
import { getLogsDir } from './n8n-files';

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

const getDecisionLogPath = () => path.join(getLogsDir(), 'decisions.jsonl');

export const appendDecision = async (entry: DecisionEntry) => {
  const logsDir = getLogsDir();
  await fs.mkdir(logsDir, { recursive: true });
  const payload = {
    timestamp: entry.timestamp || new Date().toISOString(),
    user: entry.user ?? 'default',
    context: entry.context ?? '',
    actionKey: entry.actionKey,
    suggestion: entry.suggestion,
    accepted: entry.accepted,
    details: entry.details ?? {}
  };
  await fs.appendFile(getDecisionLogPath(), `${JSON.stringify(payload)}\n`);
  return payload;
};

export const readDecisions = async (limit = 200): Promise<DecisionEntry[]> => {
  const logPath = getDecisionLogPath();
  try {
    const file = await fs.readFile(logPath, 'utf-8');
    const lines = file.split('\n').filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line) as DecisionEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
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
