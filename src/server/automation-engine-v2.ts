import { promises as fs } from 'fs';
import path from 'path';
import * as chokidar from 'chokidar';
import * as cron from 'node-cron';
import Database from 'better-sqlite3';
import { eventBus } from './event-bus';
import { dispatchAction } from './action-dispatcher';
import { AutomationRule } from './rule-proposer';

export interface CompositeTrigger {
  type: 'and' | 'or';
  conditions: TriggerCondition[];
}

export interface TriggerCondition {
  type: 'event' | 'time' | 'state' | 'composite';
  eventType?: string;
  deviceId?: string;
  eventData?: any;
  timePattern?: string; // Cron expression
  stateCheck?: {
    deviceId: string;
    property: string;
    operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
    value: any;
  };
  composite?: CompositeTrigger;
}

export interface ScheduledRule {
  id: string;
  name: string;
  cronExpression: string;
  action: {
    type: string;
    device_id?: string;
    command: string;
    parameters?: any;
  };
  enabled: boolean;
  lastExecuted?: Date;
  executionCount: number;
}

export class AutomationEngineV2 {
  private db: Database.Database;
  private watcher?: chokidar.FSWatcher;
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private loadedAutomations: Map<string, any> = new Map();
  private readonly AUTOMATIONS_DIR = path.join(process.cwd(), 'automations');

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Initialize the automation engine
   */
  async initialize(): Promise<void> {
    console.log('[AutomationEngineV2] Initializing...');

    // Ensure automations directory exists
    await fs.mkdir(this.AUTOMATIONS_DIR, { recursive: true });

    // Load existing automations
    await this.loadAutomations();

    // Setup file watcher for hot reload
    this.setupFileWatcher();

    // Setup event bus listeners
    this.setupEventBusListeners();

    // Load and schedule cron-based rules
    await this.loadScheduledRules();

    console.log('[AutomationEngineV2] Initialized successfully');
  }

  /**
   * Load automation files from disk
   */
  private async loadAutomations(): Promise<void> {
    try {
      const files = await fs.readdir(this.AUTOMATIONS_DIR);

      for (const file of files) {
        if (file.endsWith('.js')) {
          await this.loadAutomationFile(file);
        }
      }

      console.log(`[AutomationEngineV2] Loaded ${this.loadedAutomations.size} automations`);
    } catch (error) {
      console.error('[AutomationEngineV2] Error loading automations:', error);
    }
  }

  /**
   * Load a single automation file
   */
  private async loadAutomationFile(filename: string): Promise<void> {
    const name = filename.replace(/\.(js|ts)$/, '');
    const filePath = path.join(this.AUTOMATIONS_DIR, filename);

    try {
      // Clear require cache for hot reload
      delete require.cache[require.resolve(filePath)];

      const module = await import(filePath);
      if (typeof module.default === 'function') {
        this.loadedAutomations.set(name, {
          name,
          handler: module.default,
          filePath,
          loadedAt: new Date()
        });
        console.log(`[AutomationEngineV2] Loaded automation: ${name}`);
      }
    } catch (error) {
      console.error(`[AutomationEngineV2] Failed to load automation ${name}:`, error);
    }
  }

  /**
   * Setup file watcher for hot reload
   */
  private setupFileWatcher(): void {
    this.watcher = chokidar.watch(this.AUTOMATIONS_DIR, {
      ignored: /(^|[\/\\])\../, // ignore dot files
      persistent: true,
      ignoreInitial: true
    });

    this.watcher.on('add', (filePath) => {
      const filename = path.basename(filePath);
      if (filename.endsWith('.js')) {
        console.log(`[AutomationEngineV2] New automation file detected: ${filename}`);
        this.loadAutomationFile(filename);
      }
    });

    this.watcher.on('change', (filePath) => {
      const filename = path.basename(filePath);
      if (filename.endsWith('.js')) {
        console.log(`[AutomationEngineV2] Automation file changed: ${filename}`);
        this.loadAutomationFile(filename);
      }
    });

    this.watcher.on('unlink', (filePath) => {
      const filename = path.basename(filePath);
      const name = filename.replace(/\.(js|ts)$/, '');
      if (this.loadedAutomations.has(name)) {
        this.loadedAutomations.delete(name);
        console.log(`[AutomationEngineV2] Removed automation: ${name}`);
      }
    });
  }

  /**
   * Setup event bus listeners for reactive automations
   */
  private setupEventBusListeners(): void {
    // Device state changes
    eventBus.on('device:state_changed', async (event) => {
      await this.handleDeviceStateChange(event);
    });

    // Person detection
    eventBus.on('person:detected', async (event) => {
      await this.handlePersonDetection(event);
    });

    // User corrections
    eventBus.on('user:correction', async (event) => {
      await this.handleUserCorrection(event);
    });

    // Device discovery
    eventBus.on('device:discovered', async (event) => {
      await this.handleDeviceDiscovery(event);
    });

    console.log('[AutomationEngineV2] Event bus listeners configured');
  }

  /**
   * Handle device state change events
   */
  private async handleDeviceStateChange(event: any): Promise<void> {
    console.log(`[AutomationEngineV2] Device state changed: ${event.deviceId}`);

    // Run legacy automations
    await this.runLegacyAutomations({
      type: 'device_state_changed',
      deviceId: event.deviceId,
      oldState: event.oldState,
      newState: event.newState,
      timestamp: event.timestamp,
      source: event.source
    });

    // Check database rules
    await this.checkDatabaseRules({
      type: 'device_state_changed',
      deviceId: event.deviceId,
      eventData: {
        oldState: event.oldState,
        newState: event.newState
      },
      timestamp: event.timestamp
    });
  }

  /**
   * Handle person detection events
   */
  private async handlePersonDetection(event: any): Promise<void> {
    console.log(`[AutomationEngineV2] Person detected: ${event.personId || 'unknown'}`);

    await this.runLegacyAutomations({
      type: 'person_detected',
      cameraId: event.cameraId,
      personId: event.personId,
      confidence: event.confidence,
      timestamp: event.timestamp,
      location: event.location
    });

    await this.checkDatabaseRules({
      type: 'person_detected',
      deviceId: event.cameraId,
      eventData: {
        personId: event.personId,
        confidence: event.confidence,
        location: event.location
      },
      timestamp: event.timestamp
    });
  }

  /**
   * Handle user correction events
   */
  private async handleUserCorrection(event: any): Promise<void> {
    console.log(`[AutomationEngineV2] User correction for ${event.deviceId}`);

    await this.runLegacyAutomations({
      type: 'user_correction',
      deviceId: event.deviceId,
      action: event.action,
      originalParams: event.originalParams,
      correctedParams: event.correctedParams,
      context: event.context,
      timestamp: event.timestamp
    });
  }

  /**
   * Handle device discovery events
   */
  private async handleDeviceDiscovery(event: any): Promise<void> {
    console.log(`[AutomationEngineV2] Device discovered: ${event.ip} (${event.type})`);

    await this.runLegacyAutomations({
      type: 'device_discovered',
      ip: event.ip,
      name: event.name,
      deviceType: event.type,
      protocol: event.protocol,
      brand: event.brand,
      model: event.model,
      timestamp: event.timestamp
    });
  }

  /**
   * Run legacy automation functions
   */
  private async runLegacyAutomations(event: Record<string, unknown>): Promise<void> {
    const promises = Array.from(this.loadedAutomations.values()).map(async (auto) => {
      try {
        await auto.handler(event);
      } catch (error) {
        console.error(`[AutomationEngineV2] Error running automation ${auto.name}:`, error);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Check and execute database rules based on events
   */
  private async checkDatabaseRules(event: {
    type: string;
    deviceId?: string;
    eventData?: any;
    timestamp: Date;
  }): Promise<void> {
    try {
      const rules = this.getEnabledRules();

      for (const rule of rules) {
        if (await this.evaluateRule(rule, event)) {
          await this.executeRule(rule, event);
        }
      }
    } catch (error) {
      console.error('[AutomationEngineV2] Error checking database rules:', error);
    }
  }

  /**
   * Get all enabled rules from database
   */
  private getEnabledRules(): AutomationRule[] {
    const stmt = this.db.prepare('SELECT * FROM rules WHERE enabled = 1');
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
   * Evaluate if a rule should trigger based on the event
   */
  private async evaluateRule(rule: AutomationRule, event: any): Promise<boolean> {
    // Check trigger match
    if (rule.trigger.type !== event.type) {
      return false;
    }

    if (rule.trigger.device_id && rule.trigger.device_id !== event.deviceId) {
      return false;
    }

    // Check additional conditions if present
    if (rule.condition) {
      return await this.evaluateCondition(rule.condition, event);
    }

    return true;
  }

  /**
   * Evaluate a condition for rule triggering
   */
  private async evaluateCondition(condition: any, event: any): Promise<boolean> {
    switch (condition.type) {
      case 'time':
        // Check time-based conditions
        const now = new Date();
        const timeCondition = condition.value;
        if (timeCondition.hour !== undefined && now.getHours() !== timeCondition.hour) {
          return false;
        }
        if (timeCondition.minute !== undefined && now.getMinutes() !== timeCondition.minute) {
          return false;
        }
        return true;

      case 'state':
        // Check device state conditions
        const stateCondition = condition.value;
        // TODO: Implement device state checking
        return true;

      default:
        return true;
    }
  }

  /**
   * Execute a rule's action
   */
  private async executeRule(rule: AutomationRule, event: any): Promise<void> {
    try {
      console.log(`[AutomationEngineV2] Executing rule: ${rule.name}`);

      // Dispatch the action
      const actionString = rule.action.device_id
        ? `${rule.action.device_id}=${rule.action.command}`
        : rule.action.command;

      await dispatchAction(actionString);

      // Update execution statistics
      this.updateRuleExecutionStats(rule.id!);

    } catch (error) {
      console.error(`[AutomationEngineV2] Error executing rule ${rule.name}:`, error);
    }
  }

  /**
   * Update rule execution statistics
   */
  private updateRuleExecutionStats(ruleId: number): void {
    const stmt = this.db.prepare(`
      UPDATE rules
      SET execution_count = execution_count + 1, last_executed = ?
      WHERE id = ?
    `);
    stmt.run(new Date().toISOString(), ruleId);
  }

  /**
   * Load and schedule cron-based rules
   */
  private async loadScheduledRules(): Promise<void> {
    // This would load rules with time-based triggers
    // For now, this is a placeholder for future implementation
    console.log('[AutomationEngineV2] Scheduled rules loading placeholder');
  }

  async addScheduledRule(rule: ScheduledRule): Promise<void> {
    // Validate cron expression
    if (!cron.validate(rule.cronExpression)) {
      throw new Error(`Invalid cron expression: ${rule.cronExpression}`);
    }

    try {
      const job = cron.schedule(rule.cronExpression, async () => {
        await this.executeScheduledRule(rule);
      });

      if (!rule.enabled) {
        job.destroy();
      }

      this.cronJobs.set(rule.id, job);

      // Save to database if needed
      console.log(`[AutomationEngineV2] Added scheduled rule: ${rule.name}`);
    } catch (error) {
      console.error(`[AutomationEngineV2] Error creating cron job for rule ${rule.name}:`, error);
      throw error;
    }
  }

  /**
   * Execute a scheduled rule
   */
  private async executeScheduledRule(rule: ScheduledRule): Promise<void> {
    try {
      console.log(`[AutomationEngineV2] Executing scheduled rule: ${rule.name}`);

      const actionString = rule.action.device_id
        ? `${rule.action.device_id}=${rule.action.command}`
        : rule.action.command;

      await dispatchAction(actionString);

      // Update execution stats
      rule.executionCount++;
      rule.lastExecuted = new Date();

    } catch (error) {
      console.error(`[AutomationEngineV2] Error executing scheduled rule ${rule.name}:`, error);
    }
  }

  /**
   * Shutdown the automation engine
   */
  async shutdown(): Promise<void> {
    console.log('[AutomationEngineV2] Shutting down...');

    // Stop file watcher
    if (this.watcher) {
      await this.watcher.close();
    }

    // Stop all cron jobs
    for (const job of Array.from(this.cronJobs.values())) {
      job.destroy();
    }
    this.cronJobs.clear();

    console.log('[AutomationEngineV2] Shutdown complete');
  }
}