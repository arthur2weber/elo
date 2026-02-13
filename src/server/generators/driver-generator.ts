import { prompts } from '../../ai/prompts';
import { runGeminiPrompt } from '../../ai/gemini';
import { appendSuggestion } from '../../cli/utils/suggestions';
import { appendLogEntry } from '../../cli/utils/storage-files';
import { verifyDriverProposal } from './driver-verifier';
import { addDevice } from '../../cli/utils/device-registry';
import { readDevices } from '../../cli/utils/device-registry'; // Import readDevices
import { saveDriver, getDriver } from '../../cli/utils/drivers';
import { DEVICE_TEMPLATES } from './templates';
import { promises as fs } from 'fs';
import path from 'path';
import axios from 'axios';
import { probeTcpPort } from '../discovery';
import { identifyDevice } from './device-identification';
import { DISCOVERY_MAP, PROTOCOL_REFERENCES } from './knowledge-base';

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
    notes?: any;
    forceRegenerate?: boolean;
    mac?: string;
}

const COMMON_PORTS = [80, 8001, 8002, 7678, 9119, 9197, 8060, 52235, 5001, 8080];
const GENERATION_QUEUE = new Set<string>();
const GLOBAL_ATTEMPT_TRACKER = new Map<string, number>();
const MAX_GLOBAL_ATTEMPTS = 3;
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
        await addDevice({
            id: sanitizeId(`pending_${targetIp}`),
            name: fallbackDeviceName,
            type: payload.type || payload.signature || 'unknown',
            room: 'unknown',
            endpoint: '',
            protocol: payload.protocol || payload.source || 'unknown',
            ip: targetIp || '',
            notes: payload.notes,
            integrationStatus: 'pending'
        });
        console.log(`[DriverGenerator] Marked ${targetIp} (${fallbackDeviceName}) as pending integration.`);
    };

    if (GLOBAL_ATTEMPT_TRACKER.get(trackingKey) && (GLOBAL_ATTEMPT_TRACKER.get(trackingKey)! >= MAX_GLOBAL_ATTEMPTS) && !payload.forceRegenerate) {
        console.log(`[DriverGenerator] Skipping generation for ${trackingKey} (Max attempts reached: ${MAX_GLOBAL_ATTEMPTS})`);
        return;
    }
    
    if (GENERATION_QUEUE.has(deviceKey) && !payload.forceRegenerate) {
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
        if (existing && !payload.forceRegenerate) {
            // If pending, we SHOULD attempt generation if the driver file is missing.
            // if (existing.integrationStatus === 'pending') {
            //    console.log(`[DriverGenerator] Pending integration acknowledged for ${existing.name || existing.id} (${trackingKey}). Skipping automated generation.`);
            //    GENERATION_QUEUE.delete(deviceKey);
            //    return;
            // }
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

    if (!payload.forceRegenerate) {
        GLOBAL_ATTEMPT_TRACKER.set(trackingKey, currentAttempts + 1);
    }

    let attempt = 0;
    const maxAttempts = 3;
    let lastError: string | undefined = undefined;

    // Enhance payload with Knowledge Base
    let extraHints = [];
    if (payload.type && DISCOVERY_MAP[payload.type]) {
        extraHints.push(`Known pattern: Potential Home Assistant integration '${DISCOVERY_MAP[payload.type]}'`);
    }
    const signatureMatch = Object.entries(PROTOCOL_REFERENCES).find(([key, ref]) => 
        payload.signature === key || (payload.port && (ref as any).ports?.includes(payload.port))
    );
    if (signatureMatch) {
        extraHints.push(`Protocol Reference: ${signatureMatch[0]} (See ${signatureMatch[1].repo}). Typical pattern: ${signatureMatch[1].patterns}`);
    }

    if (extraHints.length === 0) {
        // Fallback for Samsung Tizen Specific Check
        if (payload.port && [8001, 8002].includes(payload.port)) {
             extraHints.push('DETECTED TIZEN PORT (8001/8002). USE SECURE WEBSOCKET (wss://) on port 8002. Use standard "ms.remote.control" JSON payload.');
        }
    }

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
            
            // Extract MAC from TXT if available and not in payload
            let targetMac = payload.mac;
            if (!targetMac && payload.txt) {
                const possibleKeys = ['deviceid', 'mac', 'address', 'serialNumber', 'uniqueid'];
                for (const key of possibleKeys) {
                    const val = payload.txt[key];
                    if (typeof val === 'string' && (val.includes(':') || val.length === 12)) {
                        targetMac = val;
                        break;
                    }
                }
            }

            // Define critical paths and identifiers
            const devices = await readDevices();
            const existing = devices.find(d => 
                (targetMac && d.mac === targetMac) || 
                (d.ip === targetIp && d.name === payload.name)
            );
            const driversDir = path.join(process.cwd(), 'logs', 'drivers');
            let parsed: any;

            // Analyze device identity based on MAC and Ports
            const txt = payload.txt as Record<string, any> | undefined;
            
            // PRIORITY 0: Look for a "Twin" device (Same Brand/Model already has a driver)
            const manufacturer = txt?.manufacturer || (payload.name?.split(' ')[0]);
            const model = txt?.model || payload.name;

            if (manufacturer && model) {
                const twin = devices.find(d => 
                    d.id !== existing?.id && 
                    (d.config?.model === model || d.name === payload.name) &&
                    d.integrationStatus === 'ready'
                );

                if (twin) {
                    const twinDriverPath = path.join(driversDir, `${twin.id}.json`);
                    try {
                        const content = await fs.readFile(twinDriverPath, 'utf-8');
                        const twinConfig = JSON.parse(content);
                        console.log(`[DriverGenerator] Twin match found! Copying driver from ${twin.id} to ${existing?.id || 'new device'}`);
                        
                        // Adapt IP in the twin config
                        const adaptedActions = JSON.stringify(twinConfig.actions).replace(new RegExp(twin.ip, 'g'), targetIp || '127.0.0.1');
                        
                        parsed = {
                            ...twinConfig,
                            actions: JSON.parse(adaptedActions)
                        };
                    } catch (e) {
                        // Twin has no driver or error reading it, proceed to template/AI
                    }
                }
            }

            let identityResult = identifyDevice(targetIp || '0.0.0.0', payload.port || 0, targetMac, {
                name: payload.name,
                manufacturer: txt?.manufacturer,
                model: txt?.model
            });

            // If no immediate hint, check scanned ports
            if (!identityResult && extraContext) {
                 const ports = Object.keys(extraContext).map(Number);
                 for (const p of ports) {
                     const res = identifyDevice(targetIp || '0.0.0.0', p, targetMac, {
                        name: payload.name,
                        manufacturer: txt?.manufacturer,
                        model: txt?.model
                     });
                     if (res) {
                         identityResult = res;
                         break;
                     }
                 }
            }

            if (identityResult) {
                console.log(`[DriverGenerator] Identification Hint for ${targetIp}: ${identityResult.hint.replace(/\n/g, ' ')}`);
                
                // PRIORITY 1: Template Matching
                if (identityResult.template && DEVICE_TEMPLATES[identityResult.template]) {
                    console.log(`[DriverGenerator] MATCHED TEMPLATE: ${identityResult.template}. Skipping LLM.`);
                    const template = DEVICE_TEMPLATES[identityResult.template];
                    
                    // Personalize template with IP
                    const actionsStr = JSON.stringify(template.actions).replace(/<ip>/g, targetIp || '127.0.0.1');
                    
                    parsed = {
                        deviceName: template.id,
                        deviceType: template.type,
                        capabilities: template.capabilities || [],
                        actions: JSON.parse(actionsStr)
                    };
                }
            }

            // Phase 1: Strategic Identification (Optional AI call if deterministic identification is low confidence)
            let strategyResult: any = null;
            if (!identityResult || identityResult.hint.includes('unknown')) {
                console.log(`[DriverGenerator] Deterministic ID failed for ${targetIp}. Requesting AI Strategy...`);
                const strategyRaw = await runGeminiPrompt(prompts.identifyDeviceStrategy({
                    ip: targetIp || 'unknown',
                    port: payload.port || 0,
                    protocol: payload.protocol || payload.source,
                    rawInfo: rawInfoCompact
                }), { metadata: { source: 'driver:strategy' } });
                
                try {
                    const cleanStrategy = strategyRaw.replace(/```json\n?|\n?```/g, '').trim();
                    strategyResult = JSON.parse(cleanStrategy);
                    console.log(`[DriverGenerator] AI Strategy for ${targetIp}: ${strategyResult.brand} ${strategyResult.model} via ${strategyResult.protocol} (Conf: ${strategyResult.confidence})`);
                } catch (e) {}
            }

            // 1. Ask Gemini IF we didn't match a template
            if (!parsed) {
                const combinedHint = [
                    identityResult?.hint,
                    strategyResult ? `AI Strategy Suggestion: Brand=${strategyResult.brand}, Model=${strategyResult.model}, Protocol=${strategyResult.protocol}, Strategy=${strategyResult.strategy}. Source: ${strategyResult.referenceRepo}` : null,
                    ...extraHints
                ].filter(Boolean).join('\n');

                const rawResponse = await runGeminiPrompt(prompts.generateDriver({
                    ip: targetIp || 'unknown',
                    port: payload.port || 0,
                    protocol: payload.protocol || payload.source,
                    rawInfo: rawInfoPretty,
                    identificationHint: combinedHint || undefined,
                    previousAttemptError: lastError,
                    userNotes: payload.notes ? JSON.stringify(payload.notes) : undefined
                }), {
                    maxOutputTokens: 8192,
                    metadata: {
                        source: 'driver:generate',
                        tags: ['driver', 'automation'],
                        extra: {
                            attempt,
                            hasTargetIp: Boolean(targetIp),
                            protocol: payload.protocol || payload.source || 'unknown',
                            rawInfoChars: rawInfoCompact.length,
                            hasUserNotes: Boolean(payload.notes)
                        }
                    }
                });

                // 2. Parse JSON response
                const cleanJson = rawResponse.replace(/```json\n?|\n?```/g, '').trim();
                const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
                
                if (!jsonMatch) {
                    console.error('[DriverGenerator] Invalid JSON Raw Response (No Match):', rawResponse);
                    lastError = "Invalid JSON format received from AI.";
                    continue;
                }

                try {
                    parsed = JSON.parse(jsonMatch[0]);
                } catch (error: any) {
                    console.error('[DriverGenerator] JSON Parse Error:', error);
                    lastError = `JSON Parse Error: ${error.message}`;
                    continue;
                }
            }

            // 3. Auto-Verification (The "Test" Phase)
            const verification = await verifyDriverProposal(parsed);
            
            const aiProposedName = (parsed.deviceName || 'unknown_device').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
            const suggestionId = `driver-${Date.now()}`;

            // Find existing device to use its ID as filename
            const currentDevices = await readDevices();
            const deviceEntry = currentDevices.find(d => d.ip === targetIp || d.ip === trackingKey);
            const targetId = deviceEntry ? deviceEntry.id : aiProposedName;

            if (verification.success) {
                console.log(`[DriverGenerator] Driver verified successfully for ${targetId}! Saving...`);
                
                const driversDir = path.join(process.cwd(), 'logs', 'drivers');
                await fs.mkdir(driversDir, { recursive: true });
                const driverPath = path.join(driversDir, `${targetId}.json`);

                let finalDriver = parsed;

                try {
                    const existingDriverEntry = await getDriver(targetId);
                    if (existingDriverEntry) {
                        finalDriver = {
                            ...existingDriverEntry.config as any,
                            actions: {
                                ...(existingDriverEntry.config as any).actions,
                                ...parsed.actions
                            }
                        };
                    }
                } catch (err: any) {}

                await saveDriver({
                    id: targetId,
                    device_id: targetId,
                    config: finalDriver,
                    created_at: new Date().toISOString()
                });

                await addDevice({
                    id: targetId,
                    name: parsed.deviceName,
                    type: parsed.deviceType || 'generic',
                    room: 'unknown',
                    endpoint: parsed.actions?.getStatus?.url || '',
                    protocol: 'http-generic',
                    ip: targetIp || '',
                    capabilities: parsed.capabilities || [],
                    notes: payload.notes,
                    integrationStatus: verification.needsPairing ? 'pairing_required' : 'ready'
                });

                await appendSuggestion({
                    id: suggestionId,
                    timestamp: new Date().toISOString(),
                    actionKey: `install_driver_${targetId}`,
                    automationName: parsed.deviceName,
                    message: `Configurei e validei automaticamente um driver para ${parsed.deviceName}. Ele já está pronto para uso!`,
                    code: JSON.stringify(parsed, null, 2),
                    status: 'AUTO_APPLIED',
                    requiredApprovals: 0,
                    askAgain: false,
                    rationale: `Driver validado com sucesso via teste de loopback (${verification.logs?.join('; ')}).`,
                    context: JSON.stringify(payload)
                });
                
                return;
            } else {
                console.warn(`[DriverGenerator] Verification failed for ${targetId}: ${verification.error}`);
                lastError = `Verification Failed: ${verification.error}. logic: ${verification.logs?.join(';')}`;
                
                if (attempt === 3) {
                    await registerPendingDevice();
                }
            }
        }
    } catch (error) {
        await registerPendingDevice();
    } finally {
        GENERATION_QUEUE.delete(deviceKey);
    }
};
