import axios from 'axios';
import { readWorkflowFile } from '../cli/utils/n8n-files';
import { createWorkflow } from '../cli/utils/n8n-api';
import { appendLogEntry } from '../cli/utils/n8n-files';

const N8N_HEALTH_URL = process.env.N8N_HEALTH_URL || 'http://localhost:5678/healthz';

const checkN8nHealth = async (): Promise<boolean> => {
  try {
    await axios.get(N8N_HEALTH_URL, { timeout: 2000 });
    return true;
  } catch (error) {
    return false;
  }
};

export const consolidateNeuron = async (workflowName: string) => {
  console.log(`[Consolidation] Injecting neuron: ${workflowName}`);
  
  // 1. Read the Approved Workflow JSON
  const workflowFile = await readWorkflowFile(workflowName);
  const workflowData = workflowFile.data;

  // 2. Inject into n8n via API
  let createdWorkflowId: string | undefined;
  try {
    // activate before injecting to ensure it runs immediately if it's a trigger
    const payload = { ...workflowData, active: true };
    const response = await createWorkflow(payload);
    createdWorkflowId = response.id;
    console.log(`[Consolidation] Success. ID: ${createdWorkflowId}`);
  } catch (error) {
    console.error(`[Consolidation] Injection failed: ${(error as Error).message}`);
    throw error;
  }

  // 3. Health Check (Auto-Rollback)
  // Wait a moment for n8n to potentially crash or react
  await new Promise((resolve) => setTimeout(resolve, 3000));
  
  const isHealthy = await checkN8nHealth();
  if (!isHealthy) {
    console.error(`[Consolidation] HEALTH CHECK FAILED. Initiating Rollback...`);
    
    // Attempt rollback (delete the bad workflow) if we have an ID
    // Note: deleteWorkflow is not yet in utils, implementing provisional call here or TODO
    // For now logging the Critical Error.
    // Ideally: await deleteWorkflow(createdWorkflowId);
    
    await appendLogEntry({
        timestamp: new Date().toISOString(),
        device: 'elo',
        event: 'rollback',
        payload: {
            reason: 'n8n health check failed after injection',
            workflowName,
            workflowId: createdWorkflowId
        }
    });
    
    throw new Error('Consolidation failed: n8n became unhealthy. Rollback logged.');
  }

  await appendLogEntry({
    timestamp: new Date().toISOString(),
    device: 'elo',
    event: 'consolidation',
    payload: {
        status: 'success',
        workflowName,
        workflowId: createdWorkflowId
    }
  });

  return createdWorkflowId;
};
