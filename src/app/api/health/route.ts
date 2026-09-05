import { NextResponse } from 'next/server';
import { getDatabase } from '@/server/db/index';
import { execa } from 'execa';

export const dynamic = 'force-dynamic';

let cachedNvenc: boolean | null = null;
let lastNvencCheck = 0;

async function checkNvencAvailability(): Promise<boolean> {
  const now = Date.now();
  if (cachedNvenc !== null && now - lastNvencCheck < 60000) {
    return cachedNvenc;
  }

  try {
    const { stdout } = await execa('ffmpeg', ['-encoders']);
    cachedNvenc = stdout.includes('h264_nvenc');
    lastNvencCheck = now;
    return cachedNvenc;
  } catch {
    cachedNvenc = false;
    lastNvencCheck = now;
    return false;
  }
}

export async function GET() {
  try {
    const db = getDatabase();

    const activeStmt = db.prepare(
      "SELECT COUNT(*) as count FROM jobs WHERE status IN ('QUEUED', 'PLANNING', 'SYNTHESIZING', 'COMPOSING', 'RENDERING')"
    );
    const activeRow = activeStmt.get() as { count: number } | undefined;
    const queueDepth = activeRow?.count ?? 0;

    const totalStmt = db.prepare('SELECT COUNT(*) as count FROM jobs');
    const totalRow = totalStmt.get() as { count: number } | undefined;
    const totalJobs = totalRow?.count ?? 0;

    const assetStmt = db.prepare('SELECT COUNT(*) as count FROM assets');
    const assetRow = assetStmt.get() as { count: number } | undefined;
    const totalAssets = assetRow?.count ?? 0;

    const nvencAvailable = await checkNvencAvailability();

    return NextResponse.json({
      status: 'ok',
      nvencAvailable,
      queueDepth,
      totalJobs,
      totalAssets,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[API] Health check failed:', err);
    return NextResponse.json(
      {
        status: 'error',
        error: err?.message || 'Health check failed',
      },
      { status: 500 }
    );
  }
}
