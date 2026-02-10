import { getPendingSuggestions } from '../utils/suggestions';

export const listSuggestionsHandler = async () => {
  try {
    const pending = await getPendingSuggestions();
    if (pending.length === 0) {
      console.log('No pending suggestions.');
      return;
    }

    console.log('Pending suggestions:');
    pending.forEach((entry) => {
      console.log(`- ${entry.id} | ${entry.automationName} | ${entry.message}`);
    });
  } catch (error) {
    console.error('Failed to list suggestions:', (error as Error).message);
  }
};
