import { getLocalDb } from '../../server/database';

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
    // Camera-specific fields
    brand?: string;
    model?: string;
    username?: string;
    password?: string;
}

export type DeviceConfig = Device;

const getDb = () => getLocalDb();

const dbAll = async (db: any, query: string, params: any[] = []): Promise<any[]> => {
    return db.prepare(query).all(...params);
};

const dbRun = async (db: any, query: string, params: any[] = []): Promise<any> => {
    return db.prepare(query).run(...params);
};

export async function readDevices(): Promise<Device[]> {
    const db = getDb();
    const rows = await dbAll(db, 'SELECT * FROM devices');
    return rows.map((row: any) => ({
        ...row,
        secrets: JSON.parse(row.secrets || '{}'),
        config: JSON.parse(row.config || '{}'),
        capabilities: row.capabilities ? JSON.parse(row.capabilities) : undefined
    }));
}

export async function addDevice(device: Device): Promise<void> {
    const db = getDb();
    await dbRun(db, `
        INSERT OR REPLACE INTO devices (id, name, type, ip, mac, protocol, endpoint, secrets, config, notes, brand, model, username, password, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
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
        device.brand,
        device.model,
        device.username,
        device.password,
        new Date().toISOString()
    ]);
}

export async function updateDevice(id: string, updates: Partial<Device>): Promise<void> {
    const db = getDb();
    const setParts: string[] = [];
    const values: any[] = [];
    // Use !== undefined to allow setting empty strings and clearing fields
    if (updates.name !== undefined) { setParts.push('name = ?'); values.push(updates.name); }
    if (updates.type !== undefined) { setParts.push('type = ?'); values.push(updates.type); }
    if (updates.ip !== undefined) { setParts.push('ip = ?'); values.push(updates.ip); }
    if (updates.mac !== undefined) { setParts.push('mac = ?'); values.push(updates.mac); }
    if (updates.protocol !== undefined) { setParts.push('protocol = ?'); values.push(updates.protocol); }
    if (updates.endpoint !== undefined) { setParts.push('endpoint = ?'); values.push(updates.endpoint); }
    if (updates.secrets !== undefined) { setParts.push('secrets = ?'); values.push(JSON.stringify(updates.secrets)); }
    if (updates.config !== undefined) { setParts.push('config = ?'); values.push(JSON.stringify(updates.config)); }
    if (updates.notes !== undefined) { setParts.push('notes = ?'); values.push(updates.notes); }
    if (updates.brand !== undefined) { setParts.push('brand = ?'); values.push(updates.brand); }
    if (updates.model !== undefined) { setParts.push('model = ?'); values.push(updates.model); }
    if (updates.username !== undefined) { setParts.push('username = ?'); values.push(updates.username); }
    if (updates.password !== undefined) { setParts.push('password = ?'); values.push(updates.password); }
    setParts.push('updated_at = ?'); values.push(new Date().toISOString());
    values.push(id);

    if (setParts.length <= 1) {
        // Only updated_at, nothing else to update
        return;
    }

    await dbRun(db, `UPDATE devices SET ${setParts.join(', ')} WHERE id = ?`, values);
}

export async function deleteDevice(id: string): Promise<void> {
    const db = getDb();
    await dbRun(db, 'DELETE FROM devices WHERE id = ?', [id]);
}