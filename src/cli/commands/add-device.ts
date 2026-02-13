import { addDevice, DeviceConfig } from '../utils/device-registry';

type AddDeviceOptions = {
  id?: string;
  name?: string;
  type?: string;
  room?: string;
  endpoint?: string;
  pollIntervalMs?: string;
};

const parseInterval = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const addDeviceHandler = async (options: AddDeviceOptions) => {
  try {
    if (!options.id || !options.name) {
      throw new Error('id and name are required.');
    }

    const device: DeviceConfig = {
      id: options.id,
      name: options.name,
      type: options.type ?? 'unknown',
      room: options.room,
      endpoint: options.endpoint ?? '',
      protocol: 'http',
      ip: '',
      pollIntervalMs: parseInterval(options.pollIntervalMs)
    } as unknown as DeviceConfig;

    await addDevice(device);
    console.log(`Device ${device.id} saved.`);
  } catch (error) {
    console.error('Failed to add device:', (error as Error).message);
  }
};
