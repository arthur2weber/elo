import { runGeminiApiPrompt } from '../../ai/gemini-api';
import Database from 'better-sqlite3';
import { EventPattern } from './correlation-engine';

export interface AutomationRule {
  id?: number;
  name: string;
  description: string;
  trigger: {
    type: string;
    device_id?: string;
    event_data?: any;
  };
  condition?: {
    type: string;
    value?: any;
  };
  action: {
    type: string;
    device_id?: string;
    command: string;
    parameters?: any;
  };
  confidence: number;
  enabled: boolean;
  created_at?: string;
  last_executed?: string;
  execution_count?: number;
}

export class RuleProposer {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Analyze correlation patterns and propose automation rules
   */
  async proposeRulesFromPatterns(minConfidence: number = 0.7): Promise<AutomationRule[]> {
    const patterns = await this.getHighConfidencePatterns(minConfidence);

    if (patterns.length === 0) {
      console.log('No high-confidence patterns found for rule proposal');
      return [];
    }

    const proposals: AutomationRule[] = [];

    for (const pattern of patterns) {
      try {
        const rule = await this.generateRuleFromPattern(pattern);
        if (rule) {
          proposals.push(rule);
        }
      } catch (error) {
        console.error(`Failed to generate rule from pattern ${pattern.id}:`, error);
      }
    }

    return proposals;
  }

  /**
   * Generate a single automation rule from a correlation pattern
   */
  private async generateRuleFromPattern(pattern: EventPattern): Promise<AutomationRule | null> {
    const prompt = this.buildRuleProposalPrompt(pattern);

    try {
      const response = await runGeminiApiPrompt(prompt);
      const ruleData = this.parseRuleResponse(response);

      if (!ruleData) {
        return null;
      }

      return {
        name: ruleData.name,
        description: ruleData.description,
        trigger: ruleData.trigger,
        condition: ruleData.condition,
        action: ruleData.action,
        confidence: pattern.confidence,
        enabled: false, // Start disabled, require manual approval
        execution_count: 0
      };
    } catch (error) {
      console.error('Failed to generate rule from Gemini:', error);
      return null;
    }
  }

  /**
   * Build the prompt for Gemini to propose automation rules
   */
  private buildRuleProposalPrompt(pattern: EventPattern): string {
    const triggerData = pattern.triggerEvent.state || {};
    const correlatedData = pattern.effectEvent.state || {};

    return `You are an AI automation expert. Based on the following observed pattern between device events, propose a practical automation rule.

OBSERVED PATTERN:
- Trigger Event: ${pattern.triggerEvent.action}
- Trigger Device: ${pattern.triggerEvent.deviceId}
- Trigger Details: ${JSON.stringify(triggerData, null, 2)}

- Correlated Event: ${pattern.effectEvent.action}
- Correlated Device: ${pattern.effectEvent.deviceId}
- Correlated Details: ${JSON.stringify(correlatedData, null, 2)}

- Time Delay: ${Math.round(pattern.timeDelay / 1000)} seconds
- Confidence: ${(pattern.confidence * 100).toFixed(1)}%
- Frequency: ${pattern.frequency} occurrences
- Total Occurrences: ${pattern.totalOccurrences}

PROPOSE AN AUTOMATION RULE:
Create a JSON object with the following structure:
{
  "name": "Brief, descriptive name for the automation",
  "description": "Detailed explanation of what this automation does and why it's useful",
  "trigger": {
    "type": "event_type_here",
    "device_id": "device_id_here",
    "event_data": {relevant_event_data_or_null}
  },
  "condition": {
    "type": "time|state|comparison|none",
    "value": "condition_value_or_null"
  },
  "action": {
    "type": "command_type",
    "device_id": "target_device_id",
    "command": "specific_command",
    "parameters": {command_parameters_or_null}
  }
}

GUIDELINES:
- Make the rule practical and safe
- Consider time delays and add appropriate conditions
- Use specific device IDs when available
- Include time-based conditions for delayed actions
- Ensure the action is a logical response to the trigger
- Keep names and descriptions clear and actionable

Return only the JSON object, no additional text.`;
  }

  /**
   * Parse Gemini's response into a structured rule
   */
  private parseRuleResponse(response: string): any {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No JSON found in Gemini response');
        return null;
      }

      const ruleData = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!ruleData.name || !ruleData.trigger || !ruleData.action) {
        console.error('Invalid rule structure:', ruleData);
        return null;
      }

      return ruleData;
    } catch (error) {
      console.error('Failed to parse rule response:', error);
      return null;
    }
  }

  /**
   * Get high-confidence correlation patterns from database
   */
  private async getHighConfidencePatterns(minConfidence: number): Promise<EventPattern[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM correlation_patterns
      WHERE confidence >= ?
      ORDER BY confidence DESC, frequency DESC
      LIMIT 50
    `);

    const rows = stmt.all(minConfidence) as any[];
    return rows.map(row => ({
      id: row.id.toString(),
      triggerEvent: {
        deviceId: row.trigger_device_id,
        action: row.trigger_event_type,
        state: row.trigger_event_data ? JSON.parse(row.trigger_event_data) : undefined
      },
      effectEvent: {
        deviceId: row.correlated_device_id,
        action: row.correlated_event_type,
        state: row.correlated_event_data ? JSON.parse(row.correlated_event_data) : undefined
      },
      timeDelay: row.time_delay_seconds * 1000, // Convert to milliseconds
      confidence: row.confidence,
      frequency: row.frequency,
      totalOccurrences: row.frequency, // Approximation
      lastSeen: new Date(row.last_seen),
      created: new Date(row.created_at)
    }));
  }

  /**
   * Save proposed rules to database for review
   */
  async saveProposedRules(rules: AutomationRule[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO rules (
        name, description, trigger_type, trigger_device_id, trigger_event_data,
        condition_type, condition_value, action_type, action_device_id,
        action_command, action_parameters, confidence, enabled,
        created_at, execution_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rule of rules) {
      try {
        stmt.run([
          rule.name,
          rule.description,
          rule.trigger.type,
          rule.trigger.device_id || null,
          rule.trigger.event_data ? JSON.stringify(rule.trigger.event_data) : null,
          rule.condition?.type || 'none',
          rule.condition?.value ? JSON.stringify(rule.condition.value) : null,
          rule.action.type,
          rule.action.device_id || null,
          rule.action.command,
          rule.action.parameters ? JSON.stringify(rule.action.parameters) : null,
          rule.confidence,
          rule.enabled,
          new Date().toISOString(),
          rule.execution_count || 0
        ]);
      } catch (error) {
        console.error(`Failed to save rule "${rule.name}":`, error);
      }
    }
  }

  /**
   * Get all proposed rules pending approval
   */
  async getProposedRules(): Promise<AutomationRule[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM rules WHERE enabled = 0 ORDER BY confidence DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      trigger: {
        type: row.trigger_type,
        device_id: row.trigger_device_id,
        event_data: row.trigger_event_data ? JSON.parse(row.trigger_event_data) : undefined
      },
      condition: row.condition_type !== 'none' ? {
        type: row.condition_type,
        value: row.condition_value ? JSON.parse(row.condition_value) : undefined
      } : undefined,
      action: {
        type: row.action_type,
        device_id: row.action_device_id,
        command: row.action_command,
        parameters: row.action_parameters ? JSON.parse(row.action_parameters) : undefined
      },
      confidence: row.confidence,
      enabled: Boolean(row.enabled),
      created_at: row.created_at,
      last_executed: row.last_executed,
      execution_count: row.execution_count
    }));
  }

  /**
   * Approve a proposed rule (enable it)
   */
  async approveRule(ruleId: number): Promise<void> {
    const stmt = this.db.prepare('UPDATE rules SET enabled = 1 WHERE id = ?');
    const result = stmt.run(ruleId);

    if (result.changes === 0) {
      throw new Error('Rule not found');
    }
  }

  /**
   * Reject a proposed rule (delete it)
   */
  async rejectRule(ruleId: number): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM rules WHERE id = ?');
    const result = stmt.run(ruleId);

    if (result.changes === 0) {
      throw new Error('Rule not found');
    }
  }
}