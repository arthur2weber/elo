import axios from 'axios';

const N8N_API_BASE_URL = process.env.N8N_API_BASE_URL || 'http://localhost:5678/rest';

export const getWorkflows = async (): Promise<Array<{ id: string; name: string }>> => {
    try {
        const response = await axios.get(`${N8N_API_BASE_URL}/workflows`);
        return response.data;
    } catch (error) {
        throw new Error(`Error fetching workflows: ${(error as Error).message}`);
    }
};

export const createWorkflow = async (workflowData: Record<string, unknown>) => {
    try {
        const response = await axios.post(`${N8N_API_BASE_URL}/workflows`, workflowData);
        return response.data;
    } catch (error) {
        throw new Error(`Error creating workflow: ${(error as Error).message}`);
    }
};

export const installIntegration = async (integrationData: Record<string, unknown>) => {
    try {
        const response = await axios.post(`${N8N_API_BASE_URL}/integrations`, integrationData);
        return response.data;
    } catch (error) {
        throw new Error(`Error installing integration: ${(error as Error).message}`);
    }
};