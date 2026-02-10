import { promises as fs } from 'fs';
import path from 'path';
import { getLogsDir } from './storage-files';

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

const getSuggestionsLogPath = () => path.join(getLogsDir(), 'suggestions.jsonl');

const ensureLogs = async () => {
  await fs.mkdir(getLogsDir(), { recursive: true });
};

export const appendSuggestion = async (entry: SuggestionEntry) => {
  await ensureLogs();
  const payload = {
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString()
  };
  await fs.appendFile(getSuggestionsLogPath(), `${JSON.stringify(payload)}\n`);
  return payload;
};

const mergeSuggestion = (current: SuggestionEntry | undefined, next: SuggestionEntry) => {
  if (!current) {
    return next;
  }
  return {
    ...current,
    ...next,
    code: next.code ?? current.code
  };
};

export const readSuggestions = async (): Promise<SuggestionEntry[]> => {
  const logPath = getSuggestionsLogPath();
  try {
    const file = await fs.readFile(logPath, 'utf-8');
    const lines = file.split('\n').filter(Boolean);
    return lines.map((line) => JSON.parse(line) as SuggestionEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

export const getLatestSuggestions = async () => {
  const entries = await readSuggestions();
  const map = new Map<string, SuggestionEntry>();

  entries.forEach((entry) => {
    map.set(entry.id, mergeSuggestion(map.get(entry.id), entry));
  });

  return Array.from(map.values());
};

export const getPendingSuggestions = async () => {
  const latest = await getLatestSuggestions();
  return latest.filter((entry) => entry.status === 'PENDING');
};

export const updateSuggestionStatus = async (id: string, status: SuggestionStatus) => {
  const latest = await getLatestSuggestions();
  const match = latest.find((entry) => entry.id === id);
  if (!match) {
    throw new Error(`Suggestion ${id} not found.`);
  }

  const payload: SuggestionEntry = {
    ...match,
    status,
    timestamp: new Date().toISOString(),
    code: match.code
  };

  await appendSuggestion(payload);
  return payload;
};
