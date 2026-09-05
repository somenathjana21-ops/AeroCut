import { NextResponse } from 'next/server';
import { getAllAssets } from '@/server/db/index';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const assets = getAllAssets();
    return NextResponse.json({
      success: true,
      assets,
      count: assets.length,
    });
  } catch (err: any) {
    console.error('[API] Failed to fetch assets:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to fetch assets' },
      { status: 500 }
    );
  }
}
