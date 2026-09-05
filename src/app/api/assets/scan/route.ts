import { NextResponse } from 'next/server';
import { ingestionAgent } from '@/server/agents/IngestionAgent';
import { wsHub } from '@/server/ws/hub';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const catalog = await ingestionAgent.scan();

    // Broadcast assets:updated event to all connected clients
    wsHub.broadcast({
      type: 'assets:updated',
      count: catalog.assets.length,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      count: catalog.assets.length,
      assets: catalog.assets,
      scannedAt: catalog.scannedAt,
    });
  } catch (err: any) {
    console.error('[API] Failed to trigger asset scan:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to scan assets' },
      { status: 500 }
    );
  }
}
