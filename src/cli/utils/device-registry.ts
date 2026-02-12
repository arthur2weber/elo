import { promises as fs } from 'fs';
import path from 'path';
import { getLogsDir } from './storage-files';
import { probeTcpPort } from '../../server/discovery';

export type DeviceConfig = {
  id: string;
  name: string;
  type?: string;
  room?: string;
  endpoint?: string;
  pollIntervalMs?: number;
  protocol?: string;
  ip?: string;
  mac?: string;
  notes?: string;
  integrationStatus?: 'pending' | 'ready' | 'unknown';
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
    const list = Array.isArray(data) ? data : [];
    // Backfill IP from endpoint if missing to ensure deduplication works
    list.forEach(d => {
        if (!d.ip && d.endpoint) {
             const match = d.endpoint.match(/:\/\/([^:/]+)/);
             if (match) d.ip = match[1];
        }
    });
    return list;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

let registryLock = Promise.resolve();

export const addDevice = (device: DeviceConfig) => {
  const result = registryLock.then(() => performAddDevice(device));
  registryLock = result.then(() => {}).catch(() => {});
  return result;
};

const performAddDevice = async (device: DeviceConfig) => {
  const devices = await readDevices();
  
  // 1. Try to find by ID first
  let existing = devices.find((entry) => entry.id === device.id);
  
  // 2. If not found by ID, try to find by MAC (Most reliable hardware ID)
  if (!existing && device.mac) {
    const normalizedMac = device.mac.toLowerCase().replace(/[^a-f0-9]/g, '');
    existing = devices.find((entry) => entry.mac?.toLowerCase()?.replace(/[^a-f0-9]/g, '') === normalizedMac);
    
    if (existing) {
        console.log(`[DeviceRegistry] De-duped device ${device.name} (MAC ${device.mac}) -> Merging into existing ${existing.name}`);
        // Update IP if it changed (DHCP renewal)
        if (device.ip && existing.ip !== device.ip) {
            console.log(`[DeviceRegistry] IP changed for ${existing.id}: ${existing.ip} -> ${device.ip}`);
            existing.ip = device.ip;
        }
    }
  }

  // 3. Strict Grouping by IP (User Preference)
  // Assumption: In a home network, 1 IP = 1 Physical Device.
  // Multiple services (UPnP, HTTP, MDX) on the same IP should be merged into a single device entity.
  // We ONLY do this if we found a match by IP.
  if (!existing && device.ip) {
    const cleanIp = device.ip.trim();
    // Debug logic for IP matching
    // console.log(`[DeviceRegistry] Checking IP match for ${cleanIp} against ${devices.length} devices...`);
    
    existing = devices.find((entry) => entry.ip && entry.ip.trim() === cleanIp);
    if (existing) {
        console.log(`[DeviceRegistry] Grouping by IP ${cleanIp}: Merging '${device.name}' into existing '${existing.name}' [ID: ${existing.id}]`);
    }
  }

  // 4. Stale Device Cleanup (Name Collision with Different IP)
  // If we find a device with the same NAME but different IP, verify the old one.
  if (!existing && device.name && device.ip) {
      const sameName = devices.find(d => d.name === device.name && d.ip !== device.ip);
      if (sameName && sameName.ip && sameName.endpoint) {
          // Check if the old device is reachable on its main port (derive from endpoint)
          // Default port 80 if not specified
          let port = 80;
          const portMatch = sameName.endpoint.match(/:(\d+)/);
          if (portMatch) port = parseInt(portMatch[1]);
          
          // Verify with a short timeout (e.g. 2000ms)
          const isAlive = await probeTcpPort(sameName.ip, port, 2000);
          
          if (!isAlive) {
              console.log(`[DeviceRegistry] Found duplicate name '${device.name}' at old IP ${sameName.ip}. Probe failed (Device Dead). moving to new IP ${device.ip}`);
              existing = sameName;
              existing.ip = device.ip; 
              // Clear endpoint as it's likely invalid now
              if (device.endpoint) existing.endpoint = device.endpoint;
          } else {
             console.log(`[DeviceRegistry] Found duplicate name '${device.name}' at old IP ${sameName.ip}. Probe success (Device Alive). Keeping both as separate entities.`);
          }
      }
  }

  if (existing) {
    // Update existing device
    
    // Name Heuristic: Always prefer specific names over generic ones
    // "Samsung Smart TV" > "UPnP Device"
    // "Chromecast" > "VFY"
    const isGenericName = (s: string) => /unknown|device|generic|upnp|vfy|target|ssdp/i.test(s);
    if (isGenericName(existing.name) && !isGenericName(device.name)) {
        console.log(`[DeviceRegistry] Upgrading name: ${existing.name} -> ${device.name}`);
        existing.name = device.name;
    }

    // Endpoint Heuristic: Prefer Control APIs over Description XMLs
    const isApiEndpoint = (url?: string) => url && (url.includes('/api/') || url.includes(":8001") || url.includes(":8060"));
    const isGenericEndpoint = (url?: string) => url && (url.endsWith('.xml') || url.includes('/upnp/') || url.includes(':9197'));
    
    // If we have a new endpoint that looks like an API (and the old one was generic or missing), take it.
    if (device.endpoint && (!existing.endpoint || (isGenericEndpoint(existing.endpoint) && isApiEndpoint(device.endpoint)))) {
       console.log(`[DeviceRegistry] Upgrading endpoint: ${existing.endpoint} -> ${device.endpoint}`);
       existing.endpoint = device.endpoint;
    } 
    // If we simply lacked an endpoint, take whatever comes
    else if (device.endpoint && !existing.endpoint) {
       existing.endpoint = device.endpoint;
    }
    
    // Merge Types
    if (device.type && (!existing.type || existing.type === 'generic' || existing.type === 'UPnP Device')) {
        existing.type = device.type;
    }

    existing.protocol = device.protocol || existing.protocol;
    existing.mac = device.mac || existing.mac;
    existing.notes = device.notes || existing.notes;

    if (device.integrationStatus) {
      if (device.integrationStatus === 'ready' || !existing.integrationStatus) {
        existing.integrationStatus = device.integrationStatus;
      } else if (existing.integrationStatus !== 'ready') {
        existing.integrationStatus = device.integrationStatus;
      }
    }

    if (device.id && existing.id !== device.id && existing.id?.startsWith('pending_')) {
      existing.id = device.id;
    }
    
  } else {
    devices.push({ ...device });
  }
  
  await ensureLogsDir();
  await fs.writeFile(getDevicesPath(), JSON.stringify(devices, null, 2));
  return existing || device;
};

export const updateDevice = async (id: string, updates: Partial<DeviceConfig>): Promise<DeviceConfig> => {
    const devices = await readDevices();
    const index = devices.findIndex(d => d.id === id);
    if (index === -1) throw new Error(`Device ${id} not found`);
    
    devices[index] = { ...devices[index], ...updates };
    await writeDevices(devices);
    return devices[index];
};

export const deleteDevice = async (id: string): Promise<void> => {
    const devices = await readDevices();
    const filtered = devices.filter(d => d.id !== id);
    await writeDevices(filtered);
};

const writeDevices = async (devices: DeviceConfig[]) => {
  await ensureLogsDir();
  await fs.writeFile(getDevicesPath(), JSON.stringify(devices, null, 2));
};
