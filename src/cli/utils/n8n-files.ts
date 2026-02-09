import { promises as fs } from 'fs';
import path from 'path';

export type WorkflowFile = {
  id: string;
  name: string;
  filePath: string;
};

const normalizeName = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const getBasePath = () => process.env.N8N_FILES_PATH || process.cwd();

export const getWorkflowsDir = () => path.join(getBasePath(), 'workflows');
export const getIntegrationsDir = () => path.join(getBasePath(), 'integrations');

export const getWorkflowsFromFiles = async (): Promise<WorkflowFile[]> => {
  const workflowsDir = getWorkflowsDir();
  await ensureDir(workflowsDir);
  const entries: string[] = await fs.readdir(workflowsDir);

  const workflows = await Promise.all(entries
    .filter((entry: string) => entry.endsWith('.json'))
    .map(async (entry: string) => {
      const filePath = path.join(workflowsDir, entry);
      const file = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(file) as { id?: string; name?: string };
      return {
        id: data.id ?? entry.replace('.json', ''),
        name: data.name ?? entry.replace('.json', ''),
        filePath
      };
    }));

  return workflows;
};

export const createWorkflowFile = async (name: string, data: Record<string, unknown>) => {
  const workflowsDir = getWorkflowsDir();
  await ensureDir(workflowsDir);

  const safeName = normalizeName(name) || `workflow-${Date.now()}`;
  const id = (data.id as string) || `${safeName}-${Date.now()}`;
  const filePath = path.join(workflowsDir, `${safeName}.json`);
  const payload = {
    id,
    name,
    active: false,
    settings: {},
    nodes: [],
    connections: {},
    ...data
  };

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
  return { id, name: payload.name, filePath };
};

export const installIntegrationFiles = async (name: string, description?: string) => {
  const integrationsDir = getIntegrationsDir();
  await ensureDir(integrationsDir);

  const safeName = normalizeName(name) || `integration-${Date.now()}`;
  const integrationPath = path.join(integrationsDir, safeName);
  await ensureDir(integrationPath);
  await ensureDir(path.join(integrationPath, 'src'));

  const packageJson = {
    name: safeName,
    version: '0.1.0',
    description: description || `Custom n8n integration for ${name}`,
    main: 'dist/index.js',
    scripts: {
      build: 'tsc'
    }
  };

  await fs.writeFile(path.join(integrationPath, 'package.json'), JSON.stringify(packageJson, null, 2));
  await fs.writeFile(
    path.join(integrationPath, 'src', 'index.ts'),
    `// ${name} integration entry point\nexport const node = {};\n`
  );

  return { name: safeName, path: integrationPath };
};
