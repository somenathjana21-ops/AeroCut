import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { execa } from 'execa';
import { wsHub } from '../ws/hub';
import {
  OUTPUT_DIR,
  LOGS_DIR,
  PUBLIC_DIR,
  ensureDirectories,
} from '../utils/paths';
import type { CompositionProps } from '../../remotion/schema';

export interface RenderResult {
  outputPath: string;
  durationSec: number;
  fileSizeBytes: number;
}

export class RenderAgent {
  /**
   * Bundles the Remotion project, renders the composition,
   * performs post-render verification, and reports progress over WebSocket.
   */
  public async render(
    jobId: string,
    props: CompositionProps,
    onProgress?: (progress: number, renderedFrames: number, encodedFrames: number) => void
  ): Promise<RenderResult> {
    ensureDirectories();

    const outputLocation = path.resolve(OUTPUT_DIR, `${jobId}.mp4`);
    const compositionId = props.mode === 'fast' ? 'FastShort' : 'QualityExplainer';

    const videoBitrate =
      props.mode === 'fast'
        ? process.env.VIDEO_BITRATE_FAST || '8M'
        : process.env.VIDEO_BITRATE_QUALITY || '12M';

    const rawConcurrency = process.env.RENDER_CONCURRENCY;
    const concurrency =
      rawConcurrency && rawConcurrency !== 'auto'
        ? parseInt(rawConcurrency, 10)
        : Math.max(1, Math.floor(os.cpus().length / 2));

    const entryPoint = path.resolve(process.cwd(), 'src', 'remotion', 'index.ts');

    let serveUrl = '';
    let caughtError: any = null;

    try {
      // 1. Bundle Remotion components
      serveUrl = await bundle({
        entryPoint,
        publicDir: PUBLIC_DIR,
      });

      // 2. Select Composition
      const composition = await selectComposition({
        serveUrl,
        id: compositionId,
        inputProps: props,
      });

      // 3. Render Media
      // Rules strictly enforced:
      // - hardwareAcceleration: 'if-possible'
      // - NEVER set crf alongside hardware acceleration
      // - chromiumOptions: { gl: 'angle' }
      await renderMedia({
        composition,
        serveUrl,
        codec: 'h264',
        outputLocation,
        inputProps: props,
        hardwareAcceleration: 'if-possible',
        videoBitrate,
        concurrency,
        logLevel: 'verbose',
        chromiumOptions: {
          gl: 'angle',
        },
        onProgress: ({ renderedFrames, encodedFrames, progress }) => {
          onProgress?.(progress, renderedFrames, encodedFrames);
          wsHub.broadcast({
            type: 'render:progress',
            jobId,
            progress,
            renderedFrames,
            encodedFrames,
          });
        },
      });

      // 4. Post-render verification
      // Verify: file exists, size > 0, ffprobe duration within 0.5s of expected, video stream present
      if (!fs.existsSync(outputLocation)) {
        throw new Error(`Output file was not created at ${outputLocation}`);
      }

      const stat = fs.statSync(outputLocation);
      if (stat.size === 0) {
        throw new Error(`Output file ${outputLocation} is 0 bytes`);
      }

      const { stdout: probeStdout } = await execa('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-show_entries',
        'stream=codec_type,codec_name',
        '-of',
        'json',
        outputLocation,
      ]);

      const probe = JSON.parse(probeStdout);
      const measuredDuration = parseFloat(probe.format?.duration || '0');
      const expectedDuration = props.durationInFrames / props.fps;

      if (Math.abs(measuredDuration - expectedDuration) > 0.5) {
        throw new Error(
          `Rendered video duration mismatch: probe reported ${measuredDuration.toFixed(2)}s, expected ${expectedDuration.toFixed(2)}s (±0.5s allowed)`
        );
      }

      const hasVideoStream = probe.streams?.some((s: any) => s.codec_type === 'video');
      if (!hasVideoStream) {
        throw new Error(`Rendered video ${outputLocation} does not contain a video stream`);
      }

      return {
        outputPath: outputLocation,
        durationSec: measuredDuration,
        fileSizeBytes: stat.size,
      };
    } catch (err: any) {
      caughtError = err;

      // On failure dump serveUrl, inputProps and stderr to logs/<jobId>/
      const jobLogsDir = path.resolve(LOGS_DIR, jobId);
      try {
        fs.mkdirSync(jobLogsDir, { recursive: true });
        if (serveUrl) {
          fs.writeFileSync(path.join(jobLogsDir, 'serveUrl.txt'), serveUrl, 'utf8');
        }
        fs.writeFileSync(
          path.join(jobLogsDir, 'inputProps.json'),
          JSON.stringify(props, null, 2),
          'utf8'
        );
        fs.writeFileSync(
          path.join(jobLogsDir, 'error.log'),
          `${err.stack || err.message || String(err)}\n\nStderr: ${err.stderr || ''}`,
          'utf8'
        );
      } catch (logErr) {
        console.error(`[RenderAgent] Failed to write error dump to ${jobLogsDir}:`, logErr);
      }

      throw caughtError;
    }
  }
}

export const renderAgent = new RenderAgent();
