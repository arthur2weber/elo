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
    }
};