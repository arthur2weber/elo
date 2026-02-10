import { updateSuggestionStatus, getLatestSuggestions } from '../utils/suggestions';
import { updateAutomationFile } from '../utils/automation-files';
import { appendDecision } from '../utils/preferences';

export const approveSuggestionHandler = async (id: string) => {
  try {
    const latest = await getLatestSuggestions();
    const suggestion = latest.find((entry) => entry.id === id);
    if (!suggestion) {
      throw new Error(`Suggestion ${id} not found.`);
    }
    if (!suggestion.code) {
      throw new Error(`Suggestion ${id} has no code to apply.`);
    }

    await updateAutomationFile(suggestion.automationName, suggestion.code);
    await updateSuggestionStatus(id, 'APPROVED');
    await appendDecision({
      timestamp: new Date().toISOString(),
      actionKey: suggestion.actionKey,
      suggestion: suggestion.message,
      accepted: true,
      details: { suggestionId: id }
    });

    console.log(`Suggestion ${id} approved and applied.`);
  } catch (error) {
    console.error('Failed to approve suggestion:', (error as Error).message);
  }
};
