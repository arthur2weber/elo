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
            'Refactor the following TypeScript automation script based on new requirements or logs.',
            'Return only the full TypeScript code.',
            `Automation Name: ${input.name}.`,
            `Description: ${input.description}`,
            `Preferences: ${input.preferences}`,
            `Current Code: ${input.currentWorkflow}`
        ].join('\n');
    }
};