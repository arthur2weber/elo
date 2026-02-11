import { promises as fs } from 'fs';
import path from 'path';

export type ConfigReadOptions = {
  basePath?: string;
  keys?: string[];
};

export type ConfigWriteOptions = {
  basePath?: string;
};

export type ConfigSnapshot = {
  filePath: string;
  values: Record<string, string | undefined>;
};

const resolveEnvPath = (basePath?: string) =>
  path.join(basePath ?? process.cwd(), '.env');

const parseEnv = (raw: string) => {
  const values: Record<string, string> = {};
  raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const index = line.indexOf('=');
      if (index === -1) return;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (key) {
        values[key] = value;
      }
    });
  return values;
};

const serializeEnv = (values: Record<string, string>) =>
  Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

const readEnvFile = async (filePath: string) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return parseEnv(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {} as Record<string, string>;
    }
    throw error;
  }
};

export const readConfig = async (options: ConfigReadOptions = {}): Promise<ConfigSnapshot> => {
  const filePath = resolveEnvPath(options.basePath);
  const values = await readEnvFile(filePath);
  if (options.keys && options.keys.length > 0) {
    const filtered: Record<string, string | undefined> = {};
    options.keys.forEach((key) => {
      filtered[key] = values[key];
    });
    return { filePath, values: filtered };
  }
  return { filePath, values };
};

const sanitizeValue = (value: string) => value.replace(/\n/g, '').trim();

export const writeConfig = async (
  updates: Record<string, string | undefined>,
  options: ConfigWriteOptions = {}
): Promise<ConfigSnapshot> => {
  const filePath = resolveEnvPath(options.basePath);
  const existing = await readEnvFile(filePath);
  const merged: Record<string, string> = { ...existing };

  Object.entries(updates).forEach(([key, value]) => {
    if (typeof value === 'string' && value.trim()) {
      merged[key] = sanitizeValue(value);
    }
  });

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${serializeEnv(merged)}\n`);

  return { filePath, values: merged };
};

export const maskConfigValue = (value: string | undefined) => {
  if (!value) return '';
  if (value.length <= 6) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};
