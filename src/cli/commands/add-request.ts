import { appendRequestLog, RequestLogEntry } from '../utils/storage-files';

type AddRequestOptions = {
  request?: string;
  user?: string;
  context?: string;
  payload?: string;
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

export const addRequestHandler = async (options: AddRequestOptions) => {
  try {
    if (!options.request) {
      throw new Error('request is required.');
    }

    const entry: RequestLogEntry = {
      timestamp: new Date().toISOString(),
      user: options.user,
      request: options.request,
      context: options.context,
      payload: parsePayload(options.payload)
    };

    const result = await appendRequestLog(entry);
    console.log(`Request logged to ${result.logPath}`);
  } catch (error) {
    console.error('Failed to log request:', (error as Error).message);
  }
};
