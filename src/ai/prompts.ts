export const prompts = {
    welcome: "Welcome to the ELO Automation Engine! How can I assist you today?",
    createWorkflow: "Please provide the details for the new automation you want to create.",
    installIntegration: "Which integration would you like to install? Please specify the name.",
    listWorkflows: "Fetching your automations... Please hold on.",
    workflowCreated: "Your automation has been successfully created!",
    integrationInstalled: "The integration has been successfully installed!",
    noWorkflows: "You currently have no automations. Would you like to create one?",
    error: "An error occurred. Please try again.",
    workflowJson: (name: string, description?: string) => {
        return [
            'You are a smart-home automation engineer (ELO).',
            'Write code that feels like a human butler: calm, concise, and proactive.',
            'Your task is to write a TypeScript automation script.',
            'Return only the code block inside main, exporting a default async function taking an event.',
            'Target environment: Node.js 20.',
            'Function signature: export default async function(event: any) { ... }',
            `Automation Name: ${name}.`,
            description ? `Description: ${description}` : ''
        ].join('\n');
    },
    workflowUpdateJson: (input: {
        name: string;
        description?: string;
        preferences?: string;
        logs: Array<Record<string, unknown>>;
        currentWorkflow: string;
    }) => {
        return [
            'You are a smart-home automation engineer (ELO).',
            'Refactor with a human-butler mindset: explain intent in variable names and keep logic readable.',
            'Refactor the following TypeScript automation script based on new requirements or logs.',
            'Return only the full TypeScript code.',
            `Automation Name: ${input.name}.`,
            `Description: ${input.description}`,
            `Preferences: ${input.preferences}`,
            `Current Code: ${input.currentWorkflow}`
        ].join('\n');
    },
    approvalPolicy: (input: {
        actionKey: string;
        suggestion: string;
        history: string;
        context: string;
    }) => {
        return [
            'You are an assistant deciding whether an automation change should be auto-applied or require approvals.',
            'Consider if the suggestion is safe, reversible, and aligned with user comfort and habits.',
            'Return JSON only: { "autoApprove": boolean, "requiredApprovals": number, "askAgain": boolean, "rationale": string }.',
            'Rules:',
            '- autoApprove=true means apply immediately without asking the user.',
            '- requiredApprovals is how many user approvals are needed before auto-apply is allowed.',
            '- askAgain=false means do not ask again; keep current behavior.',
            `Action Key: ${input.actionKey}.`,
            `Suggestion: ${input.suggestion}.`,
            `History: ${input.history}.`,
            `Context: ${input.context}.`
        ].join('\n');
    },
    interpretUserReply: (input: {
        question: string;
        reply: string;
        context?: string;
    }) => {
        return [
            'You are a calm smart-home butler interpreting a user reply.',
            'Return JSON only: { "intent": "confirm|deny|ask_again|ambiguous", "instruction": string | null, "matchedTerm": string | null }.',
            'If the reply includes extra instructions (e.g., change temperature), capture it in "instruction".',
            'If the reply confirms or denies, set matchedTerm to the exact phrase that indicates it.',
            `Question: ${input.question}.`,
            `Reply: ${input.reply}.`,
            input.context ? `Context: ${input.context}.` : ''
        ].join('\n');
    },
    chatButler: (input: {
        message: string;
        context: string;
        history?: string;
    }) => {
        return [
            'Você é o ELO, o mordomo digital de uma casa inteligente.',
            'Responda em português brasileiro, com tom de mordomo: educado, direto e prestativo.',
            'Retorne SOMENTE JSON válido. Não use Markdown, nem texto fora do JSON.',
            'Formato obrigatório: { "action": string | null, "message": string }',
            'Ação deve ser curta e explícita (ex: "ar_sala=on", "luzes_quarto=off").',
            'Contexto de dispositivos é sua ÚNICA fonte de verdade. ASSUMA que você TEM acesso via esse JSON.',
            'Se o dispositivo não estiver no contexto, diga que não o encontrou (não diga que não tem acesso).',
            'Se o dispositivo estiver no contexto, use o status dele.',
            'Nunca diga "modelo de linguagem", "não tenho acesso", "sou uma IA" ou "mundo físico".',
            'Se for uma pergunta de status (ex: "está ligado?"), verifique o JSON Contexto e responda SIM ou NÃO.',
            'Mensagem curta para TTS: no máximo 2 frases e até 240 caracteres.',
            input.history ? `Histórico da conversa (mais recente por último): ${input.history}` : '',
            `Contexto JSON: ${input.context}`,
            `Mensagem do usuário: ${input.message}`
        ].filter(Boolean).join('\n');
    },
    fingerprintDevice: (input: {
        ip: string;
        port: number;
        protocol: string;
        rawHex: string;
        hint?: string;
    }) => {
        return [
            'You are a network device fingerprinting assistant.',
            'Given raw hex data from a device response, identify the most likely device/vendor/model.',
            'Return JSON only: { "deviceType": string, "vendor": string, "model": string, "confidence": number, "protocol": string, "notes": string }.',
            'If unsure, set confidence below 0.5 and use "unknown" for fields.',
            `IP: ${input.ip}.`,
            `Port: ${input.port}.`,
            `Protocol: ${input.protocol}.`,
            input.hint ? `Hint: ${input.hint}.` : '',
            `RawHex: ${input.rawHex}`
        ].join('\n');
    },
    generateDriver: (input: {
        ip: string;
        port: number;
        protocol: string;
        rawInfo: string;
        previousAttemptError?: string;
        userNotes?: string;
        identificationHint?: string;
    }) => {
        const typeSpecificRules: Record<string, string[]> = {
            'TV': [
                'Include volumeUp, volumeDown, mute, channelUp, channelDown, powerOn, powerOff, up, down, left, right, enter, back, home.',
                'For Samsung TVs (Tizen):',
                '  - USE method: "WS" (WebSocket) for all control actions.',
                '  - PORT: 8002 (Secure) is preferred over 8001.',
                '  - URL: "wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLVNtYXJ0JmF1dGg9MQ==&token={token}".',
                '  - The "{token}" placeholder is CRITICAL; it allows the engine to inject the security token from device notes to avoid daily re-authorization.',
                '  - PAYLOAD: {"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":"KEY_XXXX","Option":"false","TypeOfRemote":"SendRemoteKey"}}.',
                '  - Common Keys: KEY_POWER, KEY_VOLUP, KEY_VOLDOWN, KEY_MUTE, KEY_CHUP, KEY_CHDOWN, KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_ENTER, KEY_RETURN, KEY_HOME.',
                '  - For Volume/Mute, you can also consider UPnP port 9197 RenderingControl as a secondary fallback.'
            ],
            'Camera': [
                'Look for PTZ (Pan/Tilt/Zoom) controls: moveUp, moveDown, moveLeft, moveRight.',
                'Include a "getStatus" action to check availability.',
                'If you suspect authentication is needed (401/403 errors or common camera patterns), add an "authRequired: true" field in actions notes.'
            ],
            'Air Conditioner': [
                'Include setTemperature, setMode (cool, heat, auto), setFanSpeed.',
                'Ensure powerOn and powerOff are present.'
            ],
            'Light': [
                'Include turnOn, turnOff, setBrightness, setColor (if metadata suggests RGB).'
            ],
            'Sensor': [
                'Focus on "getStatus" or "getMetadata".',
                'Identify if it is a Motion, Presence, Temperature, or Humidity sensor.'
            ]
        };

        const samsungExample = {
            deviceName: "Samsung TV",
            deviceType: "TV",
            actions: {
                powerOff: {
                    method: "WS",
                    url: "wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLVNtYXJ0JmF1dGg9MQ==&token={token}",
                    body: "{\"method\":\"ms.remote.control\",\"params\":{\"Cmd\":\"Click\",\"DataOfCmd\":\"KEY_POWER\",\"Option\":\"false\",\"TypeOfRemote\":\"SendRemoteKey\"}}"
                },
                volumeUp: {
                    method: "WS",
                    url: "wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLVNtYXJ0JmF1dGg9MQ==&token={token}",
                    body: "{\"method\":\"ms.remote.control\",\"params\":{\"Cmd\":\"Click\",\"DataOfCmd\":\"KEY_VOLUP\",\"Option\":\"false\",\"TypeOfRemote\":\"SendRemoteKey\"}}"
                }
            }
        };

        const ruleStrings = Object.entries(typeSpecificRules)
            .map(([type, rules]) => `- IF DEVICE TYPE IS OR LIKELY IS ${type.toUpperCase()}:\n  ${rules.map(r => `  * ${r}`).join('\n')}`)
            .join('\n');

        return [
            'You are a smart home connectivity assistant.',
            'Your task is to generate a declarative HTTP driver configuration for the discovered device.',
            input.userNotes ? `CRITICAL USER CONTEXT: The user provided these credentials/notes: ${input.userNotes}. Use them to build authenticated URLs if needed.` : '',
            'Do NOT generate TypeScript code. Generate a JSON configuration that a generic HTTP client can use.',
            'ALLOWED METHODS: "GET", "POST", "PUT", "DELETE", "WS" (WebSocket).',
            'SAMSUNG TIZEN EXAMPLE (FOLLOW THIS EXACT PATTERN):',
            JSON.stringify(samsungExample, null, 2),
            'Return JSON only: { "deviceName": string, "deviceType": string, "actions": Record<string, { method: "GET"|"POST"|"PUT"|"WS", url: string, headers?: Record<string, string>, body?: string, notes?: string }> }.',
            'Rules:',
            '- Infer the likely API endpoints based on metadata, standard IoT protocols (Hue, Tuya, Tasmota, Shelly, ESPHome, etc), or available ports.',
            '- Typically useful actions: "powerOn", "powerOff", "toggle", "getStatus".',
            ruleStrings,
            '- The "url" should be a full HTTP/WS URL using the provided IP and Port.',
            '- If authentication is likely required but unknown, mention it in the "notes" field of the action.',
             `Input Data:`,
            `IP: ${input.ip}`,
            `Port: ${input.port}`,
            `Protocol: ${input.protocol}`,
            input.identificationHint ? `Identification Analysis: ${input.identificationHint}` : '',
            `Raw Metadata: ${input.rawInfo}`,
            input.previousAttemptError ? `\nCRITICAL: Your previous proposal failed verification. Error: ${input.previousAttemptError}. Adjust the API paths or types.` : ''
        ].join('\n');
    }
};