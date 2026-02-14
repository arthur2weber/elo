import { describe, it, expect, beforeEach } from 'vitest';
import { readDevices, addDevice, updateDevice, deleteDevice } from '../src/cli/utils/device-registry';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

describe('Device Registry', () => {
  const TEST_DB_PATH = path.join(process.cwd(), 'data', 'elo-test-devices.db');

  const getTestDb = () => new Database(TEST_DB_PATH);

  beforeEach(() => {
    // Set test database path
    process.env.ELO_DB_PATH = TEST_DB_PATH;

    // Clean test database before each test
    try {
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
    } catch (e) {
      // Ignore errors if file doesn't exist or can't be deleted
    }

    // Create fresh database with devices table
    const db = getTestDb();
    try {
      db.exec(`
        CREATE TABLE devices (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT,
          ip TEXT,
          mac TEXT,
          protocol TEXT,
          endpoint TEXT,
          secrets TEXT,
          config TEXT,
          notes TEXT,
          brand TEXT,
          model TEXT,
          username TEXT,
          password TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } finally {
      db.close();
    }
  });

  it('should add and read a device', async () => {
    const testDevice = {
      id: 'test-camera-1',
      name: 'Test Camera',
      type: 'camera',
      ip: '192.168.1.100',
      mac: 'AA:BB:CC:DD:EE:FF',
      protocol: 'http',
      endpoint: '/api/camera',
      brand: 'TestBrand',
      model: 'TestModel'
    };

    await addDevice(testDevice);
    const devices = await readDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject(testDevice);
  });

  it('should update a device', async () => {
    const testDevice = {
      id: 'test-camera-1',
      name: 'Test Camera',
      type: 'camera',
      ip: '192.168.1.100',
      mac: 'AA:BB:CC:DD:EE:FF',
      protocol: 'http',
      endpoint: '/api/camera',
      brand: 'TestBrand',
      model: 'TestModel'
    };

    await addDevice(testDevice);

    const updatedDevice = {
      ...testDevice,
      name: 'Updated Camera',
      ip: '192.168.1.101'
    };

    await updateDevice('test-camera-1', updatedDevice);
    const devices = await readDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0].name).toBe('Updated Camera');
    expect(devices[0].ip).toBe('192.168.1.101');
  });

  it('should delete a device', async () => {
    const testDevice = {
      id: 'test-camera-1',
      name: 'Test Camera',
      type: 'camera',
      ip: '192.168.1.100',
      mac: 'AA:BB:CC:DD:EE:FF',
      protocol: 'http',
      endpoint: '/api/camera',
      brand: 'TestBrand',
      model: 'TestModel'
    };

    await addDevice(testDevice);
    let devices = await readDevices();
    expect(devices).toHaveLength(1);

    await deleteDevice('test-camera-1');
    devices = await readDevices();
    expect(devices).toHaveLength(0);
  });

  it('should handle device with secrets and config', async () => {
    const testDevice = {
      id: 'test-device-1',
      name: 'Test Device',
      type: 'smart_device',
      ip: '192.168.1.100',
      protocol: 'https',
      endpoint: '/api/device',
      brand: 'TestBrand',
      model: 'TestModel',
      secrets: { apiKey: 'secret123' },
      config: { timeout: 5000 }
    };

    await addDevice(testDevice);
    const devices = await readDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0].secrets).toEqual({ apiKey: 'secret123' });
    expect(devices[0].config).toEqual({ timeout: 5000 });
  });
});