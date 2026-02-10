import { LogEntry, RequestLogEntry } from '../cli/utils/storage-files';
import { DeviceConfig } from '../cli/utils/device-registry';

export type DeviceStatusSnapshot = {
  device: string;
  lastEvent: string;
  timestamp: string;
  payload?: Record<string, unknown>;
};

export type StructuredDecisionContext = {
  devices: DeviceConfig[];
  statusSnapshot: DeviceStatusSnapshot[];
  requests: RequestLogEntry[];
};

export const buildDeviceStatusSnapshot = (logs: LogEntry[]): DeviceStatusSnapshot[] => {
  const latest = new Map<string, DeviceStatusSnapshot>();

  logs.forEach((entry) => {
    const current = latest.get(entry.device);
    if (!current || entry.timestamp >= current.timestamp) {
      latest.set(entry.device, {
        device: entry.device,
        lastEvent: entry.event,
        timestamp: entry.timestamp,
        payload: entry.payload
      });
    }
  });

  return Array.from(latest.values());
};

export const formatDecisionContext = (context: StructuredDecisionContext) => {
  return JSON.stringify(context, null, 2);
};

export const buildDecisionContext = (
  devices: DeviceConfig[],
  statusSnapshot: DeviceStatusSnapshot[],
  requests: RequestLogEntry[]
): StructuredDecisionContext => ({
  devices,
  statusSnapshot,
  requests
});
