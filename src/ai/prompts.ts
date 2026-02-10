export const prompts = {
    welcome: "Welcome to the n8n AI Manager! How can I assist you today?",
    createWorkflow: "Please provide the details for the new workflow you want to create.",
    installIntegration: "Which integration would you like to install? Please specify the name.",
    listWorkflows: "Fetching your workflows... Please hold on.",
    workflowCreated: "Your workflow has been successfully created!",
    integrationInstalled: "The integration has been successfully installed!",
    noWorkflows: "You currently have no workflows. Would you like to create one?",
    error: "An error occurred. Please try again.",
    workflowJson: (name: string, description?: string) => {
        const details = description ? `Workflow description: ${description}` : 'No description provided.';
        return [
            'You are a smart-home automation assistant (ELO).',
            'Return only JSON, no markdown, no explanations.',
            'Respond with a JSON object: { workflow: <n8n workflow json>, userMessage?: string }.',
            'Ensure workflow fields: name, nodes, connections, active, settings.',
            `Workflow name: ${name}.`,
            details
        ].join('\n');
    },
    workflowUpdateJson: (input: {
        name: string;
        description?: string;
        preferences?: string;
        logs: Array<Record<string, unknown>>;
        currentWorkflow: Record<string, unknown>;
    }) => {
        const description = input.description ? `Workflow description: ${input.description}` : 'No description provided.';
        const preferences = input.preferences ? `User preferences: ${input.preferences}` : 'No explicit preferences provided.';
        return [
            'You are a smart-home automation assistant (ELO).',
            'Return only JSON, no markdown, no explanations.',
            'Respond with a JSON object: { workflow: <n8n workflow json>, userMessage?: string, decisions?: string[] }.',
            'Ensure workflow fields: name, nodes, connections, active, settings.',
            'Prefer making the workflow adaptive: if a pattern is auto-approve, do not ask again, just notify.',
            'Always consider device status in the context: avoid actions that contradict safety or user intent (e.g., do not turn on AC if window is open unless user explicitly confirms).',
            'Only reference devices by their id from the provided devices list. Do not invent new device names.',
            `Workflow name: ${input.name}.`,
            description,
            preferences,
            `Current workflow JSON: ${JSON.stringify(input.currentWorkflow)}.`,
            `Recent device logs: ${JSON.stringify(input.logs)}.`
        ].join('\n');
    }
};