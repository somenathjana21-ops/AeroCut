import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { RAW_ASSETS_DIR, ensureDirectories } from '@/server/utils/paths';
import { ingestionAgent } from '@/server/agents/IngestionAgent';
import { wsHub } from '@/server/ws/hub';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    ensureDirectories();

    const formData = await request.formData();
    const files: File[] = [];

    // Support both multiple "files" or single "file" or multiple keys
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided in form data' },
        { status: 400 }
      );
    }

    const uploadedFiles: string[] = [];

    for (const file of files) {
      // Clean and sanitize filename
      const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetPath = path.join(RAW_ASSETS_DIR, safeName);

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      fs.writeFileSync(targetPath, buffer);
      uploadedFiles.push(safeName);
    }

    // Trigger IngestionAgent to index newly uploaded files into SQLite
    const catalog = await ingestionAgent.scan();

    // Broadcast assets:updated event to all connected clients
    wsHub.broadcast({
      type: 'assets:updated',
      count: catalog.assets.length,
      timestamp: new Date().toISOString(),
      uploaded: uploadedFiles,
    });

    return NextResponse.json({
      success: true,
      uploaded: uploadedFiles,
      count: catalog.assets.length,
      scannedAt: catalog.scannedAt,
    });
  } catch (err: any) {
    console.error('[API] Failed to upload files:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'File upload failed' },
      { status: 500 }
    );
  }
}
