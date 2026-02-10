import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { appendLogEntry, readRecentLogs } from '../src/cli/utils/storage-files';
import { createAutomationFile, listAutomations } from '../src/cli/utils/automation-files';
import { appendDecision, getPreferenceSummary } from '../src/cli/utils/preferences';

const run = async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'elo-engine-smoke-'));
  process.env.ELO_FILES_PATH = tmpDir;

  const automation = await createAutomationFile('Smoke Test Automation', 'export default async function() {}');
  await appendLogEntry({
    timestamp: new Date().toISOString(),
    device: 'smoke-sensor',
    event: 'heartbeat',
    payload: { status: 'ok' }
  });
  await appendDecision({
    timestamp: new Date().toISOString(),
    actionKey: 'set-office-temp-23',
    suggestion: 'Adjust office temperature to 23C in silent mode',
    accepted: true
  });
  const automations = await listAutomations();
  const logs = await readRecentLogs(10);
  const preferences = await getPreferenceSummary();

  if (automations.length === 0) {
    throw new Error('Smoke test failed: no automations found.');
  }

  if (logs.length === 0) {
    throw new Error('Smoke test failed: no logs found.');
  }

  if (!preferences) {
    throw new Error('Smoke test failed: preferences summary missing.');
  }

  console.log(`Smoke test automation saved at ${automation.filePath}`);
  await rm(tmpDir, { recursive: true, force: true });
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
