import { spawn } from 'child_process';

const getArgs = (): string[] => {
  const rawArgs = process.env.GEMINI_CLI_ARGS;
  if (!rawArgs) {
    return [];
  }
  return rawArgs.split(' ').filter(Boolean);
};

export const runGeminiPrompt = (prompt: string): Promise<string> => {
  const command = process.env.GEMINI_CLI_BIN || 'gemini';
  const args = getArgs();
  const promptArg = process.env.GEMINI_CLI_PROMPT_ARG;

  return new Promise((resolve, reject) => {
    if (promptArg) {
      args.push(promptArg, prompt);
    }

    const child = spawn(command, args, {
      stdio: promptArg ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }

    child.on('error', (error: Error) => {
      reject(new Error(`Failed to run Gemini CLI: ${error.message}`));
    });

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`Gemini CLI exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(stdout.trim());
    });

    if (!promptArg && child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
};
