import fs from 'fs/promises';
import { existsSync, writeFileSync, renameSync } from 'fs';
import path from 'path';

export type DeviceCapability = 
    | 'on_off' 
    | 'brightness' 
    | 'color_temp' 
    | 'rgb' 
    | 'media_control' 
    | 'volume' 
    | 'temperature_sensor' 
    | 'humidity_sensor' 
    | 'motion_sensor'
    | 'contact_sensor'
    | 'lock'
    | 'cover';

export interface Device {
    id: string;
    name: string;
    type: string;
    room?: string;
    endpoint: string;
    protocol: string;
    ip: string;
    mac?: string;
    integrationStatus?: 'discovered' | 'ready' | 'error' | 'pairing_required' | 'pending';
    capabilities?: DeviceCapability[];
    secrets?: Record<string, string>;
    config?: Record<string, any>;
    notes?: any;
}

export type DeviceConfig = Device;

const REGISTRY_PATH = path.join(process.cwd(), 'logs/devices.json');

export async function readDevices(): Promise<Device[]> {
    try {
        if (!existsSync(REGISTRY_PATH)) {
            return [];
        }
        const content = await fs.readFile(REGISTRY_PATH, 'utf-8');
        if (!content || content.trim() === '') return [];
        return JSON.parse(content);
    } catch (error) {
        console.error('Error reading devices.json:', error);
        // If it's corrupted, try to move it and return empty
        if (existsSync(REGISTRY_PATH)) {
            const backupPath = `${REGISTRY_PATH}.corrupt.${Date.now()}`;
            try {
                renameSync(REGISTRY_PATH, backupPath);
            } catch (e) {}
        }
        return [];
    }
}

export async function addDevice(device: Device): Promise<void> {
    const devices = await readDevices();
    const existingIndex = devices.findIndex(d => 
        (d.mac && device.mac && d.mac === device.mac) || 
        (d.ip === device.ip && d.id === device.id)
    );

    if (existingIndex >= 0) {
        devices[existingIndex] = { ...devices[existingIndex], ...device };
    } else {
        devices.push(device);
    }

    // Atomic write to avoid corruption
    const tempPath = `${REGISTRY_PATH}.tmp`;
    const data = JSON.stringify(devices, null, 2);
    
    try {
        await fs.writeFile(tempPath, data);
        await fs.rename(tempPath, REGISTRY_PATH);
    } catch (error) {
        console.error('Failed to write devices.json safely:', error);
        // Fallback to sync write if rename fails (e.g. cross-device)
        await fs.writeFile(REGISTRY_PATH, data);
    }
}

export async function updateDevice(id: string, updates: Partial<Device>): Promise<void> {
    const devices = await readDevices();
    const index = devices.findIndex(d => d.id === id);
    if (index >= 0) {
        devices[index] = { ...devices[index], ...updates };
        const tempPath = `${REGISTRY_PATH}.tmp`;
        const data = JSON.stringify(devices, null, 2);
        try {
            await fs.writeFile(tempPath, data);
            await fs.rename(tempPath, REGISTRY_PATH);
        } catch (error) {
            await fs.writeFile(REGISTRY_PATH, data);
        }
    }
}

export async function deleteDevice(id: string): Promise<void> {
    const devices = await readDevices();
    const filtered = devices.filter(d => d.id !== id);
    if (filtered.length !== devices.length) {
        const tempPath = `${REGISTRY_PATH}.tmp`;
        const data = JSON.stringify(filtered, null, 2);
        try {
            await fs.writeFile(tempPath, data);
            await fs.rename(tempPath, REGISTRY_PATH);
        } catch (error) {
            await fs.writeFile(REGISTRY_PATH, data);
        }
    }
}
