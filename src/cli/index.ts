import { Command } from 'commander';
import { createAutomationHandler } from './commands/create-automation';
import { listAutomationsHandler } from './commands/list-automations';
import { addLogHandler } from './commands/add-log';
import { updateAutomationHandler } from './commands/update-automation';
import { listSuggestionsHandler } from './commands/list-suggestions';
import { approveSuggestionHandler } from './commands/approve-suggestion';
import { rejectSuggestionHandler } from './commands/reject-suggestion';
import { replySuggestionHandler } from './commands/reply-suggestion';
import { recordDecisionHandler } from './commands/record-decision';
import { summarizePreferencesHandler } from './commands/summarize-preferences';
import { addDeviceHandler } from './commands/add-device';
import { addRequestHandler } from './commands/add-request';

const program = new Command();

program
  .name('elo-engine')
  .description('CLI for managing ELO automations and logs')
  .version('1.0.0');

program
  .command('create-automation <name>')
  .description('Create a new automation script')
  .option('-a, --ai', 'Use Gemini to generate automation code')
  .option('-d, --description <text>', 'Describe the automation to the AI')
  .action((name: string, options: { ai?: boolean; description?: string }) =>
    createAutomationHandler(name, options)
  );

program
  .command('list-automations')
  .description('List all automations')
  .action(() => listAutomationsHandler());

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
  .command('update-automation <name>')
  .description('Update an existing automation using AI and recent logs')
  .option('-a, --ai', 'Use Gemini to update the automation')
  .option('-d, --description <text>', 'Describe the automation intent')
  .option('-p, --preferences <text>', 'User preference summary')
  .option('-l, --log-limit <number>', 'Number of log entries to include', '50')
  .action((name: string, options: {
    ai?: boolean;
    description?: string;
    preferences?: string;
    logLimit?: string;
  }) => updateAutomationHandler(name, options));

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

program
  .command('list-suggestions')
  .description('List pending automation suggestions')
  .action(() => listSuggestionsHandler());

program
  .command('approve-suggestion <id>')
  .description('Approve a pending suggestion and apply its automation code')
  .action((id: string) => approveSuggestionHandler(id));

program
  .command('reject-suggestion <id>')
  .description('Reject a pending suggestion')
  .action((id: string) => rejectSuggestionHandler(id));

program
  .command('reply-suggestion <id> <reply>')
  .description('Reply to a suggestion with natural language (yes/no + extra instructions)')
  .action((id: string, reply: string) => replySuggestionHandler(id, reply));

program.parse(process.argv);