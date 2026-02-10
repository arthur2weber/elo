import axios from 'axios';
import { appendLogEntry } from '../cli/utils/n8n-files';
import { DeviceConfig, readDevices } from '../cli/utils/device-registry';

type MonitorOptions = {
  intervalMs?: number;
  n8nHealthUrl?: string;
};

const DEFAULT_INTERVAL = 1000;

const pollDevice = async (device: DeviceConfig) => {
  if (!device.endpoint) {
    await appendLogEntry({
      timestamp: new Date().toISOString(),
      device: device.id,
      event: 'heartbeat',
      payload: {
        name: device.name,
        type: device.type,
        room: device.room
      }
    });
    return;
  }

  try {
    const response = await axios.get(device.endpoint, { timeout: 2000 });
    await appendLogEntry({
      timestamp: new Date().toISOString(),
      device: device.id,
      event: 'status',
      payload: {
        name: device.name,
        type: device.type,
        room: device.room,
        data: response.data
      }
    });
  } catch (error) {
    await appendLogEntry({
      timestamp: new Date().toISOString(),
      device: device.id,
      event: 'error',
      payload: {
        name: device.name,
        type: device.type,
        room: device.room,
        message: (error as Error).message
      }
    });
  }
};

const pollN8nHealth = async (url: string) => {
  try {
    const response = await axios.get(url, { timeout: 2000 });
    await appendLogEntry({
      timestamp: new Date().toISOString(),
      device: 'n8n',
      event: 'health',
      payload: response.data
    });
  } catch (error) {
    await appendLogEntry({
      timestamp: new Date().toISOString(),
      device: 'n8n',
      event: 'health_error',
      payload: { message: (error as Error).message }
    });
  }
};

export const startDeviceMonitor = (options: MonitorOptions = {}) => {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL;
  const n8nHealthUrl = options.n8nHealthUrl ?? 'http://localhost:5678/healthz';

  const tick = async () => {
    const devices = await readDevices();
    await Promise.all(devices.map((device) => pollDevice(device)));
    await pollN8nHealth(n8nHealthUrl);
  };

  const timer = setInterval(() => {
    tick().catch((error) => {
      console.error('Device monitor tick failed:', error);
    });
  }, intervalMs);

  return () => clearInterval(timer);
};
