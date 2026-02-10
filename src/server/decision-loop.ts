import AIAgent from '../ai/agent';
import { readRecentLogs, readRecentRequests, readWorkflowFile, updateWorkflowFile } from '../cli/utils/n8n-files';
import { getPreferenceSummary } from '../cli/utils/preferences';
import { readDevices } from '../cli/utils/device-registry';
import { buildDecisionContext, buildDeviceStatusSnapshot, formatDecisionContext } from './decision-context';
import { validateWorkflowDevices } from './device-validator';

export type DecisionLoopOptions = {
  intervalMs?: number;
  logLimit?: number;
  requestLimit?: number;
  workflows?: string[];
};

const DEFAULT_INTERVAL = 10000;

const parseWorkflows = () => {
  const value = process.env.ELO_DECISION_WORKFLOWS || '';
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
};

export const startDecisionLoop = (options: DecisionLoopOptions = {}) => {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL;
  const logLimit = options.logLimit ?? 100;
  const requestLimit = options.requestLimit ?? 50;
  const workflows = options.workflows ?? parseWorkflows();

  if (workflows.length === 0) {
    console.warn('Decision loop disabled: no workflows configured (ELO_DECISION_WORKFLOWS).');
    return () => undefined;
  }

  const agent = new AIAgent();

  const tick = async () => {
    const logs = await readRecentLogs(logLimit);
    const requests = await readRecentRequests(requestLimit);
    const preferences = await getPreferenceSummary();
  const devices = await readDevices();
  const statusSnapshot = buildDeviceStatusSnapshot(logs);
  const structuredContext = buildDecisionContext(devices, statusSnapshot, requests);
  const decisionContext = formatDecisionContext(structuredContext);

    await Promise.all(workflows.map(async (workflowName) => {
      const currentWorkflow = (await readWorkflowFile(workflowName)).data;
      const updatedWorkflow = await agent.updateWorkflowJson({
        name: workflowName,
        description: `Auto-updated by ELO decision loop.`,
        preferences: `${preferences}\nStructuredContext: ${decisionContext}`,
        logs,
        currentWorkflow
      });
      validateWorkflowDevices(updatedWorkflow, devices);
      await updateWorkflowFile(workflowName, updatedWorkflow);
    }));
  };

  const timer = setInterval(() => {
    tick().catch((error) => {
      console.error('Decision loop tick failed:', error);
    });
  }, intervalMs);

  return () => clearInterval(timer);
};
