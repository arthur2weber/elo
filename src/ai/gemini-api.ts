import axios from 'axios';

const DEFAULT_MODEL = 'gemini-1.5-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const getApiKey = () => process.env.GEMINI_API_KEY;
const getModel = (override?: string) => override || process.env.GEMINI_API_MODEL || DEFAULT_MODEL;
const getBaseUrl = () => process.env.GEMINI_API_BASE_URL || DEFAULT_BASE_URL;

type GeminiApiOptions = {
    thinkingBudget?: number;
    model?: string;
    maxOutputTokens?: number;
};

const buildUrl = (modelOverride?: string) => {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is required to call the Gemini API.');
    }
    const model = getModel(modelOverride);
    const baseUrl = getBaseUrl();
    return `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
};

export const runGeminiApiPrompt = async (prompt: string, options: GeminiApiOptions = {}): Promise<string> => {
    const url = buildUrl(options.model);
    const thinkingBudget = options.thinkingBudget;
    const payload: Record<string, unknown> = {
        contents: [
            {
                role: 'user',
                parts: [{ text: prompt }]
            }
        ]
    };

    const generationConfig: Record<string, unknown> = {
        temperature: 0.3,
        topP: 0.8,
        topK: 16,
        maxOutputTokens: options.maxOutputTokens || 200
    };

    if (typeof thinkingBudget === 'number' && !Number.isNaN(thinkingBudget)) {
        generationConfig.thinkingConfig = {
            thinkingBudget
        };
    }

    payload.generationConfig = generationConfig;

    if (process.env.ELO_DEBUG_PROMPT === 'true') {
        console.log('[ELO] Gemini payload:', JSON.stringify(payload, null, 2));
    }

    const response = await axios.post(
        url,
        payload,
        { timeout: 60000 }
    );

    const candidates = response.data?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
        throw new Error('Gemini API returned no candidates.');
    }

    const parts = candidates[0]?.content?.parts;
    const text = Array.isArray(parts)
        ? parts.map((part: { text?: string }) => part.text).filter(Boolean).join('\n')
        : '';

    if (!text) {
        throw new Error('Gemini API returned an empty response.');
    }

    return text.trim();
};
