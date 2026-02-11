import { prompts } from '../../ai/prompts';
import { runGeminiPrompt } from '../../ai/gemini';
import { appendSuggestion } from '../../cli/utils/suggestions';
import { appendLogEntry } from '../../cli/utils/storage-files';
import { verifyDriverProposal } from './driver-verifier';
import { addDevice } from '../../cli/utils/device-registry';
import { readDevices } from '../../cli/utils/device-registry'; // Import readDevices
import { promises as fs } from 'fs';
import path from 'path';
import axios from 'axios';
import { probeTcpPort } from '../discovery';

interface DiscoveryPayload {
    name?: string;
    type?: string;
    port?: number;
    addresses?: string[];
    txt?: Record<string, unknown>;
    source: string;
    signature?: string;
    ip?: string;
    raw?: string;
    rawHex?: string;
    protocol?: string;
}

const COMMON_PORTS = [80, 8001, 8002, 7678, 9119, 9197, 8060, 52235, 5001, 8080];
const GENERATION_QUEUE = new Set<string>();
const GLOBAL_ATTEMPT_TRACKER = new Map<string, number>();
const MAX_GLOBAL_ATTEMPTS = 10;
const GENERATION_RETRY_DELAY_MS = 60_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const extractLastLines = (value: unknown, lines = 10): string => {
    if (value === undefined || value === null) {
        return '';
    }

    if (typeof value === 'string') {
        const parts = value.split('\n');
        return parts.slice(-lines).join('\n');
    }

    if (value instanceof Error) {
        const stack = value.stack || value.message;
        return extractLastLines(stack, lines);
    }

    try {
        const serialized = JSON.stringify(value, null, 2);
        const parts = serialized.split('\n');
        return parts.slice(-lines).join('\n');
    } catch (serializationError) {
        return String(value);
    }
};

const logCondensedError = (prefix: string, error: unknown) => {
    console.error(prefix, extractLastLines(error));
};

const scanDevicePorts = async (ip: string) => {
    const results: Record<number, string> = {};
    console.log(`[DriverGenerator] Scanning common ports for ${ip}...`);
    
    // 1. Check open ports
    const openPorts: number[] = [];
    for (const port of COMMON_PORTS) {
         if (await probeTcpPort(ip, port, 500)) {
             openPorts.push(port);
         }
    }

    // 2. Grab basic info from open ports (HEAD/GET)
    await Promise.all(openPorts.map(async (port) => {
        try {
            const response = await axios.get(`http://${ip}:${port}/`, { timeout: 1500 });
            results[port] = `Status: ${response.status}. Data Preview: ${JSON.stringify(response.data).slice(0, 200)}`;
        } catch (e: any) {
            results[port] = `Open, but HTTP Request failed: ${e.message}`;
            // Try specific known paths
            try {
                 const apiResp = await axios.get(`http://${ip}:${port}/api/v2/`, { timeout: 1500 });
                 results[port] += ` | /api/v2/ FOUND: ${JSON.stringify(apiResp.data).slice(0, 200)}`;
            } catch (_) {}
            try {
                 const descResp = await axios.get(`http://${ip}:${port}/description.xml`, { timeout: 1500 });
                 results[port] += ` | /description.xml FOUND (len: ${descResp.data.length})`;
            } catch (_) {}
        }
    }));
    
    return results;
};

export const triggerDriverGeneration = async (payload: DiscoveryPayload) => {
    // Unique key to prevent double-generation for the same device instance
    const deviceKey = `${payload.ip || payload.addresses?.[0]}:${payload.port || 'default'}`;
    const trackingKey = payload.ip || payload.addresses?.[0] || 'unknown_device';
    const targetIp = (payload.ip || payload.addresses?.[0])?.trim();
    const sanitizeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'pending_device';
    const fallbackDeviceName = payload.name || payload.signature || targetIp || 'Dispositivo sem identificação';

    const registerPendingDevice = async () => {
        if (!targetIp) {
            return;
        }
        const registered = await addDevice({
            id: sanitizeId(`pending_${targetIp}`),
            name: fallbackDeviceName,
            type: payload.type || payload.signature || 'unknown',
            room: 'unknown',
            protocol: payload.protocol || payload.source || 'unknown',
            ip: targetIp,
            integrationStatus: 'pending'
        });
        if (registered.integrationStatus === 'pending') {
            console.log(`[DriverGenerator] Marked ${targetIp} (${fallbackDeviceName}) as pending integration.`);
        }
    };

    if (GLOBAL_ATTEMPT_TRACKER.get(trackingKey) && (GLOBAL_ATTEMPT_TRACKER.get(trackingKey)! >= MAX_GLOBAL_ATTEMPTS)) {
        console.log(`[DriverGenerator] Skipping generation for ${trackingKey} (Max attempts reached: ${MAX_GLOBAL_ATTEMPTS})`);
        return;
    }
    
    if (GENERATION_QUEUE.has(deviceKey)) {
        return;
    }
    GENERATION_QUEUE.add(deviceKey);
    
    // Increment tracker
    const currentAttempts = GLOBAL_ATTEMPT_TRACKER.get(trackingKey) || 0;
    
    // Check if device is already registered by IP
    try {
        const driversDir = path.join(process.cwd(), 'logs', 'drivers');
        const list = await readDevices();
        const existing = list.find((d) => (d.ip?.trim() ?? '') === (targetIp ?? trackingKey));
        if (existing) {
            if (existing.integrationStatus === 'pending') {
                console.log(`[DriverGenerator] Pending integration acknowledged for ${existing.name || existing.id} (${trackingKey}). Skipping automated generation.`);
                GENERATION_QUEUE.delete(deviceKey);
                return;
            }
            const driverPath = path.join(driversDir, `${existing.id}.json`);
            try {
                // If the driver file exists, we check the metadata to see if we should enhance it
                // But for now, let's respect the "don't recreate" rule and just skip expensive generation
                await fs.access(driverPath);
                console.log(`[DriverGenerator] Skipping full generation for known device ${existing.id} (${trackingKey}). Already exists.`);
                GENERATION_QUEUE.delete(deviceKey);
                return;
            } catch (e) {
                // File missing, proceed with regeneration
            }
        }
    } catch (e) {
        logCondensedError('Error checking existing devices:', e);
    }

    GLOBAL_ATTEMPT_TRACKER.set(trackingKey, currentAttempts + 1);

    let attempt = 0;
    const maxAttempts = 3;
    let lastError: string | undefined = undefined;

    try {
        let extraContext = {};
        
        if (targetIp) {
            extraContext = await scanDevicePorts(targetIp);
        }

        while (attempt < maxAttempts) {
            attempt++;
            if (attempt > 1) {
                console.log(
                    `[DriverGenerator] Waiting ${GENERATION_RETRY_DELAY_MS / 1000}s before retrying ${payload.name || payload.ip}.`
                );
                await wait(GENERATION_RETRY_DELAY_MS);
            }
            console.log(`[DriverGenerator] Analyzing device: ${payload.name || payload.ip} (Attempt ${attempt}/${maxAttempts})`);

            const combinedInfo = { ...payload, scannedPorts: extraContext };
            const rawInfoPretty = JSON.stringify(combinedInfo, null, 2);
            const rawInfoCompact = JSON.stringify(combinedInfo);

            // 1. Ask Gemini to fingerprint and generate configuration
            const rawResponse = await runGeminiPrompt(prompts.generateDriver({
                ip: targetIp || 'unknown',
                port: payload.port || 0,
                protocol: payload.protocol || payload.source,
                rawInfo: rawInfoPretty,
                previousAttemptError: lastError
            }), {
                maxOutputTokens: 8192,
                metadata: {
                    source: 'driver:generate',
                    tags: ['driver', 'automation'],
                    extra: {
                        attempt,
                        hasTargetIp: Boolean(targetIp),
                        protocol: payload.protocol || payload.source || 'unknown',
                        rawInfoChars: rawInfoCompact.length
                    }
                }
            });

            // 2. Parse JSON response
            const cleanJson = rawResponse.replace(/```json\n?|\n?```/g, '').trim();
            const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
            
            if (!jsonMatch) {
                logCondensedError('[DriverGenerator] Invalid JSON Raw Response (No Match):', rawResponse);
                lastError = "Invalid JSON format received from AI.";
                continue;
            }

            let parsed;
            try {
                parsed = JSON.parse(jsonMatch[0]);
            } catch (error: any) {
                logCondensedError('[DriverGenerator] JSON Parse Error:', error);
                lastError = `JSON Parse Error: ${error.message}`;
                continue;
            }

            // 3. Auto-Verification (The "Test" Phase)
            const verification = await verifyDriverProposal(parsed);
            
            const safeDeviceName = (parsed.deviceName || 'unknown_device').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
            const suggestionId = `driver-${Date.now()}`;
            
            if (verification.success) {
                console.log(`[DriverGenerator] Driver verified successfully for ${safeDeviceName}! Saving...`);
                
                // Save directly to drivers folder
                const driversDir = path.join(process.cwd(), 'logs', 'drivers');
                await fs.mkdir(driversDir, { recursive: true });
                const driverPath = path.join(driversDir, `${safeDeviceName}.json`);

                let finalDriver = parsed;

                try {
                    const existingContent = await fs.readFile(driverPath, 'utf-8');
                    const existingDriver = JSON.parse(existingContent);
                    console.log(`[DriverGenerator] Driver already exists for ${safeDeviceName}, merging new actions...`);
                    
                    finalDriver = {
                        ...existingDriver,
                        // Update device metadata if the new one is more detailed? Maybe keep existing.
                        // Let's merge actions.
                        actions: {
                            ...existingDriver.actions,
                            ...parsed.actions
                        }
                    };
                } catch (err: any) {
                    if (err.code !== 'ENOENT') {
                        console.warn(`[DriverGenerator] Failed to read existing driver: ${err.message}`);
                    }
                    // File doesn't exist, use parsed as is
                }

                await fs.writeFile(driverPath, JSON.stringify(finalDriver, null, 2));

                // Register device in the official registry so it appears in the UI
                await addDevice({
                    id: safeDeviceName,
                    name: parsed.deviceName,
                    type: parsed.deviceType || 'generic',
                    room: 'unknown', // User can edit this later in UI
                    endpoint: parsed.actions?.getStatus?.url || '', // Best effort endpoint for monitoring
                    protocol: 'http-generic',
                    ip: targetIp,
                    integrationStatus: 'ready'
                });

                await appendSuggestion({
                    id: suggestionId,
                    timestamp: new Date().toISOString(),
                    actionKey: `install_driver_${safeDeviceName}`,
                    automationName: parsed.deviceName,
                    message: `Configurei e validei automaticamente um driver para ${parsed.deviceName}. Ele já está pronto para uso!`,
                    code: JSON.stringify(parsed, null, 2),
                    status: 'AUTO_APPLIED',
                    requiredApprovals: 0,
                    askAgain: false,
                    rationale: `Driver validado com sucesso via teste de loopback (${verification.logs?.join('; ')}).`,
                    context: JSON.stringify(payload)
                });
                
                return; // Exit successfully
            } else {
                const condensedVerificationError = extractLastLines(verification.error ?? 'Verification failed');
                console.warn(`[DriverGenerator] Verification failed for ${safeDeviceName}: ${condensedVerificationError}`);
                lastError = `Verification Failed: ${condensedVerificationError}. logic: ${verification.logs?.join(';')}`;
                
                // If this was the last attempt, save as PENDING so user can intervene
                if (attempt === maxAttempts) {
                    await registerPendingDevice();
                    await appendSuggestion({
                        id: suggestionId,
                        timestamp: new Date().toISOString(),
                        actionKey: `install_driver_${safeDeviceName}`,
                        automationName: parsed.deviceName,
                        message: `Tentei configurar o dispositivo ${parsed.deviceName} automaticamente 3 vezes, mas não consegui validar a conexão. Preciso de ajuda (chaves de API ou URL correta).`,
                        code: JSON.stringify(parsed, null, 2),
                        status: 'PENDING',
                        requiredApprovals: 1,
                        askAgain: true,
                        rationale: `Falha na autoverificação: ${lastError}`,
                        context: JSON.stringify(payload)
                    });
                }
            }
        }
    } catch (error) {
        await registerPendingDevice();
        logCondensedError(`[DriverGenerator] Failed to generate driver for ${deviceKey}:`, error);
    } finally {
        // Keep in queue for a while to avoid spamming generation attempts if discovery keeps firing
        setTimeout(() => GENERATION_QUEUE.delete(deviceKey), 300000); // 5 minutes cooldown
    }
};
