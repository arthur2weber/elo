import { runGeminiPrompt } from './gemini';
import { prompts } from './prompts';
import crypto from 'crypto';

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
    // Simple in-memory cache to avoid re-calling the LLM for the same patterns
    private patternCache: Map<string, { patterns: string; generatedCode?: string }> = new Map();

    private computeLogsHash(logs: Array<Record<string, unknown>>): string {
        const raw = JSON.stringify(logs);
        return crypto.createHash('sha1').update(raw).digest('hex');
    }

    private getStateSignature(log: Record<string, unknown>): string {
        if (log == null) return '';
        if (Object.prototype.hasOwnProperty.call(log, 'state')) return JSON.stringify((log as any).state);
        if (Object.prototype.hasOwnProperty.call(log, 'status')) return JSON.stringify((log as any).status);
        if (Object.prototype.hasOwnProperty.call(log, 'value')) return JSON.stringify((log as any).value);
        // Fallback: use the whole object except timestamp
        const copy: Record<string, unknown> = { ...log };
        delete copy['timestamp'];
        return JSON.stringify(copy);
    }

    private filterChangeLogs(logs: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
        if (!Array.isArray(logs) || logs.length <= 1) return logs;
        const filtered: Array<Record<string, unknown>> = [];
        // Always include first event as reference
        filtered.push(logs[0]);
        for (let i = 1; i < logs.length; i++) {
            const prev = logs[i - 1];
            const curr = logs[i];
            const prevSig = this.getStateSignature(prev);
            const currSig = this.getStateSignature(curr);
            if (prevSig !== currSig) {
                filtered.push(curr);
            }
        }
        return filtered;
    }

    private summarizePatterns(logs: Array<Record<string, unknown>>): string {
        const patternMap: Record<string, number> = {};
        for (const log of logs) {
            const ts = (log.timestamp as string) ?? (log.time as string) ?? (log.ts as string);
            let hour = 'unknown';
            if (ts) {
                const d = new Date(ts);
                if (!Number.isNaN(d.getTime())) {
                    hour = String(d.getHours());
                }
            }
            const device = (log.deviceId ?? log.device ?? log.id) as string ?? 'unknown_device';
            const action = (log.action ?? log.type ?? log.event) as string ?? this.getStateSignature(log);
            const key = `hour:${hour} - ${device}: ${action}`;
            patternMap[key] = (patternMap[key] || 0) + 1;
        }

        const entries = Object.entries(patternMap)
            .filter(([_, count]) => count >= 3) // threshold for potential proactive suggestion
            .sort((a, b) => b[1] - a[1]);

        if (entries.length === 0) return '';

        return entries.map(([key, count]) => `${key} ocorreu ${count} vezes.`).join('\n');
    }
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
        // Pre-process logs: filter out redundant (no-state-change) entries and summarize patterns
        const filteredLogs = this.filterChangeLogs(spec.logs || []);
        const patternsSummary = this.summarizePatterns(filteredLogs);

        // Cache key for patterns - avoid repeated LLM calls for identical recent patterns
        const logsHash = this.computeLogsHash(filteredLogs);
        const cacheEntry = this.patternCache.get(spec.name || logsHash);
        if (cacheEntry && cacheEntry.patterns === patternsSummary && cacheEntry.generatedCode) {
            // Return cached generated code if available for same patterns
            return cacheEntry.generatedCode;
        }

        const prompt = prompts.workflowUpdateJson({
            name: spec.name,
            description: spec.description,
            preferences: spec.preferences,
            logs: filteredLogs,
            currentWorkflow: spec.currentCode,
            patterns: patternsSummary
        });

        const thinkingBudget = computeThinkingBudgetFromJson({
            name: spec.name,
            description: spec.description ?? '',
            preferences: spec.preferences ?? '',
            logs: filteredLogs,
            currentCode: spec.currentCode,
            patterns: patternsSummary
        });

        const response = await runGeminiPrompt(prompt, {
            thinkingBudget,
            metadata: {
                source: 'automation:update',
                tags: ['automation', 'workflow'],
                extra: {
                    nameLength: spec.name.length,
                    descriptionLength: spec.description ? spec.description.length : 0,
                    logsCount: filteredLogs.length,
                    currentCodeChars: spec.currentCode.length,
                    patternsSummaryChars: patternsSummary.length
                }
            }
        });

        const code = this.extractCode(response);
        // store in cache
        this.patternCache.set(spec.name || logsHash, { patterns: patternsSummary, generatedCode: code });
        return code;
    }

    async decideApprovalPolicy(input: {
        actionKey: string;
        suggestion: string;
        history: string;
        context: string;
        patterns?: string;
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
                context: input.context,
                patterns: input.patterns
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