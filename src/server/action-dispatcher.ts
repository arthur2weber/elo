import { appendLogEntry } from '../cli/utils/storage-files';
import { GenericHttpDriver, DriverResult } from '../drivers/http-generic';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Parses and executes a rigorous action string like "device_name_normalized=action_name".
 * It looks for a matching driver config in `logs/drivers/`.
 */
export const dispatchAction = async (actionString: string) => {
  const [device, command] = actionString.split('=').map((s) => s.trim());

  if (!device || !command) {
    console.warn(`[ActionDispatcher] Invalid action format: ${actionString}`);
    return { success: false, error: 'invalid_format' };
  }

  console.log(`[ActionDispatcher] Dispatching '${command}' to '${device}'`);

  try {
    const driversDir = path.join(process.cwd(), 'logs', 'drivers');
    // Using simple normalized lookup. Ideally we map alias -> ID.
    const driverPath = path.join(driversDir, `${device}.json`);
    
    let driverConfig;
    try {
        const content = await fs.readFile(driverPath, 'utf-8');
        driverConfig = JSON.parse(content);
    } catch (e) {
        console.warn(`[ActionDispatcher] No driver found for ${device} at ${driverPath}`);
        
         await appendLogEntry({
            timestamp: new Date().toISOString(),
            device,
            event: 'action_dispatched_failed',
            payload: { command, error: 'Driver not found' }
        });
        return { success: false, error: 'driver_not_found' };
    }

    const driver = new GenericHttpDriver(driverConfig);
    
    // Load device notes to use as parameters
    let params: Record<string, any> = {};
    try {
        const devicesPath = path.join(process.cwd(), 'logs', 'devices.json');
        const devicesContent = await fs.readFile(devicesPath, 'utf-8');
        const devices = JSON.parse(devicesContent);
        const deviceData = devices.find((d: any) => d.id === device);
        if (deviceData && deviceData.notes) {
            if (typeof deviceData.notes === 'object') {
                params = { ...deviceData.notes };
            } else if (typeof deviceData.notes === 'string') {
                params = { token: deviceData.notes, notes: deviceData.notes };
            }
        }
    } catch (e) {
        // Ignore errors loading notes
    }

    const result: DriverResult = await driver.executeAction(command, params);

    // If metadata contains a token, update the device's notes/token
    if (result.metadata && result.metadata.token) {
        console.log(`[ActionDispatcher] Capturing new token for ${device}`);
        try {
            const devicesPath = path.join(process.cwd(), 'logs', 'devices.json');
            const devicesContent = await fs.readFile(devicesPath, 'utf-8');
            const devices = JSON.parse(devicesContent);
            const devIdx = devices.findIndex((d: any) => d.id === device);
            if (devIdx !== -1) {
                devices[devIdx].notes = result.metadata.token;
                await fs.writeFile(devicesPath, JSON.stringify(devices, null, 2));
                console.log(`[ActionDispatcher] Token persisted to devices.json`);
            }
        } catch (e) {
            console.error(`[ActionDispatcher] Failed to persist token:`, e);
        }
    }

    await appendLogEntry({
        timestamp: new Date().toISOString(),
        device,
        event: 'action_dispatched',
        payload: {
            command,
            source: 'chat_ui',
            status: result.success ? 'success' : 'failed',
            result
        }
    });

    return result;

  } catch (error: any) {
    console.error('[ActionDispatcher] Unexpected error:', error);
     return { success: false, error: error.message };
  }
};
