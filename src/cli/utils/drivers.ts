import Database from 'better-sqlite3';
import path from 'path';

export interface DriverEntry {
  id: string;
  device_id: string;
  config: Record<string, unknown>;
  created_at: string;
}

const getDbPath = () => path.join(process.cwd(), 'data', 'elo.db');

const getDb = () => new Database(getDbPath());

export const getDriver = async (deviceId: string): Promise<DriverEntry | null> => {
  const db = getDb();
  try {
    const select = db.prepare(`
      SELECT id, device_id, config, created_at
      FROM drivers
      WHERE device_id = ?
    `);
    
    const row = select.get(deviceId) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      device_id: row.device_id,
      config: JSON.parse(row.config || '{}'),
      created_at: row.created_at
    };
  } finally {
    db.close();
  }
};

export const saveDriver = async (driver: DriverEntry): Promise<void> => {
  const db = getDb();
  try {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO drivers (id, device_id, config, created_at)
      VALUES (?, ?, ?, ?)
    `);
    
    insert.run(
      driver.id,
      driver.device_id,
      JSON.stringify(driver.config),
      driver.created_at || new Date().toISOString()
    );
  } finally {
    db.close();
  }
};

export const getAllDrivers = async (): Promise<DriverEntry[]> => {
  const db = getDb();
  try {
    const select = db.prepare(`
      SELECT id, device_id, config, created_at
      FROM drivers
      ORDER BY created_at DESC
    `);
    
    const rows = select.all() as any[];
    return rows.map((row: any) => ({
      id: row.id,
      device_id: row.device_id,
      config: JSON.parse(row.config || '{}'),
      created_at: row.created_at
    }));
  } finally {
    db.close();
  }
};