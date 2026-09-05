import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import { jobQueue } from '../src/server/queue/JobQueue.js';
import { ingestionAgent } from '../src/server/agents/IngestionAgent.js';
import { narrativeAgent } from '../src/server/agents/NarrativeAgent.js';
import { audioAgent } from '../src/server/agents/AudioAgent.js';
import { compositionAgent } from '../src/server/agents/CompositionAgent.js';
import { renderAgent } from '../src/server/agents/RenderAgent.js';
import dotenv from 'dotenv';

dotenv.config();

interface StageTiming {
  stage: string;
  durationMs: number;
}

async function main() {
  console.log('='.repeat(70));
  console.log('AeroCut Headless End-to-End Pipeline Test');
  console.log('='.repeat(70));

  const prompt =
    'Three reasons why React component re-renders are cheap and DOM mutations lag.';
  const mode = 'fast' as const;

  console.log(`Prompt: "${prompt}"`);
  console.log(`Mode:   ${mode} (9:16 vertical short)\n`);

  const timings: StageTiming[] = [];
  const pipelineStart = performance.now();

  // Enqueue job
  const job = jobQueue.enqueue({
    prompt,
    mode,
  });
  console.log(`[JobQueue] Created job: ${job.id}`);

  // Stage 1: Ingestion
  console.log('\n[1/5] Ingestion: Scanning assets/raw/ and assets/library/...');
  const t1 = performance.now();
  const catalog = await ingestionAgent.scan();
  const d1 = performance.now() - t1;
  timings.push({ stage: '1. Ingestion', durationMs: d1 });
  console.log(`  -> Ingestion finished in ${(d1 / 1000).toFixed(2)}s (found ${catalog.assets.length} assets)`);

  // Stage 2: Narrative
  console.log('\n[2/5] Narrative Planning: Generating EDL via LLM client...');
  const t2 = performance.now();
  jobQueue.transition(job.id, 'PLANNING');
  const edl = await narrativeAgent.plan({
    taskPrompt: prompt,
    mode,
    catalog,
  });
  const d2 = performance.now() - t2;
  timings.push({ stage: '2. Narrative Planning', durationMs: d2 });
  jobQueue.transition(job.id, 'SYNTHESIZING', {
    edlJson: JSON.stringify(edl, null, 2),
  });
  console.log(`  -> Narrative finished in ${(d2 / 1000).toFixed(2)}s (planned ${edl.beats.length} beats)`);
  console.log(`  -> Title: "${edl.title}", Hook: "${edl.hookLine}"`);

  // Stage 3: Audio
  console.log('\n[3/5] Audio Synthesis & Whisper Alignment: Synthesizing beats...');
  const t3 = performance.now();
  const audioTimeline = await audioAgent.buildTimeline({
    jobId: job.id,
    edl,
    catalog,
    onEvent: (level, msg) => console.log(`     [AudioAgent ${level}] ${msg}`),
  });
  const d3 = performance.now() - t3;
  timings.push({ stage: '3. Audio Synthesis & Whisper', durationMs: d3 });
  jobQueue.transition(job.id, 'COMPOSING', {
    audioTimelineJson: JSON.stringify(audioTimeline, null, 2),
  });
  console.log(`  -> Audio finished in ${(d3 / 1000).toFixed(2)}s`);
  console.log(`  -> Total measured audio duration: ${audioTimeline.totalDurationSec.toFixed(2)}s`);
  console.log(`  -> Total words aligned: ${audioTimeline.words.length}`);

  // Stage 4: Composition
  console.log('\n[4/5] Composition: Merging EDL + Audio into integer-frame props...');
  const t4 = performance.now();
  const props = compositionAgent.compose({
    jobId: job.id,
    edl,
    audioTimeline,
    catalog,
  });
  const d4 = performance.now() - t4;
  timings.push({ stage: '4. Composition Assembly', durationMs: d4 });
  jobQueue.transition(job.id, 'RENDERING', {
    propsJson: JSON.stringify(props, null, 2),
  });
  console.log(`  -> Composition finished in ${(d4 / 1000).toFixed(2)}s`);
  console.log(`  -> Total frames: ${props.durationInFrames} (${(props.durationInFrames / props.fps).toFixed(2)}s at ${props.fps}fps)`);
  console.log(`  -> Total scenes: ${props.scenes.length}`);

  // Stage 5: Render
  console.log('\n[5/5] Render: Bundling Remotion and rendering MP4...');
  const t5 = performance.now();
  let lastProgress = 0;
  const renderResult = await renderAgent.render(job.id, props, (progress) => {
    const currentPct = Math.floor(progress * 100);
    if (currentPct >= lastProgress + 20) {
      process.stdout.write(`  Render progress: ${currentPct}%\n`);
      lastProgress = currentPct;
    }
  });
  const d5 = performance.now() - t5;
  timings.push({ stage: '5. Remotion Render', durationMs: d5 });

  jobQueue.transition(job.id, 'COMPLETE', {
    outputPath: renderResult.outputPath,
  });

  const totalPipelineTimeMs = performance.now() - pipelineStart;

  // Verification Assertions
  if (!fs.existsSync(renderResult.outputPath)) {
    throw new Error(`Assertion failed: Rendered output does not exist at ${renderResult.outputPath}`);
  }
  const stat = fs.statSync(renderResult.outputPath);
  if (stat.size === 0) {
    throw new Error(`Assertion failed: Rendered output is 0 bytes`);
  }

  // Final Summary Table
  console.log('\n' + '='.repeat(70));
  console.log('HEADLESS PIPELINE STAGE TIMINGS');
  console.log('='.repeat(70));
  for (const t of timings) {
    const durationSec = (t.durationMs / 1000).toFixed(2).padStart(6, ' ');
    const pct = ((t.durationMs / totalPipelineTimeMs) * 100).toFixed(1).padStart(5, ' ');
    console.log(`  ${t.stage.padEnd(35, ' ')} : ${durationSec}s (${pct}%)`);
  }
  console.log('-'.repeat(70));
  console.log(
    `  ${'Total Pipeline Duration'.padEnd(35, ' ')} : ${(totalPipelineTimeMs / 1000).toFixed(2).padStart(6, ' ')}s (100.0%)`
  );
  console.log('='.repeat(70));
  console.log(`Output File: ${renderResult.outputPath} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`Video Duration: ${renderResult.durationSec.toFixed(2)}s`);
  console.log('ALL PHASE 4 PIPELINE GATES PASSED [5/5]\n');
}

main().catch((err) => {
  console.error('\nHeadless pipeline test failed:', err);
  process.exit(1);
});
