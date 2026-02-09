import { getWorkflows } from '../utils/n8n-api';
import { getWorkflowsFromFiles } from '../utils/n8n-files';

const resolveMode = (mode?: string) => {
    const envMode = process.env.N8N_MODE;
    const selected = mode || envMode || 'files';
    return selected === 'api' ? 'api' : 'files';
};

export const listWorkflowsHandler = async (options: { mode?: 'files' | 'api' }) => {
    try {
        const mode = resolveMode(options.mode);
        const workflows = mode === 'api' ? await getWorkflows() : await getWorkflowsFromFiles();

        if (workflows.length === 0) {
            console.log('No workflows found.');
            return;
        }
        console.log('List of Workflows:');
        workflows.forEach((workflow: { name: string; id: string }) => {
            console.log(`- ${workflow.name} (ID: ${workflow.id})`);
        });
    } catch (error) {
        console.error('Error fetching workflows:', (error as Error).message);
    }
};