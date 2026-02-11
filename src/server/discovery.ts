import os from 'os';
import net from 'net';
import dgram from 'dgram';
import fs from 'fs';
import path from 'path';
import { appendLogEntry } from '../cli/utils/storage-files';
import { runGeminiPrompt } from '../ai/gemini';
import { prompts } from '../ai/prompts';
import { triggerDriverGeneration } from './generators/driver-generator';
import { readDevices } from '../cli/utils/device-registry';
import {
  defaultBroadcastProfiles,
  defaultPortSignatures,
  defaultSsdpMatchers,
  resolveSsdpConfig,
  resolveVendorBroadcastConfig,
  vendorEnvKeys,
  type VendorPluginConfig,
  type VendorPortSignature,
  type VendorBroadcastProfile
} from '../vendors/discovery-vendors';

type BonjourModule = {
  Bonjour: new () => {
    find: (options: { type: string; protocol?: 'tcp' | 'udp' }) => {
      on: (event: 'up' | 'down', handler: (service: any) => void) => void;
      stop: () => void;
    };
    destroy: () => void;
  };
};

type DiscoveryHandle = {
  stop: () => void;
};

type DiscoveryPluginConfig = VendorPluginConfig;

const knownDevices = new Set<string>();

const isIpAlreadyRegistered = async (ip: string): Promise<boolean> => {
  try {
    const devices = await readDevices();
    return devices.some(device => device.ip === ip);
  } catch (error) {
    console.warn('[ELO] Failed to check registered devices:', error);
    return false;
  }
};

const DEFAULT_SCAN_PORTS = [4387, 554, 8899, 8001, 8002, 1515];
const DEFAULT_SCAN_TIMEOUT_MS = 250;
const DEFAULT_SCAN_CONCURRENCY = 64;
const DEFAULT_SCAN_INTERVAL_MS = 300000; // 5 minutos (era 0)
const DEFAULT_VENDOR_BROADCAST_INTERVAL_MS = 600000; // 10 minutos (era 60000)
const DEFAULT_SSDP_INTERVAL_MS = 600000; // 10 minutos (era 60000)
const DEFAULT_FINGERPRINT_MODEL = 'gemini-2.5-flash';
const DEFAULT_FINGERPRINT_TIMEOUT_MS = 1500;
const SSDP_ADDRESS = '239.255.255.250';
const SSDP_PORT = 1900;

const buildDeviceKey = (payload: {
  source: string;
  name?: string;
  address?: string;
  port?: number;
  type?: string;
  ip?: string;
}) => {
  const address = payload.address || payload.ip || 'unknown';
  return `${payload.source}:${payload.name || 'unknown'}:${address}:${payload.port || 'unknown'}:${
    payload.type || 'unknown'
  }`;
};

const logDiscovery = async (payload: {
  name?: string;
  type?: string;
  port?: number;
  addresses?: string[];
  txt?: Record<string, unknown>;
  source: 'mdns' | 'tcp_scan' | 'udp_broadcast' | 'ssdp';
  signature?: string;
  ip?: string;
  raw?: string;
  rawHex?: string;
  protocol?: string;
  tag?: string;
  headers?: Record<string, string>;
}) => {
  await appendLogEntry({
    timestamp: new Date().toISOString(),
    device: 'discovery',
    event: 'device_discovery',
    payload
  });

  // Trigger AI analysis to propose a driver for this new device
  await triggerDriverGeneration(payload);
};

const parsePortList = (value: string | undefined, fallback: number[]) => {
  if (!value) return fallback;
  const ports = value
    .split(',')
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isFinite(entry) && entry > 0 && entry < 65536);
  return ports.length > 0 ? ports : fallback;
};

const parseBoolean = (value: string | undefined, fallback = true) => {
  if (value === undefined) return fallback;
  return value !== 'false' && value !== '0';
};

const parseNumber = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parsePayload = (value: string | Record<string, unknown> | undefined) => {
  if (!value) return Buffer.from('{"t":"scan"}', 'utf8');
  if (typeof value === 'object') {
    return Buffer.from(JSON.stringify(value), 'utf8');
  }
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return Buffer.from(trimmed, 'hex');
  }
  return Buffer.from(trimmed, 'utf8');
};

const loadDiscoveryPluginConfig = (): DiscoveryPluginConfig | null => {
  const explicitPath = process.env.ELO_DISCOVERY_PLUGINS_FILE?.trim();
  const configPath = explicitPath
    ? path.resolve(explicitPath)
    : path.resolve(process.cwd(), 'config', 'discovery.plugins.json');
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf8').trim();
    if (!raw) return null;
    return JSON.parse(raw) as DiscoveryPluginConfig;
  } catch (error) {
    console.warn('[ELO] Failed to parse discovery plugins config:', error);
    return null;
  }
};

const resolveBoolean = (envValue: string | undefined, configValue: boolean | undefined, fallback: boolean) => {
  if (envValue !== undefined) return parseBoolean(envValue, fallback);
  if (typeof configValue === 'boolean') return configValue;
  return fallback;
};

const resolveNumber = (envValue: string | undefined, configValue: number | undefined, fallback: number) => {
  if (envValue) return parseNumber(envValue, fallback);
  if (typeof configValue === 'number' && Number.isFinite(configValue)) return configValue;
  return fallback;
};

const resolvePayload = (
  envValue: string | undefined,
  configValue: string | Record<string, unknown> | undefined
) => {
  if (envValue) return parsePayload(envValue);
  if (!configValue) return parsePayload(undefined);
  return parsePayload(configValue);
};

const pickEnv = (keys: string[]) => keys.map((key) => process.env[key]).find((value) => value !== undefined);

const getPortSignature = (port: number): VendorPortSignature | null =>
  defaultPortSignatures.find((entry) => entry.ports.includes(port)) ?? null;

const buildBroadcastProfiles = (
  config: VendorBroadcastProfile[] | undefined,
  envPorts: string | undefined,
  envPayload: string | undefined
) => {
  const baseProfiles = config && config.length > 0 ? config : defaultBroadcastProfiles;
  if (!envPorts && !envPayload) return baseProfiles;
  return baseProfiles.map((profile, index) => {
    if (index !== 0) return profile;
    return {
      ...profile,
      ports: envPorts ? parsePortList(envPorts, profile.ports) : profile.ports,
      payload: envPayload ? envPayload : profile.payload
    };
  });
};

const parseIPv4 = (value: string) => {
  const parts = value.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
};

const getLocalIPv4 = () => {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const infos of Object.values(interfaces)) {
    if (!infos) continue;
    for (const info of infos) {
      if (info.family === 'IPv4' && !info.internal) {
        addresses.push(info.address);
      }
    }
  }
  return addresses;
};

const getSubnetBases = () => {
  const envSubnet = process.env.ELO_DISCOVERY_SUBNET?.trim();
  if (envSubnet) {
    const withoutCidr = envSubnet.split('/')[0];
    const parts = withoutCidr.split('.');
    if (parts.length === 4) {
      return [parts.slice(0, 3).join('.')];
    }
    if (parts.length === 3) {
      return [parts.join('.')];
    }
  }

  const localIps = getLocalIPv4();
  return Array.from(new Set(localIps.map((ip) => ip.split('.').slice(0, 3).join('.'))));
};

const parseRangeEnv = () => {
  const raw = process.env.ELO_DISCOVERY_RANGE?.trim();
  if (!raw) return null;
  const [startRaw, endRaw] = raw.split('-').map((part) => part.trim());
  if (!startRaw || !endRaw) return null;

  const startParts = parseIPv4(startRaw);
  if (!startParts) return null;
  let endParts = parseIPv4(endRaw);
  if (!endParts) {
    const lastOctet = Number.parseInt(endRaw, 10);
    if (Number.isNaN(lastOctet)) return null;
    endParts = [...startParts.slice(0, 3), lastOctet];
  }
  if (startParts.slice(0, 3).join('.') !== endParts.slice(0, 3).join('.')) {
    return null;
  }

  const start = startParts[3];
  const end = endParts[3];
  return {
    base: startParts.slice(0, 3).join('.'),
    start: Math.min(start, end),
    end: Math.max(start, end)
  };
};

const buildScanTargets = () => {
  const range = parseRangeEnv();
  if (range) {
    return Array.from({ length: range.end - range.start + 1 }, (_, idx) => {
      return `${range.base}.${range.start + idx}`;
    });
  }

  const bases = getSubnetBases();
  if (bases.length === 0) return [];
  return bases.flatMap((base) =>
    Array.from({ length: 254 }, (_, idx) => `${base}.${idx + 1}`)
  );
};

export const probeTcpPort = (ip: string, port: number, timeoutMs: number) =>
  new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (result: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));

    socket.connect(port, ip);
  });

const mapPortSignature = (port: number) => {
  const signature = getPortSignature(port);
  if (signature) return signature.tag;
  if (port === 554 || port === 8899) return 'rtsp';
  return 'unknown';
};

const parseSsdpHeaders = (payload: string) => {
  const lines = payload.split('\r\n');
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    headers[key] = value;
  }
  return headers;
};

const getHeaderText = (headers: Record<string, string>) =>
  Object.values(headers).join(' ').toLowerCase();

const parseJsonResponse = (text: string) => {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const probeTcpResponse = (ip: string, port: number, timeoutMs: number) =>
  new Promise<{ raw?: string; rawHex?: string }>((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    const finish = (raw?: string, rawHex?: string) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve({ raw, rawHex });
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      const payload = `GET /api/v2/ HTTP/1.1\r\nHost: ${ip}\r\nConnection: close\r\n\r\n`;
      socket.write(payload);
    });
    socket.on('data', (data) => {
      const raw = data.toString('utf8');
      finish(raw, data.toString('hex'));
    });
    socket.on('timeout', () => finish(undefined, undefined));
    socket.on('error', () => finish(undefined, undefined));
    socket.connect(port, ip);
  });

const buildFingerprintPrompt = (input: {
  ip: string;
  port: number;
  protocol: string;
  rawHex: string;
  hint?: string;
}) => prompts.fingerprintDevice(input);

const runFingerprinting = async (input: {
  ip: string;
  port: number;
  protocol: string;
  rawHex: string;
  hint?: string;
  model: string;
}) => {
  const prompt = buildFingerprintPrompt(input);
  const response = await runGeminiPrompt(prompt, { model: input.model, thinkingBudget: 0 });
  const parsed = parseJsonResponse(response);
  return parsed || { raw: response };
};

const runLimited = async <T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
) => {
  const executing = new Set<Promise<void>>();
  for (const item of items) {
    const task = worker(item).finally(() => executing.delete(task));
    executing.add(task);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
};

export const startDiscovery = (): DiscoveryHandle => {
  let bonjour: any;
  const browsers: Array<{ stop?: () => void }> = [];
  const intervals: NodeJS.Timeout[] = [];
  const sockets: Array<{ close?: () => void }> = [];
  const fingerprinted = new Set<string>();
  const pluginConfig = loadDiscoveryPluginConfig();

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const module = require('bonjour-service') as BonjourModule;
    bonjour = new module.Bonjour();
  } catch (error) {
    console.warn('[ELO] mDNS discovery disabled: bonjour-service not installed.', error);
  }

  if (bonjour) {
    const mdnsTypes = [
      { type: 'http' },
      { type: 'airplay' },
      { type: 'raop' },
      { type: 'printer' },
  { type: 'media-device' },
      { type: 'services', protocol: 'udp' as const }
    ];

    mdnsTypes.forEach((entry) => {
      const browser = bonjour.find(entry);
      browsers.push(browser);
      browser.on('up', (service: any) => {
        const address = Array.isArray(service.addresses) ? service.addresses[0] : undefined;
        const key = buildDeviceKey({
          source: 'mdns',
          name: service.name,
          address,
          port: service.port,
          type: service.type
        });
        if (knownDevices.has(key)) {
          return;
        }
        knownDevices.add(key);
        logDiscovery({
          name: service.name,
          type: service.type,
          port: service.port,
          addresses: service.addresses,
          txt: service.txt,
          protocol: service.protocol,
          source: 'mdns'
        }).catch((err) => {
          console.error('[ELO] Failed to log discovery:', err);
        });
      });
    });
  }

  const activeScanEnabled = parseBoolean(process.env.ELO_DISCOVERY_ACTIVE_SCAN, true);
  if (activeScanEnabled) {
    const scanPorts = parsePortList(process.env.ELO_DISCOVERY_PORTS, DEFAULT_SCAN_PORTS);
    const scanTimeoutMs = parseNumber(
      process.env.ELO_DISCOVERY_SCAN_TIMEOUT_MS,
      DEFAULT_SCAN_TIMEOUT_MS
    );
    const scanConcurrency = parseNumber(
      process.env.ELO_DISCOVERY_SCAN_CONCURRENCY,
      DEFAULT_SCAN_CONCURRENCY
    );
    const scanIntervalMs = parseNumber(
      process.env.ELO_DISCOVERY_SCAN_INTERVAL_MS,
      DEFAULT_SCAN_INTERVAL_MS
    );

    const fingerprintEnabled = parseBoolean(
      process.env.ELO_FINGERPRINT_AI,
      Boolean(process.env.GEMINI_API_KEY)
    );
    const fingerprintModel = process.env.ELO_FINGERPRINT_MODEL || DEFAULT_FINGERPRINT_MODEL;
    const fingerprintTimeoutMs = parseNumber(
      process.env.ELO_FINGERPRINT_TIMEOUT_MS,
      DEFAULT_FINGERPRINT_TIMEOUT_MS
    );

    const runScan = async () => {
      const targets = buildScanTargets();
      if (targets.length === 0) {
        console.warn('[ELO] Active scan skipped: unable to determine subnet.');
        return;
      }
      await runLimited(targets, scanConcurrency, async (ip) => {
        // Verificar se o IP já está registrado nos dispositivos
        const alreadyRegistered = await isIpAlreadyRegistered(ip);
        if (alreadyRegistered) {
          console.log(`[ELO] Skipping scan for ${ip} - already registered in devices`);
          return;
        }

        for (const port of scanPorts) {
          const open = await probeTcpPort(ip, port, scanTimeoutMs);
          if (!open) continue;
          const portSignature = getPortSignature(port);
          const signature = mapPortSignature(port);
          const key = buildDeviceKey({ source: 'tcp_scan', ip, port, type: signature });
          if (knownDevices.has(key)) {
            continue;
          }
          knownDevices.add(key);
          await logDiscovery({
            source: 'tcp_scan',
            ip,
            port,
            name: signature === 'unknown' ? undefined : signature.toUpperCase(),
            type: signature,
            signature
          });

          if (fingerprintEnabled && portSignature?.fingerprintHint) {
            const fingerprintKey = `${ip}:${port}`;
            if (fingerprinted.has(fingerprintKey)) continue;
            fingerprinted.add(fingerprintKey);
            const response = await probeTcpResponse(ip, port, fingerprintTimeoutMs);
            if (response.rawHex) {
              try {
                const analysis = await runFingerprinting({
                  ip,
                  port,
                  protocol: 'tcp',
                  rawHex: response.rawHex,
                  hint: portSignature.fingerprintHint,
                  model: fingerprintModel
                });
                await appendLogEntry({
                  timestamp: new Date().toISOString(),
                  device: 'discovery',
                  event: 'device_fingerprint',
                  payload: {
                    source: 'tcp_scan',
                    ip,
                    port,
                    rawHex: response.rawHex,
                    analysis
                  }
                });
              } catch (error) {
                console.error('[ELO] Fingerprint analysis failed:', error);
              }
            }
          }
        }
      });
    };

    runScan().catch((error) => {
      console.error('[ELO] Active scan failed:', error);
    });

    if (scanIntervalMs > 0) {
      intervals.push(
        setInterval(() => {
          runScan().catch((error) => {
            console.error('[ELO] Active scan failed:', error);
          });
        }, scanIntervalMs)
      );
    }
  }

  const vendorBroadcastConfig = resolveVendorBroadcastConfig(pluginConfig);
  const vendorBroadcastEnabled = resolveBoolean(
    pickEnv(vendorEnvKeys.broadcastEnabled),
    vendorBroadcastConfig?.enabled,
    true
  );
  if (vendorBroadcastEnabled) {
    const broadcastIntervalMs = resolveNumber(
      pickEnv(vendorEnvKeys.broadcastIntervalMs),
      vendorBroadcastConfig?.intervalMs,
      DEFAULT_VENDOR_BROADCAST_INTERVAL_MS
    );
    const broadcastProfiles = buildBroadcastProfiles(
      vendorBroadcastConfig?.profiles,
      pickEnv(vendorEnvKeys.broadcastPorts),
      pickEnv(vendorEnvKeys.broadcastPayload)
    );

    const socket = dgram.createSocket('udp4');
    sockets.push(socket);
    socket.on('error', (error) => {
      console.error('[ELO] Vendor broadcast socket error:', error);
    });
    socket.on('message', async (message, rinfo) => {
      // Verificar se o IP já está registrado nos dispositivos
      const alreadyRegistered = await isIpAlreadyRegistered(rinfo.address);
      if (alreadyRegistered) {
        console.log(`[ELO] Skipping vendor broadcast response from ${rinfo.address} - already registered in devices`);
        return;
      }

      const signature = getPortSignature(rinfo.port);
      const typeTag = signature?.tag || 'udp_broadcast';
      const key = buildDeviceKey({
        source: 'udp_broadcast',
        address: rinfo.address,
        port: rinfo.port,
        type: typeTag
      });
      if (knownDevices.has(key)) return;
      knownDevices.add(key);
      const rawHex = message.toString('hex');
      logDiscovery({
        source: 'udp_broadcast',
        name: 'Vendor',
        type: typeTag,
        ip: rinfo.address,
        port: rinfo.port,
        raw: message.toString('utf8'),
        rawHex
      }).catch((error) => {
        console.error('[ELO] Failed to log vendor broadcast response:', error);
      });

      const fingerprintEnabled = parseBoolean(
        process.env.ELO_FINGERPRINT_AI,
        Boolean(process.env.GEMINI_API_KEY)
      );
      const fingerprintModel = process.env.ELO_FINGERPRINT_MODEL || DEFAULT_FINGERPRINT_MODEL;
      if (fingerprintEnabled && rawHex) {
        const fingerprintKey = `${rinfo.address}:${rinfo.port}:udp`;
        if (fingerprinted.has(fingerprintKey)) return;
        fingerprinted.add(fingerprintKey);
        runFingerprinting({
          ip: rinfo.address,
          port: rinfo.port,
          protocol: 'udp',
          rawHex,
          hint: signature?.fingerprintHint,
          model: fingerprintModel
        })
          .then((analysis) =>
            appendLogEntry({
              timestamp: new Date().toISOString(),
              device: 'discovery',
              event: 'device_fingerprint',
              payload: {
                source: 'udp_broadcast',
                ip: rinfo.address,
                port: rinfo.port,
                rawHex,
                analysis
              }
            })
          )
          .catch((error) => {
            console.error('[ELO] Fingerprint analysis failed:', error);
          });
      }
    });

    const sendBroadcast = () => {
      for (const profile of broadcastProfiles) {
        const payload = resolvePayload(undefined, profile.payload);
        for (const port of profile.ports) {
          socket.send(payload, port, '255.255.255.255', (error) => {
            if (error) {
              console.error(`[ELO] Failed to send ${profile.displayName} broadcast:`, error);
            }
          });
        }
      }
    };

    socket.bind(() => {
      socket.setBroadcast(true);
      sendBroadcast();
      if (broadcastIntervalMs > 0) {
        intervals.push(setInterval(sendBroadcast, broadcastIntervalMs));
      }
    });
  }

  const ssdpConfig = resolveSsdpConfig(pluginConfig);
  const ssdpEnabled = resolveBoolean(process.env.ELO_SSDP_ENABLED, ssdpConfig?.enabled, true);
  if (ssdpEnabled) {
    const ssdpIntervalMs = resolveNumber(
      process.env.ELO_SSDP_INTERVAL_MS,
      ssdpConfig?.intervalMs,
      DEFAULT_SSDP_INTERVAL_MS
    );
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sockets.push(socket);

    socket.on('message', async (message, rinfo) => {
      // Verificar se o IP já está registrado nos dispositivos
      const alreadyRegistered = await isIpAlreadyRegistered(rinfo.address);
      if (alreadyRegistered) {
        console.log(`[ELO] Skipping SSDP response from ${rinfo.address} - already registered in devices`);
        return;
      }

      const raw = message.toString('utf8');
      const headers = parseSsdpHeaders(raw);
      const headerText = getHeaderText(headers);
      const stHeader = headers['st']?.toLowerCase() || '';
      const matchers = ssdpConfig?.matchers?.length ? ssdpConfig.matchers : defaultSsdpMatchers;
      const matched = matchers.find((matcher) => {
        const headerHit = matcher.headerIncludes.some((entry) => headerText.includes(entry));
        const stHit = matcher.stIncludes?.some((entry) => stHeader.includes(entry)) ?? false;
        return headerHit || stHit;
      });
      const tag = matched?.tag;
      const key = buildDeviceKey({
        source: 'ssdp',
        address: rinfo.address,
        port: rinfo.port,
        type: tag || 'ssdp'
      });
      if (knownDevices.has(key)) return;
      knownDevices.add(key);
      logDiscovery({
        source: 'ssdp',
        ip: rinfo.address,
        port: rinfo.port,
        type: tag || 'ssdp',
        tag,
        raw,
        headers
      }).catch((error) => {
        console.error('[ELO] Failed to log SSDP response:', error);
      });
    });

    const sendSearch = () => {
      const payload = [
        'M-SEARCH * HTTP/1.1',
        `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}`,
        'MAN: "ssdp:discover"',
        'MX: 2',
        'ST: ssdp:all',
        '',
        ''
      ].join('\r\n');
      socket.send(payload, SSDP_PORT, SSDP_ADDRESS, (error) => {
        if (error) {
          console.error('[ELO] SSDP M-SEARCH failed:', error);
        }
      });
    };

    socket.bind(SSDP_PORT, () => {
      try {
        socket.addMembership(SSDP_ADDRESS);
      } catch (error) {
        console.error('[ELO] SSDP join multicast failed:', error);
      }
      sendSearch();
      if (ssdpIntervalMs > 0) {
        intervals.push(setInterval(sendSearch, ssdpIntervalMs));
      }
    });
  }

  return {
    stop: () => {
      try {
        browsers.forEach((browser) => browser?.stop?.());
        bonjour?.destroy?.();
        intervals.forEach((interval) => clearInterval(interval));
        sockets.forEach((socket) => socket?.close?.());
      } catch (error) {
        console.error('[ELO] Discovery stop failed:', error);
      }
    }
  };
};
