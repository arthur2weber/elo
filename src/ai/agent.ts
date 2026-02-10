import { runGeminiPrompt } from './gemini';
import { prompts } from './prompts';

export type AutomationSpec = {
    name: string;
    description?: string;
};

export type AutomationUpdateSpec = {
    name: string;
    description?: string;
    preferences?: string;
    logs: Array<Record<string, unknown>>;
    currentCode: string;
};

const MIN_THINKING_BUDGET = 4000;
const MAX_THINKING_BUDGET = 16000;
const THINKING_STEP = 1000;

const parseThinkingBudgetOverride = () => {
    const raw = process.env.THINKING_BUDGET;
    if (!raw) {
        return undefined;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
        return undefined;
    }
    return parsed;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const computeThinkingBudgetFromJson = (payload: Record<string, unknown>) => {
    const override = parseThinkingBudgetOverride();
    if (typeof override === 'number') {
        return clamp(override, MIN_THINKING_BUDGET, MAX_THINKING_BUDGET);
    }
    const size = JSON.stringify(payload).length;
    const rounded = Math.ceil(size / THINKING_STEP) * THINKING_STEP;
    return clamp(rounded, MIN_THINKING_BUDGET, MAX_THINKING_BUDGET);
};

class AIAgent {
    async processInput(input: string): Promise<string> {
        const prompt = `${prompts.welcome}\n\n${input}`;
        return runGeminiPrompt(prompt, { thinkingBudget: 0 });
    }

    async generateAutomationCode(spec: AutomationSpec): Promise<string> {
        const prompt = prompts.workflowJson(spec.name, spec.description);
        const thinkingBudget = computeThinkingBudgetFromJson({ name: spec.name, description: spec.description ?? '' });
        const response = await runGeminiPrompt(prompt, { thinkingBudget });
        return this.extractCode(response);
    }

    async updateAutomationCode(spec: AutomationUpdateSpec): Promise<string> {
        const prompt = prompts.workflowUpdateJson({
            name: spec.name,
            description: spec.description,
            preferences: spec.preferences,
            logs: spec.logs,
            currentWorkflow: spec.currentCode
        });
        const thinkingBudget = computeThinkingBudgetFromJson({
            name: spec.name,
            description: spec.description ?? '',
            preferences: spec.preferences ?? '',
            logs: spec.logs,
            currentCode: spec.currentCode
        });
        const response = await runGeminiPrompt(prompt, { thinkingBudget });
        return this.extractCode(response);
    }

    private extractCode(response: string): string {
        const trimmed = response.trim();
        const fenced = trimmed.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
        if (fenced && fenced[1]) {
            return fenced[1].trim();
        }
        return trimmed;
    }
}

export default AIAgent;