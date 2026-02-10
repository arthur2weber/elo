import AIAgent from '../../ai/agent';
import { readRecentLogs, readRecentRequests } from '../utils/n8n-files';
import { updateAutomationFile, readAutomationFile } from '../utils/automation-files';
import { getPreferenceSummary } from '../utils/preferences';

type UpdateAutomationOptions = {
  description?: string;
  preferences?: string;
  logLimit?: string;
  ai?: boolean;
};

const parseLogLimit = (value?: string) => {
  if (!value) {
    return 50;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 50 : parsed;
};

export const updateAutomationHandler = async (name: string, options: UpdateAutomationOptions) => {
  try {
    if (!options.ai) {
      console.log('AI flag not set. Use --ai to update automation using Gemini.');
      return;
    }

    const logs = await readRecentLogs(parseLogLimit(options.logLimit));
    const requests = await readRecentRequests(parseLogLimit(options.logLimit));
    const current = await readAutomationFile(name);
    const agent = new AIAgent();
    const preferenceSummary = options.preferences ?? (await getPreferenceSummary());

    const updatedCode = await agent.updateAutomationCode({
      name,
      description: options.description,
      preferences: preferenceSummary,
      logs: [...logs, ...requests],
      currentCode: current.code
    });

    const result = await updateAutomationFile(name, updatedCode);
    console.log(`Automation updated at ${result.filePath}`);
  } catch (error) {
    console.error('Failed to update automation:', (error as Error).message);
  }
};
