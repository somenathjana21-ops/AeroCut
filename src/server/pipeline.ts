import { jobQueue } from './queue/JobQueue.js';
import { ingestionAgent } from './agents/IngestionAgent.js';
import { narrativeAgent } from './agents/NarrativeAgent.js';
import { audioAgent } from './agents/AudioAgent.js';
import { compositionAgent } from './agents/CompositionAgent.js';
import { renderAgent } from './agents/RenderAgent.js';
import type { EditDecisionList, AudioTimeline } from './agents/schemas.js';
import type { CompositionProps } from '../remotion/schema.js';

export interface PipelineOptions {
  sourceScript?: string;
  onProgress?: (progress: number) => void;
  onStageTransition?: (stage: string) => void;
}

export interface PipelineResult {
  jobId: string;
  status: 'COMPLETE';
  outputPath: string;
  durationSec: number;
  fileSizeBytes: number;
  edl: EditDecisionList;
  audioTimeline: AudioTimeline;
  props: CompositionProps;
}

/**
 * Orchestrates the full 5-stage AeroCut pipeline:
 * 1. IngestionAgent: Scans & classifies raw assets into catalog
 * 2. NarrativeAgent: LLM planning of EDL with hook & beat structure
 * 3. AudioAgent: Per-beat TTS synthesis & Whisper word alignment
 * 4. CompositionAgent: Merges EDL + Audio into integer-frame CompositionProps
 * 5. RenderAgent: Remotion bundling, rendering, and post-render verification
 */
export async function runPipeline(
  jobId: string,
  options?: PipelineOptions
): Promise<PipelineResult> {
  const job = jobQueue.getJob(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  let currentStage = 'INGESTION';

  try {
    // -------------------------------------------------------------------------
    // Stage 1: Ingestion
    // -------------------------------------------------------------------------
    options?.onStageTransition?.('INGESTION');
    jobQueue.logEvent(jobId, 'INGESTION', 'info', 'Scanning media assets in assets/raw/ and assets/library/...');
    const catalog = await ingestionAgent.scan();
    jobQueue.logEvent(
      jobId,
      'INGESTION',
      'info',
      `Ingestion completed: catalog contains ${catalog.assets.length} media assets`
    );

    // -------------------------------------------------------------------------
    // Stage 2: Narrative Director (PLANNING)
    // -------------------------------------------------------------------------
    currentStage = 'PLANNING';
    options?.onStageTransition?.('PLANNING');
    jobQueue.transition(jobId, 'PLANNING', {
      message: `Planning narrative structure for "${job.prompt.slice(0, 50)}..." in ${job.mode} mode`,
    });

    const edl = await narrativeAgent.plan({
      taskPrompt: job.prompt,
      mode: job.mode,
      catalog,
      sourceScript: options?.sourceScript,
    });

    const edlJson = JSON.stringify(edl, null, 2);

    // -------------------------------------------------------------------------
    // Stage 3: Audio (SYNTHESIZING)
    // -------------------------------------------------------------------------
    currentStage = 'SYNTHESIZING';
    options?.onStageTransition?.('SYNTHESIZING');
    jobQueue.transition(jobId, 'SYNTHESIZING', {
      message: `Synthesizing audio for ${edl.beats.length} beats and extracting word alignment...`,
      edlJson,
    });

    const audioTimeline = await audioAgent.buildTimeline({
      jobId,
      edl,
      catalog,
      voice: job.voice,
      onEvent: (level, msg) => jobQueue.logEvent(jobId, 'SYNTHESIZING', level, msg),
    });

    const audioTimelineJson = JSON.stringify(audioTimeline, null, 2);

    // -------------------------------------------------------------------------
    // Stage 4: Composition (COMPOSING)
    // -------------------------------------------------------------------------
    currentStage = 'COMPOSING';
    options?.onStageTransition?.('COMPOSING');
    jobQueue.transition(jobId, 'COMPOSING', {
      message: `Composing ${edl.beats.length} scenes and converting timings to integer frames...`,
      audioTimelineJson,
    });

    const props = compositionAgent.compose({
      jobId,
      edl,
      audioTimeline,
      catalog,
    });

    const propsJson = JSON.stringify(props, null, 2);

    // -------------------------------------------------------------------------
    // Stage 5: Render (RENDERING)
    // -------------------------------------------------------------------------
    currentStage = 'RENDERING';
    options?.onStageTransition?.('RENDERING');
    jobQueue.transition(jobId, 'RENDERING', {
      message: `Rendering Remotion composition (${props.durationInFrames} frames at ${props.fps}fps)...`,
      propsJson,
    });

    const renderResult = await renderAgent.render(
      jobId,
      props,
      (progress) => options?.onProgress?.(progress)
    );

    // -------------------------------------------------------------------------
    // Completion
    // -------------------------------------------------------------------------
    jobQueue.transition(jobId, 'COMPLETE', {
      message: `Video rendered successfully to ${renderResult.outputPath} (${renderResult.durationSec.toFixed(2)}s)`,
      outputPath: renderResult.outputPath,
    });

    return {
      jobId,
      status: 'COMPLETE',
      outputPath: renderResult.outputPath,
      durationSec: renderResult.durationSec,
      fileSizeBytes: renderResult.fileSizeBytes,
      edl,
      audioTimeline,
      props,
    };
  } catch (err: any) {
    console.error(`[Pipeline] Pipeline failure at stage ${currentStage} for job ${jobId}:`, err);
    jobQueue.failJob(jobId, currentStage, err);
    throw err;
  }
}
