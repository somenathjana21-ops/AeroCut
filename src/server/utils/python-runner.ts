import path from 'node:path';
import fs from 'node:fs';
import { execa } from 'execa';

/**
 * Executes a Python script inside the project's venv environment,
 * piping payload as JSON into stdin and parsing stdout as JSON.
 *
 * @param scriptPath Path to Python script (absolute or relative to process.cwd())
 * @param payload Arbitrary serializable payload sent as JSON on stdin
 * @returns Parsed JSON response of type T
 */
export async function runPython<T>(scriptPath: string, payload: unknown): Promise<T> {
  const pythonBinRel = process.platform === 'win32'
    ? path.join('python-services', 'venv', 'Scripts', 'python.exe')
    : path.join('python-services', 'venv', 'bin', 'python');

  const pythonBin = path.resolve(process.cwd(), pythonBinRel);
  if (!fs.existsSync(pythonBin)) {
    throw new Error(`Python venv interpreter not found at ${pythonBin}`);
  }

  const script = path.isAbsolute(scriptPath)
    ? scriptPath
    : path.resolve(process.cwd(), scriptPath);

  const allowedDir = path.resolve(process.cwd(), 'python-services');
  if (!script.startsWith(allowedDir)) {
    throw new Error(`Forbidden script path outside python-services: ${scriptPath}`);
  }

  if (!fs.existsSync(script)) {
    throw new Error(`Python script not found at ${script}`);
  }

  const payloadJson = JSON.stringify(payload);

  let stdout = '';
  let stderr = '';

  try {
    const result = await execa(pythonBin, [script], {
      input: payloadJson,
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
      },
      timeout: 120_000,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err: any) {
    const isTimeout = err.timedOut ? ' (Timed out after 120s)' : '';
    const outSnippet = (err.stdout ?? stdout ?? '').slice(0, 500);
    const errSnippet = (err.stderr ?? stderr ?? err.message ?? '').slice(0, 500);
    throw new Error(
      `Python execution failed for ${scriptPath}${isTimeout}: ${err.message}\n` +
      `Stdout (first 500 chars):\n${outSnippet}\n` +
      `Stderr (first 500 chars):\n${errSnippet}`
    );
  }

  try {
    return JSON.parse(stdout) as T;
  } catch (parseErr: any) {
    const outSnippet = (stdout ?? '').slice(0, 500);
    const errSnippet = (stderr ?? '').slice(0, 500);
    throw new Error(
      `Failed to parse JSON output from ${scriptPath}: ${parseErr.message}\n` +
      `Stdout (first 500 chars):\n${outSnippet}\n` +
      `Stderr (first 500 chars):\n${errSnippet}`
    );
  }
}
