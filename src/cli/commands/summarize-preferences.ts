import { getPreferenceSummary } from '../utils/preferences';

type SummarizeOptions = {
  limit?: string;
};

const parseLimit = (value?: string) => {
  if (!value) {
    return 200;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 200 : parsed;
};

export const summarizePreferencesHandler = async (options: SummarizeOptions) => {
  try {
    const summary = await getPreferenceSummary(parseLimit(options.limit));
    console.log(summary);
  } catch (error) {
    console.error('Failed to summarize preferences:', (error as Error).message);
  }
};
