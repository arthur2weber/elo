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

// People and Security Types
export interface Person {
    id: string;
    name: string;
    role: PersonRole;
    faceEmbeddings?: number[][];
    restrictions: PersonRestrictions;
    createdAt: Date;
    updatedAt: Date;
    lastSeen?: Date;
    lastSeenLocation?: string;
}

export type PersonRole = 'admin' | 'adult' | 'child' | 'guest';

export interface PersonRestrictions {
    blockedDevices: string[];
    blockedActions: string[];
    timeLimits: TimeLimit[];
    allowedAreas: string[];
}

export interface TimeLimit {
    start: string; // HH:MM format
    end: string;   // HH:MM format
    days: number[]; // 0-6, Sunday=0
}

export interface FaceDetection {
    personId?: string;
    confidence: number;
    embedding: number[];
    cameraId: string;
    timestamp: Date;
    location?: string;
}

export interface PermissionCheck {
    personId: string;
    deviceId: string;
    action: string;
    context?: {
        time: Date;
        location?: string;
        otherPeople?: string[];
    };
}