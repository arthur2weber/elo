import { installIntegration } from '../utils/n8n-api';
import { installIntegrationFiles } from '../utils/n8n-files';

type InstallIntegrationOptions = {
  description?: string;
  mode?: 'files' | 'api';
};

const resolveMode = (mode?: string) => {
  const envMode = process.env.N8N_MODE;
  const selected = mode || envMode || 'files';
  return selected === 'api' ? 'api' : 'files';
};

export const installIntegrationHandler = async (name: string, options: InstallIntegrationOptions) => {
  try {
    const mode = resolveMode(options.mode);
    if (mode === 'api') {
      const result = await installIntegration({ name, description: options.description });
      console.log(`Integration ${name} installed via API:`, result);
      return;
    }

    const integration = await installIntegrationFiles(name, options.description);
    console.log(`Integration ${name} created at ${integration.path}`);
  } catch (error) {
    console.error(`Failed to install integration ${name}:`, (error as Error).message);
  }
};