import { Command } from 'commander';
import { createWorkflowHandler } from './commands/create-workflow';
import { installIntegrationHandler } from './commands/install-integration';
import { listWorkflowsHandler } from './commands/list-workflows';
import { addLogHandler } from './commands/add-log';
import { updateWorkflowHandler } from './commands/update-workflow';
import { recordDecisionHandler } from './commands/record-decision';
import { summarizePreferencesHandler } from './commands/summarize-preferences';
import { addDeviceHandler } from './commands/add-device';
import { addRequestHandler } from './commands/add-request';

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

program
  .command('add-log')
  .description('Append a smart-home device log entry')
  .requiredOption('-d, --device <device>', 'Device name')
  .requiredOption('-e, --event <event>', 'Event name')
  .option('-p, --payload <json>', 'JSON payload string')
  .option('-t, --timestamp <iso>', 'ISO timestamp (defaults to now)')
  .action((options: { device: string; event: string; payload?: string; timestamp?: string }) =>
    addLogHandler(options)
  );

program
  .command('add-device')
  .description('Register a device for continuous monitoring')
  .requiredOption('-i, --id <id>', 'Device ID')
  .requiredOption('-n, --name <name>', 'Device name')
  .option('-t, --type <type>', 'Device type')
  .option('-r, --room <room>', 'Room name')
  .option('-e, --endpoint <url>', 'Device status endpoint URL')
  .option('-p, --poll-interval <ms>', 'Polling interval override (ms)')
  .action((options: {
    id: string;
    name: string;
    type?: string;
    room?: string;
    endpoint?: string;
    pollIntervalMs?: string;
  }) => addDeviceHandler(options));

program
  .command('add-request')
  .description('Log a user request for the butler to learn from')
  .requiredOption('-r, --request <text>', 'Request text')
  .option('-u, --user <name>', 'User identifier')
  .option('-c, --context <text>', 'Context summary')
  .option('-p, --payload <json>', 'JSON payload string')
  .action((options: { request: string; user?: string; context?: string; payload?: string }) =>
    addRequestHandler(options)
  );

program
  .command('update-workflow <name>')
  .description('Update an existing workflow using AI and recent logs')
  .option('-m, --mode <mode>', 'files or api', process.env.N8N_MODE || 'files')
  .option('-a, --ai', 'Use Gemini CLI to update the workflow')
  .option('-d, --description <text>', 'Describe the workflow intent')
  .option('-p, --preferences <text>', 'User preference summary')
  .option('-l, --log-limit <number>', 'Number of log entries to include', '50')
  .action((name: string, options: {
    mode?: 'files' | 'api';
    ai?: boolean;
    description?: string;
    preferences?: string;
    logLimit?: string;
  }) => updateWorkflowHandler(name, options));

program
  .command('record-decision')
  .description('Record whether the user accepted a suggestion')
  .requiredOption('-k, --action-key <key>', 'Action key (e.g. set-office-temp-23)')
  .requiredOption('-s, --suggestion <text>', 'Suggestion text')
  .option('-a, --accepted', 'Mark as accepted')
  .option('-r, --rejected', 'Mark as rejected')
  .option('-c, --context <text>', 'Context summary')
  .option('-d, --details <json>', 'JSON details payload')
  .option('-u, --user <name>', 'User identifier')
  .action((options: {
    actionKey: string;
    suggestion: string;
    accepted?: boolean;
    rejected?: boolean;
    context?: string;
    details?: string;
    user?: string;
  }) => recordDecisionHandler(options));

program
  .command('summarize-preferences')
  .description('Show inferred preference patterns from decisions')
  .option('-l, --limit <number>', 'Number of decisions to include', '200')
  .action((options: { limit?: string }) => summarizePreferencesHandler(options));

program.parse(process.argv);