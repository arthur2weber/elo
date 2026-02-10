import AIAgent from '../ai/agent';
import { readRecentLogs, readRecentRequests } from '../cli/utils/storage-files';
import { readAutomationFile, updateAutomationFile } from '../cli/utils/automation-files';
import { buildPreferenceStats, getPreferenceSummary, readDecisions, shouldAutoApprove } from '../cli/utils/preferences';
import { appendDecision } from '../cli/utils/preferences';
import { appendSuggestion } from '../cli/utils/suggestions';
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
  const preferenceSummary = await getPreferenceSummary();
  const preferenceStats = buildPreferenceStats(await readDecisions(200));
  const devices = await readDevices();
  const statusSnapshot = buildDeviceStatusSnapshot(logs);
  const structuredContext = buildDecisionContext(devices, statusSnapshot, requests);
  const decisionContext = formatDecisionContext(structuredContext);

    await Promise.all(automations.map(async (automationName) => {
      const currentCode = (await readAutomationFile(automationName)).code;
      const updatedCode = await agent.updateAutomationCode({
        name: automationName,
        description: `Auto-updated by ELO decision loop.`,
        preferences: `${preferenceSummary}\nStructuredContext: ${decisionContext}`,
        logs,
        currentCode
      });
      const actionKey = `auto-${automationName}`;
      const suggestionMessage = `Observei um novo padrão e posso ajustar "${automationName}" para melhorar seu conforto. Posso aplicar esse ajuste?`;
      const fallback = {
        autoApprove: shouldAutoApprove(actionKey, preferenceStats),
        requiredApprovals: 3,
        askAgain: true,
        rationale: 'Fallback preference-based policy.'
      };
      const approval = await agent.decideApprovalPolicy({
        actionKey,
        suggestion: suggestionMessage,
        history: preferenceSummary,
        context: decisionContext,
        fallback
      });
      const suggestionId = `${automationName}-${Date.now()}`;

      await appendSuggestion({
        id: suggestionId,
        timestamp: new Date().toISOString(),
        actionKey,
        automationName,
  message: suggestionMessage,
        code: updatedCode,
        status: approval.autoApprove ? 'AUTO_APPLIED' : (approval.askAgain ? 'PENDING' : 'REJECTED'),
        requiredApprovals: approval.requiredApprovals,
        askAgain: approval.askAgain,
        rationale: approval.rationale,
        context: decisionContext
      });

      if (approval.autoApprove) {
        await updateAutomationFile(automationName, updatedCode);
        await appendDecision({
          timestamp: new Date().toISOString(),
          actionKey,
          suggestion: `Auto-applied update for ${automationName}`,
          accepted: true,
          details: { suggestionId }
        });
        return;
      }
    }));
  };

  const timer = setInterval(() => {
    tick().catch((error) => {
      console.error('Decision loop tick failed:', error);
    });
  }, intervalMs);

  return () => clearInterval(timer);
};
