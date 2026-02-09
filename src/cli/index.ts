import { Command } from 'commander';
import { createWorkflowHandler } from './commands/create-workflow';
import { installIntegrationHandler } from './commands/install-integration';
import { listWorkflowsHandler } from './commands/list-workflows';

const program = new Command();

program
  .name('n8n-ai-manager')
  .description('CLI for managing n8n workflows and integrations')
  .version('1.0.0');

program
  .command('create-workflow <name>')
  .description('Create a new workflow in n8n')
  .option('-m, --mode <mode>', 'files or api', process.env.N8N_MODE || 'files')
  .option('-a, --ai', 'Use Gemini CLI to generate workflow JSON')
  .option('-d, --description <text>', 'Describe the workflow to the AI')
  .action((name: string, options: { mode?: 'files' | 'api'; ai?: boolean; description?: string }) =>
    createWorkflowHandler(name, options)
  );

program
  .command('install-integration <name>')
  .description('Install a specified integration into n8n')
  .option('-m, --mode <mode>', 'files or api', process.env.N8N_MODE || 'files')
  .option('-d, --description <text>', 'Describe the integration')
  .action((name: string, options: { mode?: 'files' | 'api'; description?: string }) =>
    installIntegrationHandler(name, options)
  );

program
  .command('list-workflows')
  .description('List all workflows in n8n')
  .option('-m, --mode <mode>', 'files or api', process.env.N8N_MODE || 'files')
  .action((options: { mode?: 'files' | 'api' }) => listWorkflowsHandler(options));

program.parse(process.argv);