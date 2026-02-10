import AIAgent from '../../ai/agent';
import { createAutomationFile } from '../utils/automation-files';

type CreateAutomationOptions = {
  ai?: boolean;
  description?: string;
};

const fallbackTemplate = (name: string) => `export default async function(event: any) {\n  // ${name}\n  console.log('Event received', event);\n}`;

export const createAutomationHandler = async (name: string, options: CreateAutomationOptions) => {
  try {
    let code = fallbackTemplate(name);

    if (options.ai) {
      const agent = new AIAgent();
      code = await agent.generateAutomationCode({ name, description: options.description });
    }

    const result = await createAutomationFile(name, code);
    console.log(`Automation "${result.name}" saved at ${result.filePath}`);
  } catch (error) {
    console.error('Error creating automation:', (error as Error).message);
  }
};
