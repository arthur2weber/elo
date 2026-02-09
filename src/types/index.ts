export interface Workflow {
    id: string;
    name: string;
    nodes: Node[];
    connections: Record<string, string[]>;
}

export interface Node {
    id: string;
    type: string;
    parameters: Record<string, any>;
    position: [number, number];
}

export interface Integration {
    id: string;
    name: string;
    version: string;
    description: string;
}

export interface ApiResponse<T> {
    success: boolean;
    data: T;
    message?: string;
}