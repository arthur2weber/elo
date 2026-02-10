import { spawn } from 'child_process';
import axios from 'axios';

const N8N_URL = process.env.N8N_URL || 'http://localhost:5678';
const CLEANUP = process.env.N8N_TEST_CLEANUP !== 'false';

const runCommand = (command: string, args: string[]) => new Promise<void>((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit' });
  child.on('error', (error: Error) => reject(error));
  child.on('close', (code: number | null) => {
    if (code !== 0) {
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      return;
    }
    resolve();
  });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHealth = async (retries = 60, delay = 2000) => {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await axios.get(`${N8N_URL}/healthz`);
      return;
    } catch (error) {
      await sleep(delay);
    }
  }
  throw new Error('n8n health check failed after waiting.');
};

const runInContainer = async (command: string) => {
  await runCommand('docker-compose', ['exec', '-T', 'n8n', 'sh', '-c', command]);
};

const run = async () => {
  console.log('Starting n8n via docker-compose...');
  await runCommand('docker-compose', ['down', '-v']);
  await runCommand('docker-compose', ['up', '-d']);
  console.log('Waiting for n8n health check...');
  await waitForHealth();

  console.log('Importing sample workflow via n8n CLI...');
  await runInContainer('n8n import:workflow --input=/files/workflows/sample-workflow.json');

  console.log('Exporting workflows to verify import...');
  await runInContainer('n8n export:workflow --all --output=/tmp/workflows.json');
  await runInContainer('test -s /tmp/workflows.json');

  console.log('n8n workflow CLI check passed.');
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!CLEANUP) {
      return;
    }
    try {
      await runCommand('docker-compose', ['down', '-v']);
    } catch (cleanupError) {
      console.error('Failed to clean up docker-compose:', cleanupError);
    }
  });
