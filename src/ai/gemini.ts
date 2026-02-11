import { runGeminiApiPrompt } from './gemini-api';

type GeminiPromptOptions = {
    thinkingBudget?: number;
    model?: string;
    maxOutputTokens?: number;
};

export const runGeminiPrompt = (prompt: string, options: GeminiPromptOptions = {}): Promise<string> => {
    return runGeminiApiPrompt(prompt, options);
};
