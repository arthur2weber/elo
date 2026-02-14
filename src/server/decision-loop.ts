import AIAgent from '../ai/agent';
import { readRecentLogs, readRecentRequests } from '../cli/utils/storage-files';
import { readAutomationFile, updateAutomationFile } from '../cli/utils/automation-files';
import { buildPreferenceStats, getPreferenceSummary, readDecisions, shouldAutoApprove } from '../cli/utils/preferences';
import { appendDecision } from '../cli/utils/preferences';
import { appendSuggestion } from '../cli/utils/suggestions';
import { readDevices } from '../cli/utils/device-registry';
import { getDriver } from '../cli/utils/drivers';
import { promises as fs } from 'fs'; // Import fs
import path from 'path'; // Import path
import { buildDecisionContext, buildDeviceStatusHistory, buildDeviceStatusSnapshot, formatDecisionContext } from './decision-context';
import { getAllRules, ContextualRule, RuleCondition } from './rules-engine';
import { dispatchAction } from './action-dispatcher';

export type DecisionLoopOptions = {
  intervalMs?: number;
  logLimit?: number;
  requestLimit?: number;
  automations?: string[];
};

const DEFAULT_INTERVAL = 10000;

const MAX_PROMPT_STRING_LENGTH = 2000;
const MAX_PROMPT_ARRAY_LENGTH = 20;
const MAX_PROMPT_OBJECT_KEYS = 20;
const MAX_PROMPT_DEPTH = 4;
const STATUS_HISTORY_LIMIT = 40;

const truncateString = (value: string, max = MAX_PROMPT_STRING_LENGTH) => {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}... (truncated ${value.length - max} chars)`;
};

const sanitizeForPrompt = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return truncateString(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (depth >= MAX_PROMPT_DEPTH) {
    return '[truncated]';
  }
  if (Array.isArray(value)) {
    const limited = value.slice(0, MAX_PROMPT_ARRAY_LENGTH).map((entry) => sanitizeForPrompt(entry, depth + 1));
    if (value.length > MAX_PROMPT_ARRAY_LENGTH) {
  limited.push(`... (${value.length - MAX_PROMPT_ARRAY_LENGTH} more items truncated)`);
    }
    return limited;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const limitedEntries = entries
      .slice(0, MAX_PROMPT_OBJECT_KEYS)
      .map(([key, entry]) => [key, sanitizeForPrompt(entry, depth + 1)] as const);
    const sanitizedObject: Record<string, unknown> = Object.fromEntries(limitedEntries);
    if (entries.length > MAX_PROMPT_OBJECT_KEYS) {
      sanitizedObject.__truncated = `${entries.length - MAX_PROMPT_OBJECT_KEYS} additional keys truncated`;
    }
    return sanitizedObject;
  }
  return String(value);
};

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
    console.log('[DecisionLoop] No ELO_DECISION_AUTOMATIONS configured - proactive AI suggestions disabled. Contextual rules still active via action-dispatcher.');
    return () => undefined;
  }

  const agent = new AIAgent();

  const tick = async () => {
    const logs = await readRecentLogs(logLimit);
    const preferenceSummary = await getPreferenceSummary();
    const preferenceStats = buildPreferenceStats(await readDecisions(200));
    const devices = await readDevices();
    const rules = await getAllRules();

    // Enrich devices with capabilities from driver database
    const devicesWithCapabilities = await Promise.all(devices.map(async (device) => {
        try {
            const driverEntry = await getDriver(device.id);
            if (driverEntry) {
                return {
                    ...device,
                    capabilities: Object.keys(driverEntry.config.actions || {})
                };
            } else {
                return { ...device, capabilities: [] };
            }
        } catch (e) {
            // Ignore errors
            return { ...device, capabilities: [] };
        }
    }));

    const sanitizedLogs = logs.map((entry) => sanitizeForPrompt(entry)) as typeof logs;
    const structuredContext = await buildDecisionContext(devicesWithCapabilities);
    const sanitizedStructuredContext = sanitizeForPrompt(structuredContext) as typeof structuredContext;
    const decisionContext = formatDecisionContext(sanitizedStructuredContext);
    const trimmedPreferenceSummary = truncateString(preferenceSummary ?? '');

    // Include contextual rules in decision context
    const rulesContext = rules.length > 0
      ? `\nActive Contextual Rules:\n${rules.map(rule =>
          `- ${rule.name}: ${rule.description} (confidence: ${(rule.confidence * 100).toFixed(0)}%, conditions: ${rule.conditions.map(c => `${c.type}=${c.value}`).join(', ')})`
        ).join('\n')}`
      : '\nNo active contextual rules.';

    await Promise.all(automations.map(async (automationName) => {
      const currentCode = (await readAutomationFile(automationName)).code;
      const updatedCode = await agent.updateAutomationCode({
        name: automationName,
        description: `Auto-updated by ELO decision loop.`,
        preferences: `${trimmedPreferenceSummary}\nStructuredContext: ${decisionContext}${rulesContext}`,
        logs: sanitizedLogs,
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
        history: trimmedPreferenceSummary,
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

/**
 * Decision Loop v2: Consult contextual rules before executing actions
 * This function should be called BEFORE executing any action to check if there are
 * contextual rules that should override or modify the action.
 */
export async function consultContextualRules(
  deviceId: string,
  action: string,
  params: Record<string, any> = {},
  context?: {
    time?: string;
    day?: number;
    peoplePresent?: string[];
    location?: string;
  }
): Promise<{
  shouldExecute: boolean;
  modifiedParams?: Record<string, any>;
  ruleApplied?: ContextualRule;
  reason?: string;
}> {
  try {
    const rules = await getAllRules();

    // Filter enabled rules that match the action
    const relevantRules = rules.filter(rule =>
      rule.enabled &&
      rule.triggerType === 'event' &&
      rule.triggerConfig.eventType === 'device_action' &&
      rule.triggerConfig.deviceId === deviceId &&
      rule.triggerConfig.action === action
    );

    if (relevantRules.length === 0) {
      return { shouldExecute: true };
    }

    // Evaluate each rule in order of confidence (highest first)
    const sortedRules = relevantRules.sort((a, b) => b.confidence - a.confidence);

    for (const rule of sortedRules) {
      if (await evaluateContextualRule(rule, params, context)) {
        // Rule matches - apply its actions instead
        const modifiedParams = applyRuleActions(rule, params);

        // Update rule execution stats
        await updateRuleExecutionStats(rule.id);

        console.log(`[DecisionLoopV2] Applied contextual rule "${rule.name}" for ${deviceId}=${action}`);

        return {
          shouldExecute: true,
          modifiedParams,
          ruleApplied: rule,
          reason: `Applied contextual rule: ${rule.name}`
        };
      }
    }

    return { shouldExecute: true };
  } catch (error) {
    console.error('[DecisionLoopV2] Error consulting contextual rules:', error);
    // On error, allow execution to continue
    return { shouldExecute: true };
  }
}

/**
 * Evaluate if a contextual rule should trigger
 */
async function evaluateContextualRule(
  rule: ContextualRule,
  params: Record<string, any>,
  context?: {
    time?: string;
    day?: number;
    peoplePresent?: string[];
    location?: string;
  }
): Promise<boolean> {
  // Check all conditions
  for (const condition of rule.conditions) {
    if (!(await evaluateRuleCondition(condition, params, context))) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluate a single rule condition
 */
async function evaluateRuleCondition(
  condition: RuleCondition,
  params: Record<string, any>,
  context?: {
    time?: string;
    day?: number;
    peoplePresent?: string[];
    location?: string;
  }
): Promise<boolean> {
  switch (condition.type) {
    case 'time': {
      if (!context?.time) return false;
      const [hours, minutes] = context.time.split(':').map(Number);
      const currentHour = hours;
      const currentMinute = minutes;

      if (condition.operator === 'equals') {
        const [targetHour, targetMinute] = (condition.value as string).split(':').map(Number);
        return currentHour === targetHour && currentMinute === targetMinute;
      }
      // Add more time operators as needed
      return false;
    }

    case 'day': {
      if (context?.day === undefined) return false;
      const currentDay = context.day;

      if (condition.operator === 'equals') {
        return currentDay === condition.value;
      }
      // Add more day operators as needed
      return false;
    }

    case 'people_present': {
      const peoplePresent = context?.peoplePresent || [];

      switch (condition.operator) {
        case 'contains':
          return peoplePresent.includes(condition.value);
        case 'not_contains':
          return !peoplePresent.includes(condition.value);
        default:
          return false;
      }
    }

    case 'device_state': {
      // TODO: Implement device state checking
      // This would need to query current device states
      return true; // For now, allow
    }

    default:
      return true;
  }
}

/**
 * Apply rule actions to modify parameters
 */
function applyRuleActions(rule: ContextualRule, originalParams: Record<string, any>): Record<string, any> {
  let modifiedParams = { ...originalParams };

  for (const action of rule.actions) {
    // Apply parameter modifications from the rule
    if (action.params) {
      modifiedParams = { ...modifiedParams, ...action.params };
    }
  }

  return modifiedParams;
}

/**
 * Update rule execution statistics
 */
async function updateRuleExecutionStats(ruleId: string): Promise<void> {
  try {
    // This would update execution count, last executed time, etc.
    // For now, just log it
    console.log(`[DecisionLoopV2] Rule ${ruleId} executed`);
  } catch (error) {
    console.error('[DecisionLoopV2] Error updating rule stats:', error);
  }
}
