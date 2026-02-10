import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import assert from 'assert';
import {
  appendLogEntry,
  appendRequestLog,
  createWorkflowFile,
  getWorkflowsFromFiles,
  installIntegrationFiles,
  readRecentLogs,
  readRecentRequests,
  readWorkflowFile,
  updateWorkflowFile
} from '../src/cli/utils/n8n-files';
import { appendDecision, getPreferenceSummary } from '../src/cli/utils/preferences';
import { addDevice, readDevices } from '../src/cli/utils/device-registry';
import { buildDecisionContext, buildDeviceStatusSnapshot, formatDecisionContext } from '../src/server/decision-context';
import { validateWorkflowDevices } from '../src/server/device-validator';

const run = async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'elo-core-test-'));
  process.env.N8N_FILES_PATH = tmpDir;

  const workflow = await createWorkflowFile('Core Test Workflow', {
    nodes: [],
    connections: {}
  });
  assert.ok(workflow.filePath.endsWith('.json'), 'Workflow file should be created');

  const listed = await getWorkflowsFromFiles();
  assert.ok(listed.length === 1, 'Workflow list should include one item');

  const read = await readWorkflowFile('Core Test Workflow');
  assert.strictEqual(read.data.name, 'Core Test Workflow');

  await updateWorkflowFile('Core Test Workflow', {
    ...read.data,
    active: true
  });
  const updated = await readWorkflowFile('Core Test Workflow');
  assert.strictEqual(updated.data.active, true, 'Workflow should be updated');

  const integration = await installIntegrationFiles('Core Integration', 'Test integration');
  assert.ok(integration.path.includes('core-integration'));

  await appendLogEntry({
    timestamp: new Date().toISOString(),
    device: 'thermostat',
    event: 'temperature',
    payload: { value: 27 }
  });
  await appendRequestLog({
    timestamp: new Date().toISOString(),
    user: 'arthur',
    request: 'Set office temperature to 23C',
    context: 'office'
  });

  await addDevice({
    id: 'office-thermostat',
    name: 'Thermostat',
    room: 'office',
    endpoint: 'http://localhost:8081/status'
  });
  const devices = await readDevices();
  assert.ok(devices.length === 1, 'Device registry should contain one device');

  const logs = await readRecentLogs(5);
  assert.ok(logs.length === 1, 'Log should be appended');

  const requests = await readRecentRequests(5);
  assert.ok(requests.length === 1, 'Request log should be appended');

  const snapshot = buildDeviceStatusSnapshot(logs);
  assert.strictEqual(snapshot.length, 1, 'Device status snapshot should include one device');
  const structuredContext = buildDecisionContext(devices, snapshot, requests);
  const context = formatDecisionContext(structuredContext);
  assert.ok(context.includes('statusSnapshot'), 'Decision context should include device status');

  validateWorkflowDevices({
    name: 'Test Workflow',
    nodes: [
      {
        name: 'Device Check',
        parameters: {
          target: 'device:office-thermostat'
        }
      }
    ]
  }, devices);

  await appendDecision({
    timestamp: new Date().toISOString(),
    actionKey: 'set-office-temp-23',
    suggestion: 'Adjust office temp to 23C',
    accepted: true
  });
  await appendDecision({
    timestamp: new Date().toISOString(),
    actionKey: 'set-office-temp-23',
    suggestion: 'Adjust office temp to 23C',
    accepted: true
  });
  await appendDecision({
    timestamp: new Date().toISOString(),
    actionKey: 'set-office-temp-23',
    suggestion: 'Adjust office temp to 23C',
    accepted: true
  });

  const summary = await getPreferenceSummary();
  assert.ok(summary.includes('auto-approve'), 'Preference summary should detect auto-approve');

  await rm(tmpDir, { recursive: true, force: true });
  console.log('Core tests passed.');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
