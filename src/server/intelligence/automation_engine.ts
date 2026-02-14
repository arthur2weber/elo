import { promises as fs } from 'fs';
import path from 'path';
import { eventBus } from '../event-bus';
import { createRuleFromCorrection, getAllRules, evaluateRuleConditions, recordRuleTrigger, updateRuleConfidence } from './rules-engine';
import { readDevices } from '../../cli/utils/device-registry';
import { dispatchAction } from '../action-dispatcher';
import { getPresenceDetector } from '../people/presence-detector';

export type AutomationFunction = (event: Record<string, unknown>) => Promise<void>;

interface LoadedAutomation {
    name: string;
    handler: AutomationFunction;
}

const AUTOMATIONS_DIR = path.join(process.cwd(), 'automations');
const loadedAutomations: Map<string, LoadedAutomation> = new Map();

export const loadAutomations = async () => {
    try {
        await fs.mkdir(AUTOMATIONS_DIR, { recursive: true });
        const files = await fs.readdir(AUTOMATIONS_DIR);
        
        for (const file of files) {
            // Only load .js files in production (compiled output)
            // .ts files should be compiled first via npm run build
            if (file.endsWith('.js')) {
                const name = file.replace(/\.js$/, '');
                const filePath = path.join(AUTOMATIONS_DIR, file);
                
                // Dynamic import (cache busting might be needed in real prod)
                // For now, we assume simple restart on change or basic dynamic import
                try {
                    const module = await import(filePath);
                    if (typeof module.default === 'function') {
                        loadedAutomations.set(name, {
                            name,
                            handler: module.default
                        });
                        console.log(`[ELO] Loaded automation: ${name}`);
                    }
                } catch (err) {
                    console.error(`[ELO] Failed to load automation ${name}:`, err);
                }
            }
        }

        // Setup event bus listeners for reactive automations
        setupEventBusListeners();
    } catch (error) {
        console.error('[ELO] Automation loader error:', error);
    }
};

const setupEventBusListeners = () => {
    // Listen to device state changes
    eventBus.on('device:state_changed', async (event) => {
        console.log(`[AutomationEngine] Device state changed: ${event.deviceId}`);
        await runAutomations({
            type: 'device_state_changed',
            deviceId: event.deviceId,
            oldState: event.oldState,
            newState: event.newState,
            timestamp: event.timestamp,
            source: event.source
        });
    });

    // Listen to person detection events
    eventBus.on('person:detected', async (event) => {
        console.log(`[AutomationEngine] Person detected: ${event.personId || 'unknown'} (${event.confidence})`);
        await runAutomations({
            type: 'person_detected',
            cameraId: event.cameraId,
            personId: event.personId,
            confidence: event.confidence,
            timestamp: event.timestamp,
            location: event.location
        });
    });

    // Listen to user corrections
    eventBus.on('user:correction', async (event) => {
        console.log(`[AutomationEngine] User correction for ${event.deviceId}`);
        await runAutomations({
            type: 'user_correction',
            deviceId: event.deviceId,
            action: event.action,
            originalParams: event.originalParams,
            correctedParams: event.correctedParams,
            context: event.context,
            timestamp: event.timestamp
        });

        // Create contextual rule from correction
        try {
            const ruleId = await createRuleFromCorrection({
                deviceId: event.deviceId,
                action: event.action,
                originalParams: event.originalParams,
                correctedParams: event.correctedParams,
                context: event.context,
                timestamp: event.timestamp
            });
            console.log(`[AutomationEngine] Created contextual rule: ${ruleId}`);
        } catch (error) {
            console.error('[AutomationEngine] Failed to create rule from correction:', error);
        }
    });

    // Listen to device discovery
    eventBus.on('device:discovered', async (event) => {
        console.log(`[AutomationEngine] Device discovered: ${event.ip} (${event.type})`);
        await runAutomations({
            type: 'device_discovered',
            ip: event.ip,
            name: event.name,
            deviceType: event.type,
            protocol: event.protocol,
            brand: event.brand,
            model: event.model,
            timestamp: event.timestamp
        });
    });

    console.log('[ELO] Event bus listeners configured for automations');
};

export const applyContextualRules = async (deviceId: string, action: string, params: any): Promise<any> => {
    try {
        const rules = await getAllRules();
        const now = new Date();
        const currentContext = {
            time: now.toTimeString().slice(0, 5), // HH:MM
            day: now.getDay(),
            peoplePresent: (() => {
                const detector = getPresenceDetector();
                return detector ? detector.getPresentPeople().map(p => p.personId) : [];
            })(),
            deviceStates: {}, // TODO: get current device states
            metrics: {} // TODO: get current metrics
        };

        // Find applicable rules
        const applicableRules = rules.filter(rule =>
            rule.triggerType === 'event' &&
            rule.triggerConfig.eventType === 'device_action' &&
            rule.triggerConfig.deviceId === deviceId &&
            rule.triggerConfig.action === action &&
            evaluateRuleConditions(rule, currentContext)
        );

        if (applicableRules.length > 0) {
            // Use the rule with highest confidence
            const bestRule = applicableRules.sort((a, b) => b.confidence - a.confidence)[0];

            console.log(`[AutomationEngine] Applying contextual rule: ${bestRule.name} (confidence: ${bestRule.confidence})`);

            // Record rule trigger
            await recordRuleTrigger(bestRule.id);

            // Return the corrected parameters from the rule
            return {
                appliedRule: bestRule.id,
                params: bestRule.actions[0].params,
                originalParams: params
            };
        }
    } catch (error) {
        console.error('[AutomationEngine] Error applying contextual rules:', error);
    }

    return { params }; // Return original params if no rule applies
};

export const runAutomations = async (event: Record<string, unknown>) => {
    const promises = Array.from(loadedAutomations.values()).map(async (auto) => {
        try {
            await auto.handler(event);
        } catch (error) {
            console.error(`[ELO] Error running automation ${auto.name}:`, error);
        }
    });
    
    await Promise.all(promises);
};
