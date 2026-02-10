import { runGeminiPrompt } from './gemini';
import { prompts } from './prompts';

export type WorkflowSpec = {
    name: string;
    description?: string;
};

export type WorkflowUpdateSpec = {
    name: string;
    description?: string;
    preferences?: string;
    logs: Array<Record<string, unknown>>;
    currentWorkflow: Record<string, unknown>;
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

    async generateWorkflowJson(spec: WorkflowSpec): Promise<Record<string, unknown>> {
        const prompt = prompts.workflowJson(spec.name, spec.description);
        const thinkingBudget = computeThinkingBudgetFromJson({ name: spec.name, description: spec.description ?? '' });
        const response = await runGeminiPrompt(prompt, { thinkingBudget });
        const json = this.extractJson(response);

        const workflow = this.unwrapWorkflow(json, spec.name);
        return workflow;
    }

    async updateWorkflowJson(spec: WorkflowUpdateSpec): Promise<Record<string, unknown>> {
        const prompt = prompts.workflowUpdateJson({
            name: spec.name,
            description: spec.description,
            preferences: spec.preferences,
            logs: spec.logs,
            currentWorkflow: spec.currentWorkflow
        });
        const thinkingBudget = computeThinkingBudgetFromJson({
            name: spec.name,
            description: spec.description ?? '',
            preferences: spec.preferences ?? '',
            logs: spec.logs,
            currentWorkflow: spec.currentWorkflow
        });
        const response = await runGeminiPrompt(prompt, { thinkingBudget });
        const json = this.extractJson(response);

        const workflow = this.unwrapWorkflow(json, spec.name);
        return workflow;
    }

    private unwrapWorkflow(json: Record<string, unknown>, fallbackName: string) {
        if ('workflow' in json && typeof json.workflow === 'object' && json.workflow) {
            const workflow = json.workflow as Record<string, unknown>;
            if (!workflow.name) {
                workflow.name = fallbackName;
            }
            return workflow;
        }

        if (!json.name) {
            json.name = fallbackName;
        }
        return json;
    }

    private extractJson(response: string): Record<string, unknown> {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Gemini response did not contain JSON.');
        }
        try {
            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            throw new Error(`Failed to parse Gemini JSON response: ${(error as Error).message}`);
        }
    }
}

export default AIAgent;