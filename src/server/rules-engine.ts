import Database from 'better-sqlite3';
import path from 'path';
import { appendCorrection, type CorrectionEntry } from '../cli/utils/storage-files';

export interface RuleCondition {
  type: 'time' | 'day' | 'people_present' | 'device_state' | 'metric';
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'not_contains';
  value: any;
}

export interface RuleAction {
  deviceId: string;
  action: string;
  params: Record<string, any>;
}

export interface ContextualRule {
  id: string;
  name: string;
  description?: string;
  triggerType: 'event' | 'schedule' | 'state';
  triggerConfig: any; // JSON config for trigger
  conditions: RuleCondition[];
  actions: RuleAction[];
  confidence: number; // 0.0 to 1.0
  enabled: boolean;
  createdBy: string; // person_id or 'system'
  createdAt: string;
  updatedAt: string;
  lastTriggered?: string;
  triggerCount: number;
}

const getDbPath = () => path.join(process.cwd(), 'data', 'elo.db');

const getDb = () => new Database(getDbPath());

const dbAll = async (db: any, query: string, params: any[] = []): Promise<any[]> => {
  return db.prepare(query).all(...params);
};

const dbGet = async (db: any, query: string, params: any[] = []): Promise<any> => {
  return db.prepare(query).get(...params);
};

const dbRun = async (db: any, query: string, params: any[] = []): Promise<any> => {
  return db.prepare(query).run(...params);
};

export const getAllRules = async (): Promise<ContextualRule[]> => {
  const db = getDb();
  try {
    const rows = await dbAll(db, `
      SELECT * FROM rules
      WHERE enabled = 1
      ORDER BY confidence DESC, created_at DESC
    `);

    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      triggerType: row.trigger_type,
      triggerConfig: JSON.parse(row.trigger_config || '{}'),
      conditions: JSON.parse(row.conditions || '[]'),
      actions: JSON.parse(row.actions || '[]'),
      confidence: row.confidence,
      enabled: Boolean(row.enabled),
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastTriggered: row.last_triggered,
      triggerCount: row.trigger_count
    }));
  } finally {
    db.close();
  }
};

export const createRuleFromCorrection = async (correction: CorrectionEntry): Promise<string> => {
  const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Build conditions from correction context
  const conditions: RuleCondition[] = [];

  if (correction.context.time) {
    // Create time range condition (e.g., if correction was at 14:30, create range 14:00-15:00)
    const [hours] = correction.context.time.split(':').map(Number);
    conditions.push({
      type: 'time',
      operator: 'equals',
      value: `${hours.toString().padStart(2, '0')}:00-${(hours + 1).toString().padStart(2, '0')}:00`
    });
  }

  if (correction.context.day !== undefined) {
    conditions.push({
      type: 'day',
      operator: 'equals',
      value: correction.context.day
    });
  }

  if (correction.context.peoplePresent && correction.context.peoplePresent.length > 0) {
    conditions.push({
      type: 'people_present',
      operator: 'contains',
      value: correction.context.peoplePresent
    });
  }

  const rule: ContextualRule = {
    id: ruleId,
    name: `Correction for ${correction.deviceId} ${correction.action}`,
    description: `Auto-generated rule from user correction`,
    triggerType: 'event',
    triggerConfig: {
      eventType: 'device_action',
      deviceId: correction.deviceId,
      action: correction.action
    },
    conditions,
    actions: [{
      deviceId: correction.deviceId,
      action: correction.action,
      params: correction.correctedParams
    }],
    confidence: 0.1, // Start with low confidence
    enabled: true,
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    triggerCount: 0
  };

  await saveRule(rule);
  return ruleId;
};

export const saveRule = async (rule: ContextualRule): Promise<void> => {
  const db = getDb();
  try {
    await dbRun(db, `
      INSERT OR REPLACE INTO rules (
        id, name, description, trigger_type, trigger_config, conditions, actions,
        confidence, enabled, created_by, created_at, updated_at, last_triggered, trigger_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      rule.id,
      rule.name,
      rule.description,
      rule.triggerType,
      JSON.stringify(rule.triggerConfig),
      JSON.stringify(rule.conditions),
      JSON.stringify(rule.actions),
      rule.confidence,
      rule.enabled ? 1 : 0,
      rule.createdBy,
      rule.createdAt,
      rule.updatedAt,
      rule.lastTriggered,
      rule.triggerCount
    ]);
  } finally {
    db.close();
  }
};

export const evaluateRuleConditions = (rule: ContextualRule, context: {
  time: string;
  day: number;
  peoplePresent?: string[];
  deviceStates?: Record<string, any>;
  metrics?: Record<string, any>;
}): boolean => {
  for (const condition of rule.conditions) {
    const { type, operator, value } = condition;

    switch (type) {
      case 'time': {
        const currentTime = context.time;
        if (operator === 'equals') {
          // Handle time range like "14:00-15:00"
          if (typeof value === 'string' && value.includes('-')) {
            const [start, end] = value.split('-');
            if (currentTime >= start && currentTime < end) {
              continue;
            }
          } else if (currentTime === value) {
            continue;
          }
        }
        return false;
      }

      case 'day': {
        if (operator === 'equals' && context.day === value) {
          continue;
        }
        return false;
      }

      case 'people_present': {
        const people = context.peoplePresent || [];
        if (operator === 'contains' && Array.isArray(value)) {
          const hasAllPeople = value.every(person => people.includes(person));
          if (hasAllPeople) continue;
        }
        return false;
      }

      case 'device_state': {
        const deviceState = context.deviceStates?.[value.deviceId];
        if (deviceState && deviceState[value.property] === value.expected) {
          continue;
        }
        return false;
      }

      case 'metric': {
        const metricValue = context.metrics?.[value.metricName];
        if (metricValue !== undefined) {
          switch (operator) {
            case 'equals':
              if (metricValue === value) continue;
              break;
            case 'greater_than':
              if (metricValue > value) continue;
              break;
            case 'less_than':
              if (metricValue < value) continue;
              break;
          }
        }
        return false;
      }
    }
  }

  return true;
};

export const updateRuleConfidence = async (ruleId: string, success: boolean): Promise<void> => {
  const db = getDb();
  try {
    // Get current confidence
    const row = await dbGet(db, 'SELECT confidence FROM rules WHERE id = ?', [ruleId]);
    if (!row) return;

    let newConfidence = row.confidence;

    if (success) {
      // Increase confidence (but cap at 1.0)
      newConfidence = Math.min(1.0, newConfidence + 0.1);
    } else {
      // Decrease confidence (but don't go below 0.0)
      newConfidence = Math.max(0.0, newConfidence - 0.2);
    }

    await dbRun(db, `
      UPDATE rules
      SET confidence = ?, updated_at = ?
      WHERE id = ?
    `, [newConfidence, new Date().toISOString(), ruleId]);

    // Disable rule if confidence drops too low
    if (newConfidence < 0.1) {
      await dbRun(db, 'UPDATE rules SET enabled = 0 WHERE id = ?', [ruleId]);
    }
  } finally {
    db.close();
  }
};

export const recordRuleTrigger = async (ruleId: string): Promise<void> => {
  const db = getDb();
  try {
    await dbRun(db, `
      UPDATE rules
      SET last_triggered = ?, trigger_count = trigger_count + 1, updated_at = ?
      WHERE id = ?
    `, [new Date().toISOString(), new Date().toISOString(), ruleId]);
  } finally {
    db.close();
  }
};