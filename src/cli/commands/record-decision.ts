import { appendDecision, DecisionEntry } from '../utils/preferences';

type RecordDecisionOptions = {
  actionKey?: string;
  suggestion?: string;
  accepted?: boolean;
  rejected?: boolean;
  context?: string;
  details?: string;
  user?: string;
};

const parseDetails = (details?: string): Record<string, unknown> => {
  if (!details) {
    return {};
  }
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Details must be valid JSON: ${(error as Error).message}`);
  }
};

export const recordDecisionHandler = async (options: RecordDecisionOptions) => {
  try {
    if (!options.actionKey || !options.suggestion) {
      throw new Error('actionKey and suggestion are required.');
    }

    const accepted = options.accepted ?? (!options.rejected);

    const entry: DecisionEntry = {
      timestamp: new Date().toISOString(),
      user: options.user,
      context: options.context,
      actionKey: options.actionKey,
      suggestion: options.suggestion,
      accepted,
      details: parseDetails(options.details)
    };

    await appendDecision(entry);
    console.log(`Decision recorded for ${entry.actionKey} (accepted: ${entry.accepted})`);
  } catch (error) {
    console.error('Failed to record decision:', (error as Error).message);
  }
};
