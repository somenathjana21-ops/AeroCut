import { jobQueue } from './queue/JobQueue';
import { ingestionAgent } from './agents/IngestionAgent';
import { narrativeAgent } from './agents/NarrativeAgent';
import { audioAgent } from './agents/AudioAgent';
import { compositionAgent } from './agents/CompositionAgent';
import { renderAgent } from './agents/RenderAgent';
import type { EditDecisionList, AudioTimeline } from './agents/schemas';
import type { CompositionProps } from '../remotion/schema';

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

  function assertNotCancelled() {
    const current = jobQueue.getJob(jobId);
    if (current?.status === 'CANCELLED') {
      throw new Error('JOB_CANCELLED');
    }
  }

  try {
    assertNotCancelled();

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

    assertNotCancelled();

    // -------------------------------------------------------------------------
    // Stage 2: Narrative Director (PLANNING)
    // -------------------------------------------------------------------------
    currentStage = 'PLANNING';
    options?.onStageTransition?.('PLANNING');
    jobQueue.transition(jobId, 'PLANNING', {
      message: `Planning narrative structure for "${job.prompt.slice(0, 50)}..." in ${job.mode} mode`,
    });

    jobQueue.logEvent(
      jobId,
      'PLANNING',
      'info',
      `Analyzing prompt constraints for ${job.mode} mode (${catalog.assets.length} assets available)...`
    );
    jobQueue.logEvent(
      jobId,
      'PLANNING',
      'info',
      'Invoking Gemini Narrative Director to plan hook and beat structure...'
    );

    let elapsedSec = 0;
    const planningHeartbeat = setInterval(() => {
      elapsedSec += 4;
      const current = jobQueue.getJob(jobId);
      if (current?.status !== 'PLANNING') {
        clearInterval(planningHeartbeat);
        return;
      }
      jobQueue.logEvent(
        jobId,
        'PLANNING',
        'info',
        `Narrative Director structuring scenes and pacing (${elapsedSec}s elapsed)...`
      );
    }, 4000);

    let edl;
    try {
      edl = await narrativeAgent.plan({
        taskPrompt: job.prompt,
        mode: job.mode,
        catalog,
        sourceScript: options?.sourceScript,
      });
    } finally {
      clearInterval(planningHeartbeat);
    }

    assertNotCancelled();

    const plannedDuration = edl.beats.reduce((s, b) => s + b.estimatedDurationSec, 0);
    jobQueue.logEvent(
      jobId,
      'PLANNING',
      'info',
      `Narrative plan finalized: ${edl.beats.length} beats, target duration ${plannedDuration.toFixed(1)}s`
    );

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

    jobQueue.logEvent(
      jobId,
      'SYNTHESIZING',
      'info',
      `Synthesizing ${edl.beats.length} voiceover segments with voice "${job.voice || 'default'}" and generating Whisper word timestamps...`
    );

    const audioTimeline = await audioAgent.buildTimeline({
      jobId,
      edl,
      catalog,
      voice: job.voice,
      onEvent: (level, msg) => jobQueue.logEvent(jobId, 'SYNTHESIZING', level, msg),
    });

    assertNotCancelled();

    jobQueue.logEvent(
      jobId,
      'SYNTHESIZING',
      'info',
      `Audio timeline constructed: duration ${audioTimeline.totalDurationSec.toFixed(2)}s with ducking envelope`
    );

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

    jobQueue.logEvent(
      jobId,
      'COMPOSING',
      'info',
      `Mapping ${edl.beats.length} narrative scenes to integer frame boundaries and calculating Ken Burns camera motion...`
    );

    const props = compositionAgent.compose({
      jobId,
      edl,
      audioTimeline,
      catalog,
    });

    assertNotCancelled();

    jobQueue.logEvent(
      jobId,
      'COMPOSING',
      'info',
      `Composition props validated: ${props.durationInFrames} frames (${(props.durationInFrames / props.fps).toFixed(1)}s) at ${props.fps}fps, ${props.width}x${props.height}`
    );

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

    jobQueue.logEvent(
      jobId,
      'RENDERING',
      'info',
      `Bundling Remotion project and starting hardware-accelerated render (${props.durationInFrames} frames)...`
    );

    const renderResult = await renderAgent.render(
      jobId,
      props,
      (progress) => options?.onProgress?.(progress)
    );

    assertNotCancelled();

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
    if (err.message === 'JOB_CANCELLED' || jobQueue.getJob(jobId)?.status === 'CANCELLED') {
      console.log(`[Pipeline] Job ${jobId} was cancelled by user during stage ${currentStage}`);
      return {
        jobId,
        status: 'CANCELLED',
      } as any;
    }

    console.error(`[Pipeline] Pipeline failure at stage ${currentStage} for job ${jobId}:`, err);
    jobQueue.failJob(jobId, currentStage, err);
    throw err;
  }
}
