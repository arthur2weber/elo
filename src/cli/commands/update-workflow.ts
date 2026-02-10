import AIAgent from '../../ai/agent';
import { createWorkflow, getWorkflows } from '../utils/n8n-api';
import { readRecentLogs, readWorkflowFile, updateWorkflowFile } from '../utils/n8n-files';
import { getPreferenceSummary } from '../utils/preferences';

type UpdateWorkflowOptions = {
  mode?: 'files' | 'api';
  description?: string;
  preferences?: string;
  logLimit?: string;
  ai?: boolean;
};

const resolveMode = (mode?: string) => {
  const envMode = process.env.N8N_MODE;
  const selected = mode || envMode || 'files';
  return selected === 'api' ? 'api' : 'files';
};

const parseLogLimit = (value?: string) => {
  if (!value) {
    return 50;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 50 : parsed;
};

export const updateWorkflowHandler = async (name: string, options: UpdateWorkflowOptions) => {
  try {
    const mode = resolveMode(options.mode);
    const logs = await readRecentLogs(parseLogLimit(options.logLimit));
    let currentWorkflow: Record<string, unknown> = { name };

    if (mode === 'files') {
      const result = await readWorkflowFile(name);
      currentWorkflow = result.data;
    }

    if (!options.ai) {
      console.log('AI flag not set. Use --ai to update workflow using Gemini.');
      return;
    }

    const agent = new AIAgent();
    const preferenceSummary = options.preferences ?? (await getPreferenceSummary());
    const updatedWorkflow = await agent.updateWorkflowJson({
      name,
      description: options.description,
      preferences: preferenceSummary,
      logs,
      currentWorkflow
    });

    if (mode === 'api') {
      const workflow = await createWorkflow(updatedWorkflow);
      console.log(`Workflow updated via API with ID: ${workflow.id}`);
      return;
    }

    const result = await updateWorkflowFile(name, updatedWorkflow);
    console.log(`Workflow updated at ${result.filePath}`);
  } catch (error) {
    console.error('Failed to update workflow:', (error as Error).message);
  }
};
