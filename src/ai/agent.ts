import { runGeminiPrompt } from './gemini-cli';
import { prompts } from './prompts';

export type WorkflowSpec = {
    name: string;
    description?: string;
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

        if (!json.name) {
            json.name = spec.name;
        }

        return json as Record<string, unknown>;
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