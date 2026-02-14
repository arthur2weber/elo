import { getKnowledgeDb } from '../../server/database';

export interface DriverEntry {
  id: string;
  device_id: string;
  config: Record<string, unknown>;
  created_at: string;
}

const getDb = () => getKnowledgeDb();

const dbAll = async (db: any, query: string, params: any[] = []): Promise<any[]> => {
  return db.prepare(query).all(...params);
};

const dbGet = async (db: any, query: string, params: any[] = []): Promise<any> => {
  return db.prepare(query).get(...params);
};

const dbRun = async (db: any, query: string, params: any[] = []): Promise<any> => {
  return db.prepare(query).run(...params);
};

export const getDriver = async (deviceId: string): Promise<DriverEntry | null> => {
  const db = getDb();
  const row = await dbGet(db, `
    SELECT id, device_id, config, created_at
    FROM drivers
    WHERE device_id = ?
  `, [deviceId]);
  
  if (!row) return null;
  
  return {
    id: row.id,
    device_id: row.device_id,
    config: JSON.parse(row.config || '{}'),
    created_at: row.created_at
  };
};

export const saveDriver = async (driver: DriverEntry): Promise<void> => {
  const db = getDb();
  await dbRun(db, `
    INSERT OR REPLACE INTO drivers (id, device_id, config, created_at)
    VALUES (?, ?, ?, ?)
  `, [
    driver.id,
    driver.device_id,
    JSON.stringify(driver.config),
    driver.created_at || new Date().toISOString()
  ]);
};

export const getAllDrivers = async (): Promise<DriverEntry[]> => {
  const db = getDb();
  const rows = await dbAll(db, `
    SELECT id, device_id, config, created_at
    FROM drivers
    ORDER BY created_at DESC
  `);
  
  return rows.map((row: any) => ({
    id: row.id,
    device_id: row.device_id,
    config: JSON.parse(row.config || '{}'),
    created_at: row.created_at
  }));
};