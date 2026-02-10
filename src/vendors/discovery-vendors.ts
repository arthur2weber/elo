export type VendorBroadcastProfile = {
  id: string;
  displayName: string;
  ports: number[];
  payload: string | Record<string, unknown>;
  fingerprintHint?: string;
  fingerprintPort?: number;
  typeTag?: string;
};

export type VendorPortSignature = {
  ports: number[];
  tag: string;
  fingerprintHint?: string;
};

export type VendorSsdpMatcher = {
  tag: string;
  headerIncludes: string[];
  stIncludes?: string[];
};

export type VendorBroadcastConfig = {
  enabled?: boolean;
  intervalMs?: number;
  profiles?: VendorBroadcastProfile[];
};

export type VendorSsdpConfig = {
  enabled?: boolean;
  intervalMs?: number;
  matchers?: VendorSsdpMatcher[];
};

export type VendorPluginConfig = {
  vendorBroadcast?: VendorBroadcastConfig;
  ssdp?: VendorSsdpConfig;
  greeBroadcast?: VendorBroadcastConfig;
};

export const vendorEnvKeys = {
  broadcastEnabled: ['ELO_VENDOR_BROADCAST_ENABLED', 'ELO_GREE_BROADCAST_ENABLED'],
  broadcastPorts: ['ELO_VENDOR_BROADCAST_PORTS', 'ELO_GREE_BROADCAST_PORTS'],
  broadcastIntervalMs: ['ELO_VENDOR_BROADCAST_INTERVAL_MS', 'ELO_GREE_BROADCAST_INTERVAL_MS'],
  broadcastPayload: ['ELO_VENDOR_BROADCAST_PAYLOAD', 'ELO_GREE_BROADCAST_PAYLOAD']
};

export const defaultBroadcastProfiles: VendorBroadcastProfile[] = [
  {
    id: 'gree',
    displayName: 'Gree',
    ports: [4387],
    payload: { t: 'scan' },
    fingerprintHint: 'Aircon discovery response (Gree-style payload).',
    fingerprintPort: 4387,
    typeTag: 'hvac'
  }
];

export const defaultPortSignatures: VendorPortSignature[] = [
  {
    ports: [4387],
    tag: 'hvac',
    fingerprintHint: 'HVAC devices often reply on port 4387.'
  },
  {
    ports: [8001, 8002, 1515],
    tag: 'smart_tv',
    fingerprintHint: 'Smart TV devices often use ports 8001/8002.'
  }
];

export const defaultSsdpMatchers: VendorSsdpMatcher[] = [
  {
    tag: 'smart_tv',
    headerIncludes: ['samsung', 'tizen'],
    stIncludes: ['samsung:smarttv']
  }
];

export const resolveVendorBroadcastConfig = (pluginConfig: VendorPluginConfig | null) =>
  pluginConfig?.vendorBroadcast ?? pluginConfig?.greeBroadcast ?? null;

export const resolveSsdpConfig = (pluginConfig: VendorPluginConfig | null) => pluginConfig?.ssdp ?? null;
