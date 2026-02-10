import { promises as fs } from 'fs';
import path from 'path';
import { getLogsDir } from './n8n-files';

export type DeviceConfig = {
  id: string;
  name: string;
  type?: string;
  room?: string;
  endpoint?: string;
  pollIntervalMs?: number;
};

const getDevicesPath = () => path.join(getLogsDir(), 'devices.json');

const ensureLogsDir = async () => {
  await fs.mkdir(getLogsDir(), { recursive: true });
};

export const readDevices = async (): Promise<DeviceConfig[]> => {
  await ensureLogsDir();
  const filePath = getDevicesPath();
  try {
    const file = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(file) as DeviceConfig[];
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

export const addDevice = async (device: DeviceConfig) => {
  const devices = await readDevices();
  const existing = devices.find((entry) => entry.id === device.id);
  if (existing) {
    Object.assign(existing, device);
  } else {
    devices.push(device);
  }
  await ensureLogsDir();
  await fs.writeFile(getDevicesPath(), JSON.stringify(devices, null, 2));
  return device;
};
