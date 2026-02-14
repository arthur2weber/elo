import { DeviceConfig } from '../../cli/utils/device-registry';

const collectStrings = (value: unknown, output: string[]) => {
  if (typeof value === 'string') {
    output.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((entry) => collectStrings(entry, output));
  } else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((entry) => collectStrings(entry, output));
  }
};

export const validateWorkflowDevices = (workflow: Record<string, unknown>, devices: DeviceConfig[]) => {
  const ids = new Set(devices.map((device) => device.id));
  const strings: string[] = [];
  collectStrings(workflow, strings);

  const unknown = strings.filter((value) => value.startsWith('device:'))
    .map((value) => value.replace('device:', '').trim())
    .filter((value) => value && !ids.has(value));

  if (unknown.length > 0) {
    throw new Error(`Workflow references unknown device ids: ${unknown.join(', ')}`);
  }
};
