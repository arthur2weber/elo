import { GenericHttpDriver, DriverResult } from '../../drivers/http-generic';

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
        
        const result: DriverResult = await driver.executeAction(testAction);
        
        const responseData = typeof result.data === 'string' ? result.data : JSON.stringify(result.data || '');
        const isAuthError = responseData.includes('unauthorized') || responseData.includes('pairing');

        if (result.success || isAuthError) {
            return { 
                success: true, 
                logs: [`Action '${testAction}' triggered response: ${responseData.slice(0, 100)}`] 
            };
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
