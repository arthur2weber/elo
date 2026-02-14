import { getDriver } from '../cli/utils/drivers';
import { GenericHttpDriver, DriverResult } from '../drivers/http-generic';
import { readDevices, addDevice, Device } from '../cli/utils/device-registry';
import { appendLogEntry } from '../cli/utils/storage-files';
import { promises as fs } from 'fs';
import path from 'path';
import { applyContextualRules } from './intelligence/automation_engine';
import { updateRuleConfidence } from './intelligence/rules-engine';
import { checkPermission } from './people/permission-middleware';
import { consultContextualRules } from './intelligence/decision-loop';
import { getPresenceDetector } from './people/presence-detector';

/**
 * Parses and executes a rigorous action string like "device_name_normalized=action_name".
 * It looks for a matching driver config in `logs/drivers/`.
 */
export const dispatchAction = async (actionString: string, personId?: string) => {
  const [device, command] = actionString.split('=').map((s) => s.trim());

  if (!device || !command) {
    console.warn(`[ActionDispatcher] Invalid action format: ${actionString}`);
    return { success: false, error: 'invalid_format' };
  }

  console.log(`[ActionDispatcher] Dispatching '${command}' to '${device}'${personId ? ` for person ${personId}` : ''}`);

  // Check permissions if personId is provided
  if (personId) {
    const permissionResult = await checkPermission({
      personId,
      deviceId: device,
      action: command
    });

    if (!permissionResult.allowed) {
      console.warn(`[ActionDispatcher] Permission denied: ${permissionResult.reason}`);

      await appendLogEntry({
        timestamp: new Date().toISOString(),
        device,
        event: 'action_blocked',
        payload: {
          command,
          personId,
          reason: permissionResult.reason
        }
      });

      return {
        success: false,
        error: 'permission_denied',
        reason: permissionResult.reason
      };
    }

    console.log(`[ActionDispatcher] Permission granted for ${personId}`);
  }

  try {
    const driverEntry = await getDriver(device);
    
    let driverConfig;
    if (driverEntry) {
        driverConfig = driverEntry.config;
    } else {
        console.warn(`[ActionDispatcher] No driver found for ${device} in database`);
        
         await appendLogEntry({
            timestamp: new Date().toISOString(),
            device,
            event: 'action_dispatched_failed',
            payload: { command, error: 'Driver not found' }
        });
        return { success: false, error: 'driver_not_found' };
    }

    const driver = new GenericHttpDriver(driverConfig as any);
    
    // Load device parameters (notes, config, secrets)
    let params: Record<string, any> = {};
    const devices = await readDevices();
    const deviceData = devices.find((d: Device) => d.id === device);

    if (!deviceData) {
        console.warn(`[ActionDispatcher] Device '${device}' not found in registry (readDevices returned ${devices.length} items).`);
    }
    
    if (deviceData) {
        // Priority: secrets > config > notes
        params = { 
            ...(deviceData.config || {}), 
            ...(deviceData.secrets || {}),
            brand: deviceData.brand,
            model: deviceData.model,
            username: deviceData.username,
            password: deviceData.password,
            ip: deviceData.ip
        };
        console.log(`[ActionDispatcher] Loaded params for ${device}: IP=${params.ip}, User=${params.username}`);
        
        if (deviceData.notes) {
            if (typeof deviceData.notes === 'object') {
                params = { ...params, ...deviceData.notes };
            } else if (typeof deviceData.notes === 'string') {
                params.token = params.token || deviceData.notes;
                params.notes = deviceData.notes;
            }
        }
    }

    // Apply contextual rules before executing action
    const presenceDetector = getPresenceDetector();
    const presentPeople = presenceDetector
      ? presenceDetector.getPresentPeople().map((p: any) => p.personId)
      : [];
    const ruleResult = await consultContextualRules(device, command, params, {
      time: new Date().toTimeString().slice(0, 5),
      day: new Date().getDay(),
      peoplePresent: presentPeople
    });
    const finalParams = ruleResult.modifiedParams || params;

    if (ruleResult.ruleApplied) {
        console.log(`[ActionDispatcher] Applied contextual rule "${ruleResult.ruleApplied.name}", using modified parameters`);
    }

    const result: DriverResult = await driver.executeAction(command, finalParams);

    // Update rule confidence if a rule was applied and action succeeded
    if (ruleResult.ruleApplied && result.success) {
        try {
            await updateRuleConfidence(ruleResult.ruleApplied.id, true);
            console.log(`[ActionDispatcher] Increased confidence for rule ${ruleResult.ruleApplied.id}`);
        } catch (error) {
            console.error('[ActionDispatcher] Failed to update rule confidence:', error);
        }
    }

    // If metadata contains a token, update the device's secrets/notes
    if (result.metadata && result.metadata.token) {
        console.log(`[ActionDispatcher] Capturing new token for ${device}`);
        if (deviceData) {
            await addDevice({
                ...deviceData,
                secrets: {
                    ...(deviceData.secrets || {}),
                    token: result.metadata.token
                },
                integrationStatus: 'ready'
            });
        }
    }

    await appendLogEntry({
        timestamp: new Date().toISOString(),
        device,
        event: 'action_dispatched',
        payload: { 
            command, 
            status: result.success ? 'success' : 'failed',
            result: {
                success: result.success,
                status: result.status,
                error: result.error,
                metadata: result.metadata
            }
        }
    });

    return result;

  } catch (error: any) {
    console.error(`[ActionDispatcher] Critical error dispatching to ${device}:`, error);
    return { success: false, error: error.message };
  }
};
