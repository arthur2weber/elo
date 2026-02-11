import { GenericHttpDriver } from '../../drivers/http-generic';

export const verifyDriverProposal = async (driverConfig: any): Promise<{ success: boolean; error?: string; logs?: string[] }> => {
    try {
        const driver = new GenericHttpDriver(driverConfig);
        const actions = driver.getAvailableActions();
        
        // Prioritize "safe" read-only actions for verification
        const safeActions = ['getStatus', 'info', 'get_status', 'check', 'health', 'version'];
        const testAction = actions.find(a => safeActions.includes(a)) || actions[0];

        if (!testAction) {
            return { success: false, error: 'No actions available to verify driver.' };
        }

        console.log(`[DriverVerifier] Testing action '${testAction}' for ${driverConfig.deviceName}...`);
        
        const result = await driver.executeAction(testAction);
        
        if (result.success && result.status !== undefined && result.status >= 200 && result.status < 300) {
            return { success: true, logs: [`Action '${testAction}' returned status ${result.status}`] };
        } else {
             return { 
                success: false, 
                error: result.error || `HTTP Status ${result.status}`,
                logs: [`Action '${testAction}' failed: ${result.error || result.status}`]
            };
        }

    } catch (e: any) {
        return { success: false, error: e.message };
    }
};
