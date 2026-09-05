import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';
import { jobQueue } from '../src/server/db/../queue/JobQueue.js';
import { runPipeline } from '../src/server/pipeline.js';

dotenv.config();

function parseCliArgs() {
  const options = {
    prompt: { type: 'string', short: 'p' },
    mode: { type: 'string', short: 'm', default: 'fast' },
    voice: { type: 'string', short: 'v' },
    script: { type: 'string', short: 's' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  } as const;

  const { values } = parseArgs({
    options,
    allowPositionals: false,
    strict: false,
  });

  return values;
}

async function main() {
  const args = parseCliArgs();

  if (args.help || !args.prompt) {
    const helpMsg = `
Usage:
  npx tsx scripts/run-job.ts --prompt "<text>" [--mode fast|quality] [--voice <name>] [--script <path>] [--json]

Options:
  -p, --prompt    Task prompt describing the video (required)
  -m, --mode      Video mode: 'fast' (9:16 vertical short) or 'quality' (16:9 landscape) [default: fast]
  -v, --voice     Edge-TTS voice name (e.g. en-US-ChristopherNeural)
  -s, --script    Path to optional source script or article file
      --json      Output strictly one JSON result object to stdout (progress sent to stderr)
  -h, --help      Display this help message
`;
    if (args.json) {
      process.stderr.write(helpMsg);
    } else {
      console.log(helpMsg);
    }
    process.exit(args.help ? 0 : 1);
  }

  const isJson = !!args.json;
  const log = (msg: string) => {
    if (isJson) {
      process.stderr.write(`${msg}\n`);
    } else {
      console.log(msg);
    }
  };

  const prompt = typeof args.prompt === 'string' ? args.prompt : '';
  const mode = (args.mode === 'quality' ? 'quality' : 'fast') as 'fast' | 'quality';
  const voice = typeof args.voice === 'string' ? args.voice : undefined;
  let sourceScript: string | undefined;

  if (typeof args.script === 'string') {
    const scriptPath = path.resolve(process.cwd(), args.script);
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Script file not found at: ${scriptPath}`);
    }
    sourceScript = fs.readFileSync(scriptPath, 'utf8');
  }

  log(`[AeroCut] Enqueueing job in ${mode} mode...`);

  const job = jobQueue.enqueue({
    prompt,
    mode,
    voice,
  });

  log(`[AeroCut] Job ID: ${job.id}`);

  const startTime = Date.now();

  try {
    const result = await runPipeline(job.id, {
      sourceScript,
      onStageTransition: (stage) => {
        log(`[AeroCut] ---> Stage: ${stage}`);
      },
      onProgress: (progress) => {
        if (!isJson) {
          process.stdout.write(`\r[AeroCut] Rendering progress: ${(progress * 100).toFixed(1)}%`);
        }
      },
    });

    if (!isJson) {
      process.stdout.write('\n');
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`[AeroCut] Pipeline completed in ${elapsedSec}s!`);

    if (isJson) {
      // Exactly ONE JSON result object to stdout
      process.stdout.write(
        JSON.stringify(
          {
            jobId: result.jobId,
            status: result.status,
            outputPath: result.outputPath,
            durationSec: result.durationSec,
            fileSizeBytes: result.fileSizeBytes,
            elapsedSec: parseFloat(elapsedSec),
          },
          null,
          2
        ) + '\n'
      );
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('AEROCUT PIPELINE EXECUTION SUCCEEDED');
      console.log('='.repeat(60));
      console.log(`Job ID:       ${result.jobId}`);
      console.log(`Output Video: ${result.outputPath}`);
      console.log(`Duration:     ${result.durationSec.toFixed(2)}s`);
      console.log(`File Size:    ${(result.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`Total Time:   ${elapsedSec}s`);
      console.log('='.repeat(60) + '\n');
    }

    process.exit(0);
  } catch (err: any) {
    if (isJson) {
      process.stderr.write(`\n[AeroCut Pipeline Error] ${err.message}\n${err.stack || ''}\n`);
      process.stdout.write(
        JSON.stringify({
          jobId: job.id,
          status: 'FAILED',
          error: err.message,
        }) + '\n'
      );
    } else {
      console.error('\n[AeroCut Pipeline Error]', err);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal CLI error:', err);
  process.exit(1);
});
