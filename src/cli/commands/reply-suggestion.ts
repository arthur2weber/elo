import { getLatestSuggestions, updateSuggestionStatus } from '../utils/suggestions';
import { updateAutomationFile } from '../utils/automation-files';
import { appendDecision } from '../utils/preferences';
import { interpretUserReply } from '../utils/reply-interpreter';

export const replySuggestionHandler = async (id: string, reply: string) => {
  try {
    const latest = await getLatestSuggestions();
    const suggestion = latest.find((entry) => entry.id === id);
    if (!suggestion) {
      throw new Error(`Suggestion ${id} not found.`);
    }

    const interpretation = await interpretUserReply({
      question: suggestion.message,
      reply,
      context: suggestion.context
    });

    if (interpretation.intent === 'confirm') {
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
        details: {
          suggestionId: id,
          instruction: interpretation.instruction,
          matchedTerm: interpretation.matchedTerm,
          source: interpretation.source
        }
      });
      console.log(`Suggestion ${id} approved and applied.`);
      return;
    }

    if (interpretation.intent === 'deny') {
      await updateSuggestionStatus(id, 'REJECTED');
      await appendDecision({
        timestamp: new Date().toISOString(),
        actionKey: suggestion.actionKey,
        suggestion: suggestion.message,
        accepted: false,
        details: {
          suggestionId: id,
          instruction: interpretation.instruction,
          matchedTerm: interpretation.matchedTerm,
          source: interpretation.source
        }
      });
      console.log(`Suggestion ${id} rejected.`);
      return;
    }

    if (interpretation.intent === 'ask_again') {
      console.log(`Suggestion ${id} kept pending. User asked to be reminded.`);
      return;
    }

    console.log(`Suggestion ${id} ambiguous. Please clarify.`);
  } catch (error) {
    console.error('Failed to interpret suggestion reply:', (error as Error).message);
  }
};
