import crypto from 'node:crypto';
import {
  createJob,
  getJob,
  updateJobStatus,
  updateJobEdl,
  updateJobAudioTimeline,
  updateJobProps,
  updateJobOutput,
  insertJobEvent,
  listJobs,
  type JobRecord,
  type JobStatus,
} from '../db/index';
import { wsHub } from '../ws/hub';

export interface EnqueueJobInput {
  prompt: string;
  mode: 'fast' | 'quality';
  aspectRatio?: '9:16' | '16:9';
  voice?: string | null;
  id?: string;
}

export class JobQueue {
  private static VALID_TRANSITIONS: Record<JobStatus, Set<JobStatus>> = {
    QUEUED: new Set(['PLANNING', 'CANCELLED', 'FAILED']),
    PLANNING: new Set(['SYNTHESIZING', 'CANCELLED', 'FAILED']),
    SYNTHESIZING: new Set(['COMPOSING', 'CANCELLED', 'FAILED']),
    COMPOSING: new Set(['RENDERING', 'CANCELLED', 'FAILED']),
    RENDERING: new Set(['COMPLETE', 'CANCELLED', 'FAILED']),
    COMPLETE: new Set(),
    FAILED: new Set(),
    CANCELLED: new Set(),
  };

  /**
   * Enqueues a new job in SQLite with status QUEUED,
   * writes the initial event, and broadcasts job:created.
   */
  public enqueue(input: EnqueueJobInput): JobRecord {
    const id = input.id || `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const job = createJob({
      id,
      mode: input.mode,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      voice: input.voice,
    });

    // Persist event before broadcasting
    insertJobEvent({
      jobId: id,
      stage: 'QUEUE',
      level: 'info',
      message: `Job enqueued in ${input.mode} mode`,
      payloadJson: JSON.stringify({ prompt: input.prompt, mode: input.mode }),
    });

    wsHub.broadcast({
      type: 'job:created',
      jobId: id,
      status: 'QUEUED',
      job,
    });

    return job;
  }

  public getJob(id: string): JobRecord | undefined {
    return getJob(id);
  }

  public listJobs(limit = 50): JobRecord[] {
    return listJobs(limit);
  }

  /**
   * Transitions job state in SQLite before broadcasting to WebSocket clients.
   */
  public transition(
    jobId: string,
    nextStatus: JobStatus,
    payload?: {
      message?: string;
      edlJson?: string;
      audioTimelineJson?: string;
      propsJson?: string;
      outputPath?: string;
      error?: string;
    }
  ): void {
    const current = getJob(jobId);
    if (!current) {
      throw new Error(`Cannot transition non-existent job: ${jobId}`);
    }

    const allowed = JobQueue.VALID_TRANSITIONS[current.status];
    if (!allowed.has(nextStatus)) {
      throw new Error(
        `Invalid job state transition from '${current.status}' to '${nextStatus}' for job ${jobId}`
      );
    }

    // Persist stage artifact if provided
    if (payload?.edlJson) {
      updateJobEdl(jobId, payload.edlJson);
    }
    if (payload?.audioTimelineJson) {
      updateJobAudioTimeline(jobId, payload.audioTimelineJson);
    }
    if (payload?.propsJson) {
      updateJobProps(jobId, payload.propsJson);
    }

    // Persist status update
    if (nextStatus === 'COMPLETE' && payload?.outputPath) {
      updateJobOutput(jobId, payload.outputPath);
    } else {
      updateJobStatus(jobId, nextStatus, payload?.error);
    }

    // Persist transition event
    insertJobEvent({
      jobId,
      stage: nextStatus,
      level: nextStatus === 'FAILED' ? 'error' : 'info',
      message: payload?.message || `Job transitioned to ${nextStatus}`,
      payloadJson: payload ? JSON.stringify(payload) : null,
    });

    // Broadcast update after persistence
    wsHub.broadcast({
      type: 'job:status',
      jobId,
      status: nextStatus,
      previousStatus: current.status,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Cancels an active job, records cancellation event, and broadcasts status.
   */
  public cancelJob(jobId: string): boolean {
    const current = getJob(jobId);
    if (!current) return false;

    if (current.status === 'COMPLETE' || current.status === 'FAILED' || current.status === 'CANCELLED') {
      return false;
    }

    this.transition(jobId, 'CANCELLED', {
      message: 'Job cancelled by user',
    });
    return true;
  }

  /**
   * Fails a job with error details, persists to SQLite, and broadcasts job:failed.
   */
  public failJob(jobId: string, stage: string, error: Error | string): void {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const current = getJob(jobId);

    if (
      current &&
      current.status !== 'FAILED' &&
      current.status !== 'COMPLETE' &&
      current.status !== 'CANCELLED'
    ) {
      updateJobStatus(jobId, 'FAILED', errorMessage);

      insertJobEvent({
        jobId,
        stage,
        level: 'error',
        message: `Job failed at stage ${stage}: ${errorMessage}`,
        payloadJson: JSON.stringify({ error: errorMessage, stack: error instanceof Error ? error.stack : undefined }),
      });

      wsHub.broadcast({
        type: 'job:failed',
        jobId,
        stage,
        error: errorMessage,
      });
    }
  }

  /**
   * Logs a progress or diagnostic event to SQLite and broadcasts to WS.
   */
  public logEvent(
    jobId: string,
    stage: string,
    level: 'info' | 'warn' | 'error',
    message: string,
    payload?: any
  ): void {
    insertJobEvent({
      jobId,
      stage,
      level,
      message,
      payloadJson: payload ? JSON.stringify(payload) : null,
    });

    wsHub.broadcast({
      type: 'job:event',
      jobId,
      stage,
      level,
      message,
      payload,
    });
  }
}

export const jobQueue = new JobQueue();
