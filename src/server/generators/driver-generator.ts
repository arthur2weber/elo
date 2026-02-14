import { prompts } from '../../ai/prompts';
import { runGeminiPrompt, runGeminiChat } from '../../ai/gemini';
import { DRIVER_TOOLS_DECLARATIONS, DRIVER_TOOLS_HANDLERS } from './tools';
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
import { probeTcpPort } from '../discovery/discovery';
import { identifyDevice } from './device-identification';
import { DISCOVERY_MAP, PROTOCOL_REFERENCES } from './knowledge-base';
import { discoveryMetrics } from '../discovery/discovery';

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
    brand?: string;
    model?: string;
    username?: string;
    password?: string;
}

const COMMON_PORTS = [80, 554, 5000, 8001, 8002, 7678, 8899, 9119, 9197, 8060, 52235, 5001, 8080];
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
            // ONVIF probe: if port 5000 or 8899 is open, try SOAP GetDeviceInformation
            if (port === 5000 || port === 8899) {
                try {
                    const onvifResp = await axios.post(`http://${ip}:${port}/onvif/device_service`, 
                        '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/></s:Body></s:Envelope>',
                        { headers: { 'Content-Type': 'application/soap+xml' }, timeout: 3000 }
                    );
                    const onvifData = typeof onvifResp.data === 'string' ? onvifResp.data : JSON.stringify(onvifResp.data);
                    results[port] = `ONVIF device_service FOUND. Response: ${onvifData.slice(0, 300)}`;
                    
                    // Extract manufacturer/model from ONVIF response
                    const mfgMatch = onvifData.match(/Manufacturer>([^<]+)</);
                    const modelMatch = onvifData.match(/Model>([^<]+)</);
                    const fwMatch = onvifData.match(/FirmwareVersion>([^<]+)</);
                    if (mfgMatch) results[port] += ` | ONVIF_MFG: ${mfgMatch[1]}`;
                    if (modelMatch) results[port] += ` | ONVIF_MODEL: ${modelMatch[1]}`;
                    if (fwMatch) results[port] += ` | ONVIF_FW: ${fwMatch[1]}`;
                    results[port] += ' | DETECTED: ONVIF Camera with PTZ support (port ' + port + ')';
                    
                    // Also check if PTZ service is available
                    try {
                        const capResp = await axios.post(`http://${ip}:${port}/onvif/device_service`,
                            '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetCapabilities xmlns="http://www.onvif.org/ver10/device/wsdl"><Category>All</Category></GetCapabilities></s:Body></s:Envelope>',
                            { headers: { 'Content-Type': 'application/soap+xml' }, timeout: 3000 }
                        );
                        const capData = typeof capResp.data === 'string' ? capResp.data : JSON.stringify(capResp.data);
                        if (capData.includes('ptz_service')) {
                            results[port] += ' | ONVIF_PTZ: YES (ptz_service available)';
                        }
                    } catch (_) {}
                    
                    return;
                } catch (_) {}
            }

            const response = await axios.get(`http://${ip}:${port}/`, { timeout: 1500 });
            results[port] = `Status: ${response.status}. Data Preview: ${JSON.stringify(response.data).slice(0, 200)}`;
            
            // Analyze HTTP headers for camera detection
            const serverHeader = response.headers['server'] || response.headers['Server'];
            if (serverHeader) {
                if (serverHeader.toLowerCase().includes('hikvision')) {
                    results[port] += ' | DETECTED: Hikvision Camera';
                } else if (serverHeader.toLowerCase().includes('reolink')) {
                    results[port] += ' | DETECTED: Reolink Camera';
                } else if (serverHeader.toLowerCase().includes('amcrest')) {
                    results[port] += ' | DETECTED: Amcrest Camera';
                } else if (serverHeader.toLowerCase().includes('tplink')) {
                    results[port] += ' | DETECTED: TP-Link Camera';
                }
            }
            
            // Check response content for camera indicators
            const content = JSON.stringify(response.data).toLowerCase();
            if (content.includes('camera') || content.includes('surveillance') || content.includes('ipcam')) {
                results[port] += ' | CONTENT: Camera-related content detected';
            }
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
            integrationStatus: 'pending',
            // Preserve/Apply credentials and metadata if provided in payload
            brand: payload.brand,
            model: payload.model,
            username: payload.username,
            password: payload.password
        });
        console.log(`[DriverGenerator] Marked ${targetIp} (${fallbackDeviceName}) as pending integration.`);
    };

    if (GLOBAL_ATTEMPT_TRACKER.get(trackingKey) && (GLOBAL_ATTEMPT_TRACKER.get(trackingKey)! >= MAX_GLOBAL_ATTEMPTS) && !payload.forceRegenerate) {
        console.log(`[DriverGenerator] Skipping generation for ${trackingKey} (Max attempts reached: ${MAX_GLOBAL_ATTEMPTS})`);
        discoveryMetrics.overloadAlerts++;
        return;
    }
    
    if (GENERATION_QUEUE.has(deviceKey) && !payload.forceRegenerate) {
        discoveryMetrics.overloadAlerts++;
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
        
        if (targetIp && !payload.forceRegenerate) {
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
                manufacturer: payload.brand || txt?.manufacturer,
                model: txt?.model
            });
            
            console.log(`[DriverGenerator] Payload brand: ${payload.brand}`);
            console.log(`[DriverGenerator] Identity result:`, identityResult);

            // If no immediate hint, check scanned ports
            if (!identityResult && extraContext) {
                 const ports = Object.keys(extraContext).map(Number);
                 for (const p of ports) {
                     const res = identifyDevice(targetIp || '0.0.0.0', p, targetMac, {
                        name: payload.name,
                        manufacturer: payload.brand || txt?.manufacturer,
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
                    
                    // Determine device ID for template personalization
                    const currentDevicesList = await readDevices();
                    const existingDevice = currentDevicesList.find(d => d.ip === targetIp);
                    const deviceId = existingDevice?.id || sanitizeId(`pending_${targetIp}`);
                    
                    // Personalize template: replace <ip> (legacy) and {device_id} (go2rtc snapshot)
                    let actionsStr = JSON.stringify(template.actions)
                        .replace(/<ip>/g, targetIp || '127.0.0.1')
                        .replace(/\{device_id\}/g, deviceId);
                    
                    parsed = {
                        deviceName: template.name || template.id,
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

                const initialPrompt = prompts.generateDriver({
                    ip: targetIp || 'unknown',
                    port: payload.port || 0,
                    protocol: payload.protocol || payload.source,
                    rawInfo: rawInfoPretty,
                    identificationHint: combinedHint || undefined,
                    previousAttemptError: lastError,
                    userNotes: payload.notes ? JSON.stringify(payload.notes) : undefined,
                    deviceType: payload.type,
                    username: payload.username,
                    password: payload.password
                });

                console.log(`[DriverGenerator] Starting interactive session for ${targetIp}...`);

                // Initialize chat history with system prompt / user request
                const chatHistory: any[] = [{ role: 'user', parts: [{ text: initialPrompt }] }];
                const MAX_TOOL_TURNS = 5;
                let currentTurn = 0;
                let finalResponseText = '';

                // Loop for tool usage
                while (currentTurn < MAX_TOOL_TURNS) {
                    currentTurn++;
                    console.log(`[DriverGenerator] Turn ${currentTurn}/${MAX_TOOL_TURNS}`);

                    // Create config with tools available
                    const toolsConfig = { 
                        functionDeclarations: DRIVER_TOOLS_DECLARATIONS 
                    };

                    const responseText = await runGeminiChat(chatHistory, {
                        tools: [toolsConfig],
                        maxOutputTokens: 8192,
                        metadata: { 
                            source: 'driver:generate',
                            tags: ['driver', 'automation', 'tool-use']
                        }
                    });

                    // Check if response is a function call (our wrapper returns JSON string for function calls)
                    let functionCallData: any = null;
                    try {
                        const parsedRes = JSON.parse(responseText);
                        if (parsedRes && parsedRes.functionCall) {
                            functionCallData = parsedRes.functionCall;
                        }
                    } catch (e) {
                         // Not JSON, so it's likely text response
                    }

                    if (functionCallData) {
                        const { name, args } = functionCallData;
                        console.log(`[DriverGenerator] AI requesting tool execution: ${name}`, args);
                        
                        // Execute tool
                        const handler = DRIVER_TOOLS_HANDLERS[name];
                        let toolResult = { error: 'Tool not found' };
                        
                        if (handler) {
                            try {
                                toolResult = await handler(args);
                                console.log(`[DriverGenerator] Tool ${name} executed. Result:`, JSON.stringify(toolResult).slice(0, 100));
                            } catch (err: any) {
                                toolResult = { error: err.message };
                            }
                        }

                        // Add assistant's tool call to history
                        chatHistory.push({
                            role: 'model',
                            parts: [{ functionCall: functionCallData }]
                        });

                        // Add tool response to history (in format Gemini expects)
                        chatHistory.push({
                            role: 'function',
                            parts: [{
                                functionResponse: {
                                    name: name,
                                    response: { name: name, content: toolResult }
                                }
                            }]
                        });
                        
                        // Continue loop to let AI process the tool result
                        continue;
                    } else {
                        // It's text response (hopefully the final JSON driver)
                        finalResponseText = responseText;
                        break;
                    }
                }
                
                if (!finalResponseText) {
                     // Fallback if loop ended without text (e.g. too many tool calls)
                     console.warn('[DriverGenerator] Max turns reached without final text response.');
                     // We might want to force a final generation here without tools if needed
                }

                console.log(`[DriverGenerator] Conversation completed for ${targetIp}, final response length: ${finalResponseText.length}`);

                // 2. Parse JSON response matching generic json block
                const cleanJson = finalResponseText.replace(/```json\n?|\n?```/g, '').trim();
                const jsonMatch = cleanJson.match(/\{[\s\S]*\}/); // Flexible match for JSON object
                
                if (!jsonMatch) {
                    console.error('[DriverGenerator] Invalid JSON Raw Response (No Match):', finalResponseText);
                    lastError = "Invalid JSON format received from AI.";
                    continue;
                }

                try {
                    parsed = JSON.parse(jsonMatch[0]);
                } catch (error: any) {
                    console.error('[DriverGenerator] JSON Parse Error:', error.message);
                    lastError = "AI returned invalid JSON: " + error.message;
                    continue;
                }
            }

            // 3. Auto-Verification (The "Test" Phase)
            const deviceInfo = {
                ip: targetIp,
                username: payload.username,
                password: payload.password
            };
            const verification = await verifyDriverProposal(parsed, deviceInfo);
            
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

                // Preserve existing manual data when upgrading to active driver
                const existingForMerge = (await readDevices()).find(d => d.id === targetId);
                const mergedBrand = payload.brand || existingForMerge?.brand;
                const mergedModel = payload.model || existingForMerge?.model;
                const mergedUsername = payload.username || existingForMerge?.username;
                const mergedPassword = payload.password || existingForMerge?.password;

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
                    integrationStatus: verification.needsPairing ? 'pairing_required' : 'ready',
                    brand: mergedBrand,
                    model: mergedModel,
                    username: mergedUsername,
                    password: mergedPassword
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
