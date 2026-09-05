import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { execa } from 'execa';
import { sampleFastProps } from '../src/remotion/fixtures/sample-fast.js';
import { sampleQualityProps } from '../src/remotion/fixtures/sample-quality.js';

async function verifyMediaFile(filePath: string, expectedDurationSec: number) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Output file not found at ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    throw new Error(`Output file ${filePath} is 0 bytes`);
  }

  const { stdout } = await execa('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-show_entries',
    'stream=codec_type,codec_name,width,height',
    '-of',
    'json',
    filePath,
  ]);

  const probe = JSON.parse(stdout);
  const duration = parseFloat(probe.format?.duration || '0');
  if (Math.abs(duration - expectedDurationSec) > 1.0) {
    throw new Error(
      `File duration ${duration}s deviates significantly from expected ${expectedDurationSec}s`
    );
  }

  const hasVideo = probe.streams?.some((s: any) => s.codec_type === 'video');
  if (!hasVideo) {
    throw new Error(`No video stream found in ${filePath}`);
  }

  return { duration, size: stat.size };
}

async function main() {
  console.log('='.repeat(70));
  console.log('AeroCut Phase 3 Render Pipeline Gate');
  console.log('='.repeat(70));

  const outputDir = path.resolve(process.cwd(), 'assets', 'output');
  fs.mkdirSync(outputDir, { recursive: true });

  console.log('\n[1/4] Checking self-hosted font assets...');
  const fonts = [
    'Inter-400.ttf',
    'Inter-600.ttf',
    'Inter-700.ttf',
    'Inter-800.ttf',
    'Inter-900.ttf',
    'JetBrainsMono-400.ttf',
    'JetBrainsMono-700.ttf',
  ];
  for (const font of fonts) {
    const fontPath = path.resolve(process.cwd(), 'public', 'fonts', font);
    if (!fs.existsSync(fontPath)) {
      throw new Error(`Missing self-hosted font: ${fontPath}`);
    }
  }
  console.log('  [PASS] All 7 required font files present in public/fonts/');

  console.log('\n[2/4] Bundling Remotion code from src/remotion/index.ts...');
  const entryPoint = path.resolve(process.cwd(), 'src', 'remotion', 'index.ts');
  const bundleStart = Date.now();
  const serveUrl = await bundle({
    entryPoint,
    publicDir: path.resolve(process.cwd(), 'public'),
  });
  console.log(`  [PASS] Bundled successfully in ${Date.now() - bundleStart}ms`);

  console.log('\n[3/4] Rendering FastShort (9:16 vertical short)...');
  const fastComp = await selectComposition({
    serveUrl,
    id: 'FastShort',
    inputProps: sampleFastProps,
  });

  const fastOutput = path.join(outputDir, 'test-fast.mp4');
  await renderMedia({
    composition: fastComp,
    serveUrl,
    codec: 'h264',
    outputLocation: fastOutput,
    inputProps: sampleFastProps,
    hardwareAcceleration: 'if-possible',
    videoBitrate: '8M',
    chromiumOptions: {
      gl: 'angle',
    },
    onProgress: ({ progress }) => {
      process.stdout.write(`\r  Rendering FastShort: ${(progress * 100).toFixed(0)}%`);
    },
  });
  process.stdout.write('\n');
  const fastProbe = await verifyMediaFile(fastOutput, 12.0);
  console.log(
    `  [PASS] Rendered ${fastOutput} (${(fastProbe.size / (1024 * 1024)).toFixed(2)} MB, ${fastProbe.duration.toFixed(2)}s)`
  );

  console.log('\n[4/4] Rendering QualityExplainer (16:9 landscape explainer)...');
  const qualityComp = await selectComposition({
    serveUrl,
    id: 'QualityExplainer',
    inputProps: sampleQualityProps,
  });

  const qualityOutput = path.join(outputDir, 'test-quality.mp4');
  await renderMedia({
    composition: qualityComp,
    serveUrl,
    codec: 'h264',
    outputLocation: qualityOutput,
    inputProps: sampleQualityProps,
    hardwareAcceleration: 'if-possible',
    videoBitrate: '12M',
    chromiumOptions: {
      gl: 'angle',
    },
    onProgress: ({ progress }) => {
      process.stdout.write(`\r  Rendering QualityExplainer: ${(progress * 100).toFixed(0)}%`);
    },
  });
  process.stdout.write('\n');
  const qualityProbe = await verifyMediaFile(qualityOutput, 15.0);
  console.log(
    `  [PASS] Rendered ${qualityOutput} (${(qualityProbe.size / (1024 * 1024)).toFixed(2)} MB, ${qualityProbe.duration.toFixed(2)}s)`
  );

  console.log('\n' + '-'.repeat(70));
  console.log('SUMMARY: ALL PHASE 3 GATES PASSED');
  console.log('-'.repeat(70));
  console.log(`FastShort:        ${fastOutput} (${fastProbe.duration.toFixed(1)}s, PASS)`);
  console.log(`QualityExplainer: ${qualityOutput} (${qualityProbe.duration.toFixed(1)}s, PASS)`);
  console.log('='.repeat(70) + '\n');
}

main().catch((err) => {
  console.error('\nPhase 3 render gate failed:');
  console.error(err);
  process.exit(1);
});
