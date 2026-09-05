import { NextResponse } from 'next/server';
import { jobQueue } from '@/server/queue/JobQueue';
import { runPipeline } from '@/server/pipeline';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jobs = jobQueue.listJobs(100);
    return NextResponse.json({
      success: true,
      jobs,
      count: jobs.length,
    });
  } catch (err: any) {
    console.error('[API] Failed to list jobs:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to list jobs' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body || typeof body.prompt !== 'string' || !body.prompt.trim()) {
      return NextResponse.json(
        { success: false, error: 'Field "prompt" is required and must be non-empty' },
        { status: 400 }
      );
    }

    const mode = body.mode === 'quality' ? 'quality' : 'fast';
    const prompt = body.prompt.trim();
    const voice = typeof body.voice === 'string' && body.voice.trim() ? body.voice.trim() : null;
    const aspectRatio =
      body.aspectRatio === '16:9' || body.aspectRatio === '9:16'
        ? body.aspectRatio
        : mode === 'fast'
        ? '9:16'
        : '16:9';
    const sourceScript = typeof body.sourceScript === 'string' && body.sourceScript.trim()
      ? body.sourceScript.trim()
      : undefined;

    // Enqueue job in SQLite and broadcast job:created
    const job = jobQueue.enqueue({
      prompt,
      mode,
      voice,
      aspectRatio,
    });

    // Execute the pipeline in the background - NEVER await a render inside request handler
    runPipeline(job.id, { sourceScript }).catch((err) => {
      console.error(`[AeroCut Background Job ${job.id}] Pipeline execution failed:`, err);
    });

    return NextResponse.json(
      {
        success: true,
        jobId: job.id,
        job,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('[API] Failed to enqueue job:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to create job' },
      { status: 500 }
    );
  }
}
