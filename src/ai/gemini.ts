import { runGeminiApiPrompt, GeminiRequestMetadata } from './gemini-api';

type GeminiPromptOptions = {
    thinkingBudget?: number;
    model?: string;
    maxOutputTokens?: number;
    metadata?: GeminiRequestMetadata;
};

export const runGeminiPrompt = (prompt: string, options: GeminiPromptOptions = {}): Promise<string> => {
    return runGeminiApiPrompt(prompt, options);
};

export type { GeminiRequestMetadata };
