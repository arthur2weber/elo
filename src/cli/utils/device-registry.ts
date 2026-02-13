import Database from 'better-sqlite3';
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
    capabilities?: (DeviceCapability | string)[];
    secrets?: Record<string, string>;
    config?: Record<string, any>;
    notes?: any;
}

export type DeviceConfig = Device;

const getDbPath = () => path.join(process.cwd(), 'data', 'elo.db');

const getDb = () => new Database(getDbPath());

export async function readDevices(): Promise<Device[]> {
    const db = getDb();
    try {
        const rows = db.prepare('SELECT * FROM devices').all();
        return rows.map((row: any) => ({
            ...row,
            secrets: JSON.parse(row.secrets || '{}'),
            config: JSON.parse(row.config || '{}'),
            capabilities: row.capabilities ? JSON.parse(row.capabilities) : undefined
        }));
    } finally {
        db.close();
    }
}

export async function addDevice(device: Device): Promise<void> {
    const db = getDb();
    try {
        const insert = db.prepare(`
            INSERT OR REPLACE INTO devices (id, name, type, ip, mac, protocol, endpoint, secrets, config, notes, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insert.run(
            device.id,
            device.name,
            device.type,
            device.ip,
            device.mac,
            device.protocol,
            device.endpoint,
            JSON.stringify(device.secrets || {}),
            JSON.stringify(device.config || {}),
            device.notes,
            new Date().toISOString()
        );
    } finally {
        db.close();
    }
}

export async function updateDevice(id: string, updates: Partial<Device>): Promise<void> {
    const db = getDb();
    try {
        const setParts: string[] = [];
        const values: any[] = [];
        if (updates.name) { setParts.push('name = ?'); values.push(updates.name); }
        if (updates.type) { setParts.push('type = ?'); values.push(updates.type); }
        if (updates.ip) { setParts.push('ip = ?'); values.push(updates.ip); }
        if (updates.mac) { setParts.push('mac = ?'); values.push(updates.mac); }
        if (updates.protocol) { setParts.push('protocol = ?'); values.push(updates.protocol); }
        if (updates.endpoint) { setParts.push('endpoint = ?'); values.push(updates.endpoint); }
        if (updates.secrets) { setParts.push('secrets = ?'); values.push(JSON.stringify(updates.secrets)); }
        if (updates.config) { setParts.push('config = ?'); values.push(JSON.stringify(updates.config)); }
        if (updates.notes !== undefined) { setParts.push('notes = ?'); values.push(updates.notes); }
        setParts.push('updated_at = ?'); values.push(new Date().toISOString());
        values.push(id);

        const update = db.prepare(`UPDATE devices SET ${setParts.join(', ')} WHERE id = ?`);
        update.run(...values);
    } finally {
        db.close();
    }
}

export async function deleteDevice(id: string): Promise<void> {
    const db = getDb();
    try {
        const del = db.prepare('DELETE FROM devices WHERE id = ?');
        del.run(id);
    } finally {
        db.close();
    }
}