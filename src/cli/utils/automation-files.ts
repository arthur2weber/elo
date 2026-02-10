import { promises as fs } from 'fs';
import path from 'path';

export type AutomationFile = {
  name: string;
  filePath: string;
  code: string;
};

const normalizeName = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const getBasePath = () => process.env.ELO_FILES_PATH || process.env.N8N_FILES_PATH || process.cwd();
export const getAutomationsDir = () => path.join(getBasePath(), 'automations');

const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const listAutomations = async (): Promise<AutomationFile[]> => {
  const dir = getAutomationsDir();
  await ensureDir(dir);
  const files = await fs.readdir(dir);

  return Promise.all(files
    .filter((file) => file.endsWith('.ts'))
    .map(async (file) => {
      const filePath = path.join(dir, file);
      const code = await fs.readFile(filePath, 'utf-8');
      return {
        name: file.replace('.ts', ''),
        filePath,
        code
      };
    }));
};

export const createAutomationFile = async (name: string, code: string) => {
  const dir = getAutomationsDir();
  await ensureDir(dir);
  const safeName = normalizeName(name) || `automation-${Date.now()}`;
  const filePath = path.join(dir, `${safeName}.ts`);
  await fs.writeFile(filePath, code);
  return { name: safeName, filePath };
};

export const readAutomationFile = async (name: string) => {
  const dir = getAutomationsDir();
  await ensureDir(dir);
  const safeName = normalizeName(name);
  const filePath = path.join(dir, `${safeName}.ts`);
  const code = await fs.readFile(filePath, 'utf-8');
  return { filePath, code };
};

export const updateAutomationFile = async (name: string, code: string) => {
  const dir = getAutomationsDir();
  await ensureDir(dir);
  const safeName = normalizeName(name);
  const filePath = path.join(dir, `${safeName}.ts`);
  await fs.writeFile(filePath, code);
  return { filePath };
};
