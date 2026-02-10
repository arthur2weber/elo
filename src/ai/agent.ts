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

class AIAgent {
    async processInput(input: string): Promise<string> {
        const prompt = `${prompts.welcome}\n\n${input}`;
        return runGeminiPrompt(prompt);
    }

    async generateWorkflowJson(spec: WorkflowSpec): Promise<Record<string, unknown>> {
        const prompt = prompts.workflowJson(spec.name, spec.description);
        const response = await runGeminiPrompt(prompt);
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
        const response = await runGeminiPrompt(prompt);
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