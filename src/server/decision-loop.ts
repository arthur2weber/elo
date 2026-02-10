import AIAgent from '../ai/agent';
import { readRecentLogs, readRecentRequests } from '../cli/utils/n8n-files';
import { readAutomationFile, updateAutomationFile } from '../cli/utils/automation-files';
import { getPreferenceSummary } from '../cli/utils/preferences';
import { readDevices } from '../cli/utils/device-registry';
import { buildDecisionContext, buildDeviceStatusSnapshot, formatDecisionContext } from './decision-context';

export type DecisionLoopOptions = {
  intervalMs?: number;
  logLimit?: number;
  requestLimit?: number;
  automations?: string[];
};

const DEFAULT_INTERVAL = 10000;

const parseAutomations = () => {
  const value = process.env.ELO_DECISION_AUTOMATIONS || '';
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
};

export const startDecisionLoop = (options: DecisionLoopOptions = {}) => {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL;
  const logLimit = options.logLimit ?? 100;
  const requestLimit = options.requestLimit ?? 50;
  const automations = options.automations ?? parseAutomations();

  if (automations.length === 0) {
    console.warn('Decision loop disabled: no automations configured (ELO_DECISION_AUTOMATIONS).');
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

    await Promise.all(automations.map(async (automationName) => {
      const currentCode = (await readAutomationFile(automationName)).code;
      const updatedCode = await agent.updateAutomationCode({
        name: automationName,
        description: `Auto-updated by ELO decision loop.`,
        preferences: `${preferences}\nStructuredContext: ${decisionContext}`,
        logs,
        currentCode
      });
      await updateAutomationFile(automationName, updatedCode);
    }));
  };

  const timer = setInterval(() => {
    tick().catch((error) => {
      console.error('Decision loop tick failed:', error);
    });
  }, intervalMs);

  return () => clearInterval(timer);
};
