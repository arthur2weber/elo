import { appendLogEntry } from '../cli/utils/n8n-files';

type BonjourModule = {
  Bonjour: new () => {
    find: (options: { type: string }) => {
      on: (event: 'up' | 'down', handler: (service: any) => void) => void;
      stop: () => void;
    };
    destroy: () => void;
  };
};

type DiscoveryHandle = {
  stop: () => void;
};

const knownDevices = new Set<string>();

const buildDeviceKey = (service: any) => {
  const address = Array.isArray(service.addresses) ? service.addresses[0] : 'unknown';
  return `${service.name || 'unknown'}:${address}:${service.port || 'unknown'}`;
};

const logDiscovery = async (service: any) => {
  await appendLogEntry({
    timestamp: new Date().toISOString(),
    device: 'discovery',
    event: 'device_discovery',
    payload: {
      name: service.name,
      type: service.type,
      port: service.port,
      addresses: service.addresses,
      txt: service.txt
    }
  });
};

export const startDiscovery = (): DiscoveryHandle => {
  let bonjour: any;
  let browser: any;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require('bonjour-service') as BonjourModule;
    bonjour = new module.Bonjour();
  } catch (error) {
    console.warn('[ELO] Discovery disabled: bonjour-service not installed.');
    return { stop: () => undefined };
  }

  browser = bonjour.find({ type: 'http' });

  browser.on('up', (service: any) => {
    const key = buildDeviceKey(service);
    if (knownDevices.has(key)) {
      return;
    }
    knownDevices.add(key);
    logDiscovery(service).catch((err) => {
      console.error('[ELO] Failed to log discovery:', err);
    });
  });

  return {
    stop: () => {
      try {
        browser?.stop?.();
        bonjour?.destroy?.();
      } catch (error) {
        console.error('[ELO] Discovery stop failed:', error);
      }
    }
  };
};
