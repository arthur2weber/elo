import axios from 'axios';
import { appendLogEntry } from '../cli/utils/n8n-files';
import { DeviceConfig, readDevices } from '../cli/utils/device-registry';

type MonitorOptions = {
  intervalMs?: number;
  n8nHealthUrl?: string;
};

const DEFAULT_INTERVAL = 5000;
const lastStates = new Map<string, string>();

const hasStateChanged = (deviceId: string, payload: unknown) => {
  const currentHash = JSON.stringify(payload);
  const previousHash = lastStates.get(deviceId);
  if (currentHash !== previousHash) {
    lastStates.set(deviceId, currentHash);
    return true;
  }
  return false;
};

const pollDevice = async (device: DeviceConfig) => {
  if (!device.endpoint) {
    // Heartbeat for non-endpoint devices is skipped unless state tracking is added here too.
    // keeping simplistic for now or only logging on major interval?
    // For now, let's just log heartbeats less frequently or keep as is if critical?
    // Let's rely on standard logic: if endpoint is missing, we might assume manual logs.
    // But to respect I/O filter, we skip constant heartbeats if payload is constant.
    const payload = {
        name: device.name,
        type: device.type,
        room: device.room
    };
    
    if (hasStateChanged(device.id, payload)) {
        await appendLogEntry({
            timestamp: new Date().toISOString(),
            device: device.id,
            event: 'heartbeat',
            payload
        });
    }
    return;
  }

  try {
    const response = await axios.get(device.endpoint, { timeout: 2000 });
    const payload = {
        name: device.name,
        type: device.type,
        room: device.room,
        data: response.data
    };
    
    if (hasStateChanged(device.id, payload)) {
        await appendLogEntry({
            timestamp: new Date().toISOString(),
            device: device.id,
            event: 'status',
            payload
        });
    }
  } catch (error) {
    // Error state is also a state change worth logging if it starts failing
    const message = (error as Error).message;
    if (hasStateChanged(device.id, { error: message })) {
        await appendLogEntry({
            timestamp: new Date().toISOString(),
            device: device.id,
            event: 'error',
            payload: {
                name: device.name,
                type: device.type,
                room: device.room,
                message
            }
        });
    }
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
