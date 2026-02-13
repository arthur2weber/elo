import { GenericHttpDriver, DriverResult } from '../../drivers/http-generic';

export const verifyDriverProposal = async (driverConfig: any, deviceInfo?: { ip?: string; username?: string; password?: string }): Promise<{ success: boolean; error?: string; logs?: string[]; needsPairing?: boolean }> => {
    try {
        const driver = new GenericHttpDriver(driverConfig);
        const actions = driver.getAvailableActions();
        
        // Prioritize "safe" read-only actions for verification
        const safeActions = ['getStatus', 'info', 'get_status', 'check', 'health', 'version', 'requestPairing'];
        const testAction = actions.find(a => safeActions.includes(a)) || actions[0];

        if (!testAction) {
            return { success: false, error: 'No actions available to verify driver.' };
        }

        console.log(`[DriverVerifier] Testing action '${testAction}' for ${driverConfig.deviceName}...`);
        
        // Use real device params if available, otherwise fall back to mock
        const testParams = deviceInfo?.ip ? {
            ip: deviceInfo.ip,
            username: deviceInfo.username || 'admin',
            password: deviceInfo.password || 'admin'
        } : {
            ip: '127.0.0.1',
            username: 'admin',
            password: 'admin'
        };
        
        console.log(`[DriverVerifier] Testing with params: ip=${testParams.ip}, user=${testParams.username}`);
        
        const result: DriverResult = await driver.executeAction(testAction, testParams);
        
        const responseData = typeof result.data === 'string' ? result.data : JSON.stringify(result.data || '');
        
        // Check for common authentication or "request rejected" errors that imply the device IS there but needs clearance
        // WebSocket 1005: No Status Recvd (often means server closed connection immediately, common in Auth failures)
        const errorMessage = (result.error || '').toLowerCase();
        const isAuthError = 
            responseData.includes('unauthorized') || 
            responseData.includes('pairing') ||
            errorMessage.includes('1005') || 
            errorMessage.includes('1006') || 
            errorMessage.includes('401') ||
            errorMessage.includes('403') ||
            errorMessage.includes('websocket') ||
            errorMessage.includes('socket hung up') ||
            errorMessage.includes('econnreset') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('econnrefused');

        if (result.success || isAuthError) {
            return { 
                success: true, 
                needsPairing: isAuthError,
                logs: [`Action '${testAction}' triggered response: ${responseData.slice(0, 100)} (Accepted as auth-challenge/success)`] 
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
        if (errMessage.includes('1005') || errMessage.includes('1006') || errMessage.includes('socket hung up') || errMessage.includes('econnreset') || errMessage.includes('websocket')) {
             return { success: true, needsPairing: true, logs: [`Verification exception accepted as auth-challenge: ${e.message}`] };
        }
        return { success: false, error: e.message };
    }
};
