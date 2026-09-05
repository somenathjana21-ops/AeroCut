import { NextResponse } from 'next/server';
import { getJob, getJobEvents } from '@/server/db/index';
import { jobQueue } from '@/server/queue/JobQueue';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }> | { id: string };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const { id } = params;

    const job = getJob(id);
    if (!job) {
      return NextResponse.json(
        { success: false, error: `Job not found: ${id}` },
        { status: 404 }
      );
    }

    const events = getJobEvents(id);

    return NextResponse.json({
      success: true,
      job,
      events,
    });
  } catch (err: any) {
    console.error('[API] Failed to get job details:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to fetch job' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const { id } = params;

    const job = getJob(id);
    if (!job) {
      return NextResponse.json(
        { success: false, error: `Job not found: ${id}` },
        { status: 404 }
      );
    }

    if (job.status === 'COMPLETE' || job.status === 'FAILED' || job.status === 'CANCELLED') {
      return NextResponse.json(
        {
          success: false,
          error: `Job cannot be cancelled in state '${job.status}'`,
          job,
        },
        { status: 400 }
      );
    }

    const cancelled = jobQueue.cancelJob(id);

    return NextResponse.json({
      success: cancelled,
      jobId: id,
      status: 'CANCELLED',
      message: 'Job cancelled successfully',
    });
  } catch (err: any) {
    console.error('[API] Failed to cancel job:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to cancel job' },
      { status: 500 }
    );
  }
}
