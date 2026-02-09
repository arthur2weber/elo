import AIAgent from '../../ai/agent';
import { createWorkflow } from '../utils/n8n-api';
import { createWorkflowFile } from '../utils/n8n-files';

type CreateWorkflowOptions = {
  ai?: boolean;
  description?: string;
  mode?: 'files' | 'api';
};

const resolveMode = (mode?: string) => {
  const envMode = process.env.N8N_MODE;
  const selected = mode || envMode || 'files';
  return selected === 'api' ? 'api' : 'files';
};

export const createWorkflowHandler = async (name: string, options: CreateWorkflowOptions) => {
  try {
    const mode = resolveMode(options.mode);
    let workflowPayload: Record<string, unknown> = { name };

    if (options.ai) {
      const agent = new AIAgent();
      workflowPayload = await agent.generateWorkflowJson({ name, description: options.description });
    }

    if (mode === 'api') {
      const workflow = await createWorkflow(workflowPayload);
      console.log(`Workflow "${workflow.name}" created via API with ID: ${workflow.id}`);
      return;
    }

    const workflowFile = await createWorkflowFile(name, workflowPayload);
    console.log(`Workflow "${workflowFile.name}" saved at ${workflowFile.filePath}`);
  } catch (error) {
    console.error('Error creating workflow:', (error as Error).message);
  }
};