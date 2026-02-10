import axios from 'axios';

const N8N_API_BASE_URL = process.env.N8N_API_BASE_URL || 'http://localhost:5678/rest';
const N8N_BASIC_AUTH_USER = process.env.N8N_BASIC_AUTH_USER;
const N8N_BASIC_AUTH_PASSWORD = process.env.N8N_BASIC_AUTH_PASSWORD;

const getAuthConfig = () => {
    if (N8N_BASIC_AUTH_USER && N8N_BASIC_AUTH_PASSWORD) {
        return { auth: { username: N8N_BASIC_AUTH_USER, password: N8N_BASIC_AUTH_PASSWORD } };
    }
    return {};
};

export const getWorkflows = async (): Promise<Array<{ id: string; name: string }>> => {
    try {
    const response = await axios.get(`${N8N_API_BASE_URL}/workflows`, getAuthConfig());
        return response.data;
    } catch (error) {
        throw new Error(`Error fetching workflows: ${(error as Error).message}`);
    }
};

export const createWorkflow = async (workflowData: Record<string, unknown>) => {
    try {
    const response = await axios.post(`${N8N_API_BASE_URL}/workflows`, workflowData, getAuthConfig());
        return response.data;
    } catch (error) {
        throw new Error(`Error creating workflow: ${(error as Error).message}`);
    }
};

export const installIntegration = async (integrationData: Record<string, unknown>) => {
    try {
    const response = await axios.post(`${N8N_API_BASE_URL}/integrations`, integrationData, getAuthConfig());
        return response.data;
    } catch (error) {
        throw new Error(`Error installing integration: ${(error as Error).message}`);
    }
};