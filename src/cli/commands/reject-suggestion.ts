import { updateSuggestionStatus } from '../utils/suggestions';
import { appendDecision } from '../utils/preferences';

export const rejectSuggestionHandler = async (id: string) => {
  try {
    const updated = await updateSuggestionStatus(id, 'REJECTED');
    await appendDecision({
      timestamp: new Date().toISOString(),
      actionKey: updated.actionKey,
      suggestion: updated.message,
      accepted: false,
      details: { suggestionId: id }
    });

    console.log(`Suggestion ${id} rejected.`);
  } catch (error) {
    console.error('Failed to reject suggestion:', (error as Error).message);
  }
};
