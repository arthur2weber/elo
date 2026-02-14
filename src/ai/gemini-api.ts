import axios from 'axios';
import { appendAiUsageLog } from '../cli/utils/storage-files';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const getApiKey = () => process.env.GEMINI_API_KEY;
const getModel = (override?: string) => override || process.env.GEMINI_API_MODEL || DEFAULT_MODEL;
const getBaseUrl = () => process.env.GEMINI_API_BASE_URL || DEFAULT_BASE_URL;

export type GeminiRequestMetadata = {
    source: string;
    tags?: string[];
    extra?: Record<string, unknown>;
};

type GeminiApiOptions = {
    thinkingBudget?: number;
    model?: string;
    maxOutputTokens?: number;
    responseMimeType?: 'text/plain' | 'application/json';
    responseSchema?: Record<string, unknown>;
    metadata?: GeminiRequestMetadata;
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
    const model = getModel(options.model);
    const url = buildUrl(model);
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
        maxOutputTokens: options.maxOutputTokens || 2048
    };

    if (options.responseMimeType) {
        generationConfig.responseMimeType = options.responseMimeType;
    }

    if (options.responseSchema) {
        generationConfig.responseSchema = options.responseSchema;
    }

    if (typeof thinkingBudget === 'number' && !Number.isNaN(thinkingBudget)) {
        generationConfig.thinkingConfig = {
            thinkingBudget
        };
    }

    payload.generationConfig = generationConfig;

    if (process.env.ELO_DEBUG_PROMPT === 'true') {
        console.log('[ELO] Gemini payload:', JSON.stringify(payload, null, 2));
    }

    const startedAt = Date.now();
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
    const trimmed = text.trim();

    if (options.metadata?.source) {
        const latencyMs = Date.now() - startedAt;
        appendAiUsageLog({
            timestamp: new Date().toISOString(),
            source: options.metadata.source,
            tags: options.metadata.tags ?? [],
            model,
            promptChars: prompt.length,
            responseChars: trimmed.length,
            latencyMs,
            thinkingBudget: typeof thinkingBudget === 'number' ? thinkingBudget : null,
            extra: options.metadata.extra
        }).catch((error) => {
            if (process.env.ELO_DEBUG_PROMPT === 'true') {
                console.warn('[ELO] Failed to log AI usage:', error);
            }
        });
    }

    return trimmed;
};

export const runGeminiApiPromptJson = async <T = any>(
    prompt: string,
    schema: Record<string, unknown>,
    options: Omit<GeminiApiOptions, 'responseMimeType' | 'responseSchema'> = {}
): Promise<T> => {
    const response = await runGeminiApiPrompt(prompt, {
        ...options,
        responseMimeType: 'application/json',
        responseSchema: schema
    });

    try {
        return JSON.parse(response) as T;
    } catch (error) {
        console.error('[ELO] Failed to parse Gemini JSON response:', error);
        console.error('[ELO] Raw response:', response);
        throw new Error('Gemini API returned invalid JSON response');
    }
};
