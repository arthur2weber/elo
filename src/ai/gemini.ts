import { runGeminiApiPrompt, GeminiRequestMetadata, runGeminiApiChat } from './gemini-api';

type GeminiPromptOptions = {
    thinkingBudget?: number;
    model?: string;
    maxOutputTokens?: number;
    metadata?: GeminiRequestMetadata;
    tools?: any[];
};

export const runGeminiPrompt = (prompt: string, options: GeminiPromptOptions = {}): Promise<string> => {
    return runGeminiApiPrompt(prompt, options);
};

export const runGeminiChat = (contents: any[], options: GeminiPromptOptions = {}): Promise<string> => {
    return runGeminiApiChat(contents, options);
};

export type { GeminiRequestMetadata };
