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
            'You are generating a valid n8n workflow JSON file.',
            'Return only JSON, no markdown, no explanations.',
            'Ensure fields: name, nodes, connections, active, settings.',
            `Workflow name: ${name}.`,
            details
        ].join('\n');
    }
};