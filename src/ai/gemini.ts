import { runGeminiPrompt as runGeminiCliPrompt } from './gemini-cli';
import { runGeminiApiPrompt } from './gemini-api';

type GeminiPromptOptions = {
    thinkingBudget?: number;
    model?: string;
};

const hasApiKey = () => Boolean(process.env.GEMINI_API_KEY);

export const runGeminiPrompt = (prompt: string, options: GeminiPromptOptions = {}): Promise<string> => {
    if (hasApiKey()) {
        return runGeminiApiPrompt(prompt, options);
    }
    return runGeminiCliPrompt(prompt);
};
