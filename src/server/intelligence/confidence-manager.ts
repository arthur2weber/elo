import Database from 'better-sqlite3';
import { AutomationRule } from './rule-proposer';

export interface RuleMetrics {
  ruleId: number;
  executionCount: number;
  successCount: number;
  failureCount: number;
  lastExecuted?: Date;
  averageExecutionTime?: number;
  userFeedback?: 'positive' | 'negative' | 'neutral';
  confidence: number;
  createdAt: Date;
  ttlExpiresAt?: Date;
}

export interface ConfidenceDecayConfig {
  initialTTLHours: number; // Initial time-to-live for new rules
  decayRate: number; // How fast confidence decays (0.01 = 1% per day)
  minConfidence: number; // Minimum confidence before rule is disabled
  successBoost: number; // Confidence increase on successful execution
  failurePenalty: number; // Confidence decrease on failed execution
  userFeedbackWeight: number; // How much user feedback affects confidence
  maxTTLHours: number; // Maximum TTL extension for high-confidence rules
}

export class ConfidenceManager {
  private db: Database.Database;
  private config: ConfidenceDecayConfig;

  constructor(db: Database.Database, config?: Partial<ConfidenceDecayConfig>) {
    this.db = db;
    this.config = {
      initialTTLHours: 168, // 7 days
      decayRate: 0.02, // 2% decay per day
      minConfidence: 0.3,
      successBoost: 0.05, // +5% on success
      failurePenalty: 0.1, // -10% on failure
      userFeedbackWeight: 0.2,
      maxTTLHours: 720, // 30 days
      ...config
    };
  }

  /**
   * Initialize metrics for a new rule
   */
  async initializeRuleMetrics(ruleId: number): Promise<void> {
    const ttlExpiresAt = new Date();
    ttlExpiresAt.setHours(ttlExpiresAt.getHours() + this.config.initialTTLHours);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO rule_metrics (
        rule_id, execution_count, success_count, failure_count,
        confidence, created_at, ttl_expires_at
      ) VALUES (?, 0, 0, 0, 0.5, ?, ?)
    `);

    stmt.run(ruleId, new Date().toISOString(), ttlExpiresAt.toISOString());
  }

  /**
   * Record successful rule execution
   */
  async recordSuccess(ruleId: number, executionTime?: number): Promise<void> {
    const metrics = await this.getRuleMetrics(ruleId);
    if (!metrics) return;

    // Update execution statistics
    const stmt = this.db.prepare(`
      UPDATE rule_metrics
      SET execution_count = execution_count + 1,
          success_count = success_count + 1,
          last_executed = ?,
          average_execution_time = CASE
            WHEN average_execution_time IS NULL THEN ?
            ELSE (average_execution_time + ?) / 2
          END
      WHERE rule_id = ?
    `);

    stmt.run(
      new Date().toISOString(),
      executionTime,
      executionTime,
      ruleId
    );

    // Adjust confidence
    await this.adjustConfidence(ruleId, 'success');
  }

  /**
   * Record failed rule execution
   */
  async recordFailure(ruleId: number, error?: string): Promise<void> {
    const metrics = await this.getRuleMetrics(ruleId);
    if (!metrics) return;

    // Update execution statistics
    const stmt = this.db.prepare(`
      UPDATE rule_metrics
      SET execution_count = execution_count + 1,
          failure_count = failure_count + 1,
          last_executed = ?
      WHERE rule_id = ?
    `);

    stmt.run(new Date().toISOString(), ruleId);

    // Adjust confidence
    await this.adjustConfidence(ruleId, 'failure');

    // Log the failure for analysis
    console.warn(`[ConfidenceManager] Rule ${ruleId} failed: ${error}`);
  }

  /**
   * Record user feedback on rule execution
   */
  async recordUserFeedback(ruleId: number, feedback: 'positive' | 'negative' | 'neutral'): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE rule_metrics
      SET user_feedback = ?
      WHERE rule_id = ?
    `);

    stmt.run(feedback, ruleId);

    // Adjust confidence based on feedback
    await this.adjustConfidence(ruleId, 'feedback', feedback);
  }

  /**
   * Adjust rule confidence based on execution results
   */
  private async adjustConfidence(
    ruleId: number,
    event: 'success' | 'failure' | 'feedback',
    feedback?: 'positive' | 'negative' | 'neutral'
  ): Promise<void> {
    const metrics = await this.getRuleMetrics(ruleId);
    if (!metrics) return;

    let newConfidence = metrics.confidence;

    switch (event) {
      case 'success':
        newConfidence = Math.min(1.0, newConfidence + this.config.successBoost);
        break;

      case 'failure':
        newConfidence = Math.max(0.0, newConfidence - this.config.failurePenalty);
        break;

      case 'feedback':
        if (feedback === 'positive') {
          newConfidence = Math.min(1.0, newConfidence + this.config.userFeedbackWeight);
        } else if (feedback === 'negative') {
          newConfidence = Math.max(0.0, newConfidence - this.config.userFeedbackWeight);
        }
        // neutral feedback doesn't change confidence
        break;
    }

    // Update confidence in database
    const stmt = this.db.prepare(`
      UPDATE rule_metrics
      SET confidence = ?
      WHERE rule_id = ?
    `);

    stmt.run(newConfidence, ruleId);

    // Update rule's enabled status if confidence is too low
    if (newConfidence < this.config.minConfidence) {
      await this.disableRule(ruleId);
    }

    // Extend TTL for high-confidence rules
    if (newConfidence > 0.8) {
      await this.extendRuleTTL(ruleId);
    }
  }

  /**
   * Apply time-based decay to all rules
   */
  async applyTimeDecay(): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE rule_metrics
      SET confidence = MAX(0, confidence * (1 - ?))
      WHERE confidence > 0
    `);

    stmt.run(this.config.decayRate);

    console.log(`[ConfidenceManager] Applied ${this.config.decayRate * 100}% decay to all rules`);
  }

  /**
   * Clean up expired rules
   */
  async cleanupExpiredRules(): Promise<number> {
    // First disable rules that have expired
    const disableStmt = this.db.prepare(`
      UPDATE rules
      SET enabled = 0
      WHERE id IN (
        SELECT rule_id FROM rule_metrics
        WHERE ttl_expires_at < ? AND confidence < ?
      )
    `);

    const now = new Date().toISOString();
    const result = disableStmt.run(now, this.config.minConfidence);

    console.log(`[ConfidenceManager] Disabled ${result.changes} expired rules`);

    return result.changes;
  }

  /**
   * Extend TTL for high-confidence rules
   */
  private async extendRuleTTL(ruleId: number): Promise<void> {
    const currentMetrics = await this.getRuleMetrics(ruleId);
    if (!currentMetrics?.ttlExpiresAt) return;

    const now = new Date();
    const extensionHours = Math.min(
      this.config.maxTTLHours,
      Math.floor((currentMetrics.ttlExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)) + 24
    );

    const newExpiry = new Date(now.getTime() + (extensionHours * 60 * 60 * 1000));

    const stmt = this.db.prepare(`
      UPDATE rule_metrics
      SET ttl_expires_at = ?
      WHERE rule_id = ?
    `);

    stmt.run(newExpiry.toISOString(), ruleId);
  }

  /**
   * Disable a rule due to low confidence
   */
  private async disableRule(ruleId: number): Promise<void> {
    const stmt = this.db.prepare('UPDATE rules SET enabled = 0 WHERE id = ?');
    stmt.run(ruleId);

    console.log(`[ConfidenceManager] Disabled rule ${ruleId} due to low confidence`);
  }

  /**
   * Get metrics for a specific rule
   */
  async getRuleMetrics(ruleId: number): Promise<RuleMetrics | null> {
    const stmt = this.db.prepare('SELECT * FROM rule_metrics WHERE rule_id = ?');
    const row = stmt.get(ruleId) as any;

    if (!row) return null;

    return {
      ruleId: row.rule_id,
      executionCount: row.execution_count,
      successCount: row.success_count,
      failureCount: row.failure_count,
      lastExecuted: row.last_executed ? new Date(row.last_executed) : undefined,
      averageExecutionTime: row.average_execution_time,
      userFeedback: row.user_feedback,
      confidence: row.confidence,
      createdAt: new Date(row.created_at),
      ttlExpiresAt: row.ttl_expires_at ? new Date(row.ttl_expires_at) : undefined
    };
  }

  /**
   * Get all rule metrics
   */
  async getAllRuleMetrics(): Promise<RuleMetrics[]> {
    const stmt = this.db.prepare('SELECT * FROM rule_metrics ORDER BY confidence DESC');
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      ruleId: row.rule_id,
      executionCount: row.execution_count,
      successCount: row.success_count,
      failureCount: row.failure_count,
      lastExecuted: row.last_executed ? new Date(row.last_executed) : undefined,
      averageExecutionTime: row.average_execution_time,
      userFeedback: row.user_feedback,
      confidence: row.confidence,
      createdAt: new Date(row.created_at),
      ttlExpiresAt: row.ttl_expires_at ? new Date(row.ttl_expires_at) : undefined
    }));
  }

  /**
   * Get rules that need attention (low confidence, expiring soon)
   */
  async getRulesNeedingAttention(): Promise<Array<{rule: AutomationRule, metrics: RuleMetrics}>> {
    const stmt = this.db.prepare(`
      SELECT r.*, rm.*
      FROM rules r
      JOIN rule_metrics rm ON r.id = rm.rule_id
      WHERE (rm.confidence < 0.5 OR rm.ttl_expires_at < datetime('now', '+24 hours'))
      AND r.enabled = 1
      ORDER BY rm.confidence ASC, rm.ttl_expires_at ASC
    `);

    const rows = stmt.all() as any[];

    return rows.map(row => ({
      rule: {
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
      },
      metrics: {
        ruleId: row.rule_id,
        executionCount: row.execution_count,
        successCount: row.success_count,
        failureCount: row.failure_count,
        lastExecuted: row.last_executed ? new Date(row.last_executed) : undefined,
        averageExecutionTime: row.average_execution_time,
        userFeedback: row.user_feedback,
        confidence: row.confidence,
        createdAt: new Date(row.created_at),
        ttlExpiresAt: row.ttl_expires_at ? new Date(row.ttl_expires_at) : undefined
      }
    }));
  }

  /**
   * Manually adjust rule confidence (for admin purposes)
   */
  async adjustRuleConfidence(ruleId: number, newConfidence: number): Promise<void> {
    const clampedConfidence = Math.max(0, Math.min(1, newConfidence));

    const stmt = this.db.prepare(`
      UPDATE rule_metrics
      SET confidence = ?
      WHERE rule_id = ?
    `);

    stmt.run(clampedConfidence, ruleId);

    // Re-enable rule if confidence is now acceptable
    if (clampedConfidence >= this.config.minConfidence) {
      const enableStmt = this.db.prepare('UPDATE rules SET enabled = 1 WHERE id = ?');
      enableStmt.run(ruleId);
    }
  }

  /**
   * Get confidence statistics across all rules
   */
  async getConfidenceStats(): Promise<{
    totalRules: number;
    enabledRules: number;
    averageConfidence: number;
    highConfidenceRules: number; // > 0.8
    lowConfidenceRules: number; // < 0.5
    expiringSoonRules: number; // expiring in < 24 hours
  }> {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_rules,
        SUM(CASE WHEN r.enabled = 1 THEN 1 ELSE 0 END) as enabled_rules,
        AVG(rm.confidence) as avg_confidence,
        SUM(CASE WHEN rm.confidence > 0.8 THEN 1 ELSE 0 END) as high_confidence,
        SUM(CASE WHEN rm.confidence < 0.5 THEN 1 ELSE 0 END) as low_confidence,
        SUM(CASE WHEN rm.ttl_expires_at < datetime('now', '+24 hours') THEN 1 ELSE 0 END) as expiring_soon
      FROM rules r
      JOIN rule_metrics rm ON r.id = rm.rule_id
    `);

    const stats = stmt.get() as any;

    return {
      totalRules: stats.total_rules || 0,
      enabledRules: stats.enabled_rules || 0,
      averageConfidence: stats.avg_confidence || 0,
      highConfidenceRules: stats.high_confidence || 0,
      lowConfidenceRules: stats.low_confidence || 0,
      expiringSoonRules: stats.expiring_soon || 0
    };
  }
}