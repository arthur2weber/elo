import { runGeminiPrompt as runGeminiCliPrompt } from './gemini-cli';
import { runGeminiApiPrompt } from './gemini-api';

const hasApiKey = () => Boolean(process.env.GEMINI_API_KEY);

export const runGeminiPrompt = (prompt: string): Promise<string> => {
    if (hasApiKey()) {
        return runGeminiApiPrompt(prompt);
    }
    return runGeminiCliPrompt(prompt);
};
