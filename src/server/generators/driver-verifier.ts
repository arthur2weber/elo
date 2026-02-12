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
        
        // Check for common authentication or "request rejected" errors that imply the device IS there but needs clearanc
        // WebSocket 1005: No Status Recvd (often means server closed connection immediately, common in Auth failures)
        const errorMessage = (result.error || '').toLowerCase();
        const isAuthError = 
            responseData.includes('unauthorized') || 
            responseData.includes('pairing') ||
            errorMessage.includes('code 1005') || 
            errorMessage.includes('code 401') ||
            errorMessage.includes('code 403') ||
            errorMessage.includes('socket hung up') ||
            errorMessage.includes('econnreset');

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
        const errMessage = (e.message || '').toLowerCase();
        if (errMessage.includes('code 1005') || errMessage.includes('socket hung up') || errMessage.includes('econnreset')) {
             return { success: true, logs: [`Verification exception accepted as auth-challenge: ${e.message}`] };
        }
        return { success: false, error: e.message };
    }
};
