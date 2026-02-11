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

export type ApprovalPolicy = {
    autoApprove: boolean;
    requiredApprovals: number;
    askAgain: boolean;
    rationale?: string;
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
        return runGeminiPrompt(prompt, {
            thinkingBudget: 0,
            metadata: {
                source: 'chat:welcome',
                tags: ['chat', 'assistant'],
                extra: {
                    userInputChars: input.length
                }
            }
        });
    }

    async processInputWithContext(input: { message: string; context: string; history?: string }): Promise<string> {
        const prompt = prompts.chatButler({
            message: input.message,
            context: input.context,
            history: input.history
        });
        if (process.env.ELO_DEBUG_PROMPT === 'true') {
            console.log('[ELO] Chat prompt:', prompt);
        }
        return runGeminiPrompt(prompt, {
            thinkingBudget: 0,
            metadata: {
                source: 'chat:contextual',
                tags: ['chat', 'assistant'],
                extra: {
                    messageChars: input.message.length,
                    contextChars: input.context.length,
                    historyChars: input.history ? input.history.length : 0
                }
            }
        });
    }

    async generateAutomationCode(spec: AutomationSpec): Promise<string> {
        const prompt = prompts.workflowJson(spec.name, spec.description);
        const thinkingBudget = computeThinkingBudgetFromJson({ name: spec.name, description: spec.description ?? '' });
        const response = await runGeminiPrompt(prompt, {
            thinkingBudget,
            metadata: {
                source: 'automation:generate',
                tags: ['automation', 'workflow'],
                extra: {
                    nameLength: spec.name.length,
                    descriptionLength: spec.description ? spec.description.length : 0
                }
            }
        });
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
        const response = await runGeminiPrompt(prompt, {
            thinkingBudget,
            metadata: {
                source: 'automation:update',
                tags: ['automation', 'workflow'],
                extra: {
                    nameLength: spec.name.length,
                    descriptionLength: spec.description ? spec.description.length : 0,
                    logsCount: spec.logs.length,
                    currentCodeChars: spec.currentCode.length
                }
            }
        });
        return this.extractCode(response);
    }

    async decideApprovalPolicy(input: {
        actionKey: string;
        suggestion: string;
        history: string;
        context: string;
        fallback?: ApprovalPolicy;
    }): Promise<ApprovalPolicy> {
        const fallback: ApprovalPolicy = input.fallback ?? {
            autoApprove: false,
            requiredApprovals: 3,
            askAgain: true,
            rationale: 'Fallback policy used.'
        };

        const allowAi = process.env.ELO_AI_APPROVAL === 'true' || Boolean(process.env.GEMINI_API_KEY);
        if (!allowAi) {
            return fallback;
        }

        try {
            const prompt = prompts.approvalPolicy({
                actionKey: input.actionKey,
                suggestion: input.suggestion,
                history: input.history,
                context: input.context
            });
            const response = await runGeminiPrompt(prompt, {
                thinkingBudget: 0,
                metadata: {
                    source: 'automation:approval',
                    tags: ['automation', 'approval'],
                    extra: {
                        actionKeyChars: input.actionKey.length,
                        suggestionChars: input.suggestion.length,
                        historyChars: input.history ? input.history.length : 0,
                        contextChars: input.context.length
                    }
                }
            });
            const json = this.extractJson(response);
            return {
                autoApprove: Boolean(json.autoApprove),
                requiredApprovals: Number.isFinite(json.requiredApprovals) ? Number(json.requiredApprovals) : fallback.requiredApprovals,
                askAgain: typeof json.askAgain === 'boolean' ? json.askAgain : fallback.askAgain,
                rationale: typeof json.rationale === 'string' ? json.rationale : fallback.rationale
            };
        } catch {
            return fallback;
        }
    }

    private extractCode(response: string): string {
        const trimmed = response.trim();
        const fenced = trimmed.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
        if (fenced && fenced[1]) {
            return fenced[1].trim();
        }
        return trimmed;
    }

    private extractJson(response: string): Record<string, unknown> {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Gemini response did not contain JSON.');
        }
        return JSON.parse(jsonMatch[0]);
    }
}

export default AIAgent;