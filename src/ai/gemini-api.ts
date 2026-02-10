import axios from 'axios';

const DEFAULT_MODEL = 'gemini-1.5-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const getApiKey = () => process.env.GEMINI_API_KEY;
const getModel = () => process.env.GEMINI_API_MODEL || DEFAULT_MODEL;
const getBaseUrl = () => process.env.GEMINI_API_BASE_URL || DEFAULT_BASE_URL;

const buildUrl = () => {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is required to call the Gemini API.');
    }
    const model = getModel();
    const baseUrl = getBaseUrl();
    return `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
};

export const runGeminiApiPrompt = async (prompt: string): Promise<string> => {
    const url = buildUrl();
    const response = await axios.post(
        url,
        {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: prompt }]
                }
            ]
        },
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
