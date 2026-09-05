import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR, OUTPUT_DIR, ASSETS_DIR } from '@/server/utils/paths';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get('path');
    const jobId = searchParams.get('jobId');

    let targetFile = '';

    if (jobId) {
      targetFile = path.resolve(OUTPUT_DIR, `${jobId}.mp4`);
    } else if (requestedPath) {
      targetFile = path.resolve(ROOT_DIR, requestedPath);
    } else {
      return NextResponse.json({ error: 'Missing path or jobId parameter' }, { status: 400 });
    }

    // Security check: ensure path is within ROOT_DIR
    const normalized = path.normalize(targetFile);
    if (!normalized.startsWith(ROOT_DIR) || !fs.existsSync(normalized)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const stat = fs.statSync(normalized);
    const fileSize = stat.size;
    const ext = path.extname(normalized).toLowerCase();

    let contentType = 'application/octet-stream';
    if (ext === '.mp4') contentType = 'video/mp4';
    else if (ext === '.webm') contentType = 'video/webm';
    else if (ext === '.mp3') contentType = 'audio/mpeg';
    else if (ext === '.wav') contentType = 'audio/wav';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';

    const range = request.headers.get('range');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      const fileStream = fs.createReadStream(normalized, { start, end });
      // Convert node stream to web ReadableStream
      const stream = new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk) => controller.enqueue(chunk));
          fileStream.on('end', () => controller.close());
          fileStream.on('error', (err) => controller.error(err));
        },
      });

      return new Response(stream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': contentType,
        },
      });
    }

    const fileStream = fs.createReadStream(normalized);
    const stream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => controller.enqueue(chunk));
        fileStream.on('end', () => controller.close());
        fileStream.on('error', (err) => controller.error(err));
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Length': fileSize.toString(),
        'Content-Type': contentType,
      },
    });
  } catch (err: any) {
    console.error('[API] Media stream error:', err);
    return NextResponse.json({ error: 'Failed to stream media' }, { status: 500 });
  }
}
