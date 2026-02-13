import { appendLogEntry, LogEntry } from '../utils/storage-files';

type AddLogOptions = {
  device?: string;
  event?: string;
  payload?: string;
  timestamp?: string;
};

const parsePayload = (payload?: string): Record<string, unknown> => {
  if (!payload) {
    return {};
  }
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Payload must be valid JSON: ${(error as Error).message}`);
  }
};

export const addLogHandler = async (options: AddLogOptions) => {
  try {
    if (!options.device || !options.event) {
      throw new Error('Device and event are required.');
    }

    const entry: LogEntry = {
      timestamp: options.timestamp || new Date().toISOString(),
      device: options.device,
      event: options.event,
      payload: parsePayload(options.payload)
    };

    await appendLogEntry(entry);
    console.log(`Log appended to database`);
  } catch (error) {
    console.error('Failed to append log:', (error as Error).message);
  }
};
