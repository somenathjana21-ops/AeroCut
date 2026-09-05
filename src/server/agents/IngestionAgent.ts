import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { probeMedia } from '../utils/ffprobe';
import {
  RAW_ASSETS_DIR,
  LIBRARY_DIR,
  ensureDirectories,
} from '../utils/paths';
import {
  upsertAsset,
  getAssetByPath,
  type AssetRecord,
} from '../db/index';
import {
  AssetSchema,
  AssetCatalogSchema,
  type Asset,
  type AssetCatalog,
  type AssetTag,
} from './schemas';

const SUPPORTED_EXTENSIONS = new Set([
  // Video
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
  '.m4v',
  // Audio
  '.mp3',
  '.wav',
  '.aac',
  '.m4a',
  '.ogg',
  '.flac',
  // Image
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
]);

function getFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function classifyByFilename(filename: string): { tag?: AssetTag; type?: 'video' | 'image' | 'audio' } {
  const lower = filename.toLowerCase();

  if (lower.includes('whoosh')) return { tag: 'sfx-whoosh', type: 'audio' };
  if (lower.includes('riser')) return { tag: 'sfx-riser', type: 'audio' };
  if (lower.includes('impact')) return { tag: 'sfx-impact', type: 'audio' };
  if (lower.includes('ui') || lower.includes('click') || lower.includes('pop')) return { tag: 'sfx-ui', type: 'audio' };
  if (lower.includes('music') || lower.includes('bgm') || lower.includes('bed') || lower.includes('track')) {
    return { tag: 'music', type: 'audio' };
  }
  if (lower.includes('screen') || lower.includes('screencast') || lower.includes('capture')) {
    return { tag: 'screen-capture', type: 'video' };
  }
  if (lower.includes('cam') || lower.includes('talking-head') || lower.includes('head') || lower.includes('speaker')) {
    return { tag: 'talking-head', type: 'video' };
  }
  if (lower.includes('b-roll') || lower.includes('broll') || lower.includes('cut')) {
    return { tag: 'b-roll', type: 'video' };
  }

  return {};
}

function classifyByMediaProperties(
  probe: { type: 'video' | 'image' | 'audio'; durationSec: number; channels?: number },
  filename: string
): AssetTag {
  if (probe.type === 'audio') {
    // Audio under 3 s and mono is SFX; audio over 30 s is music
    if (probe.durationSec <= 3.0) {
      if (filename.toLowerCase().includes('impact')) return 'sfx-impact';
      if (filename.toLowerCase().includes('riser')) return 'sfx-riser';
      return 'sfx-whoosh';
    }
    if (probe.durationSec >= 30.0) {
      return 'music';
    }
    return 'music';
  }

  if (probe.type === 'image') {
    return 'b-roll';
  }

  if (probe.type === 'video') {
    return 'b-roll';
  }

  return 'unknown';
}

function generateStableId(filepath: string, mtime: number): string {
  return crypto
    .createHash('sha256')
    .update(`${filepath}:${mtime}`)
    .digest('hex')
    .slice(0, 16);
}

export class IngestionAgent {
  /**
   * Scans assets/raw/ and assets/library/, probes unchanged files with ffprobe,
   * classifies media, updates SQLite assets table, and returns validated AssetCatalog.
   */
  public async scan(): Promise<AssetCatalog> {
    ensureDirectories();

    const scanPaths = [RAW_ASSETS_DIR, LIBRARY_DIR];
    const candidateFiles: string[] = [];
    for (const p of scanPaths) {
      candidateFiles.push(...getFilesRecursively(p));
    }

    const catalogAssets: Asset[] = [];

    for (const filePath of candidateFiles) {
      try {
        const stat = fs.statSync(filePath);
        const mtime = Math.floor(stat.mtimeMs);
        const filename = path.basename(filePath);

        // 1. Check cache by filepath + mtime
        const cached = getAssetByPath(filePath);
        if (cached && cached.mtime === mtime) {
          const cachedAsset: Asset = {
            id: cached.id,
            filename: cached.filename,
            filepath: cached.filepath,
            type: cached.type,
            tag: cached.tag as AssetTag,
            durationSec: cached.duration_sec ?? 0,
            dimensions:
              cached.width && cached.height
                ? { width: cached.width, height: cached.height }
                : undefined,
            fps: cached.fps ?? undefined,
            hasAudio: cached.has_audio === 1,
          };
          const parsed = AssetSchema.safeParse(cachedAsset);
          if (parsed.success) {
            catalogAssets.push(parsed.data);
            continue;
          }
        }

        // 2. Probe with ffprobe
        let probe;
        try {
          probe = await probeMedia(filePath);
        } catch (probeErr: any) {
          console.warn(`[IngestionAgent] Warning: ffprobe failed on ${filePath}: ${probeErr.message}`);
          const fallbackId = generateStableId(filePath, mtime);
          const unknownAsset: Asset = {
            id: fallbackId,
            filename,
            filepath: filePath,
            type: 'video',
            tag: 'unknown',
            durationSec: 0,
            hasAudio: false,
          };
          catalogAssets.push(unknownAsset);
          upsertAsset({
            id: fallbackId,
            filepath: filePath,
            filename,
            type: 'video',
            tag: 'unknown',
            duration_sec: 0,
            width: null,
            height: null,
            fps: null,
            has_audio: 0,
            mtime,
          });
          continue;
        }

        // 3. Classification order:
        //    a. Filename heuristics
        //    b. Media properties
        //    c. Fallback
        const byName = classifyByFilename(filename);
        let tag: AssetTag = byName.tag || classifyByMediaProperties(probe, filename);
        let type = byName.type || probe.type;

        const assetId = generateStableId(filePath, mtime);
        const asset: Asset = {
          id: assetId,
          filename,
          filepath: filePath,
          type,
          tag,
          durationSec: probe.durationSec,
          dimensions:
            probe.width && probe.height
              ? { width: probe.width, height: probe.height }
              : undefined,
          fps: probe.fps,
          hasAudio: probe.hasAudio,
          codec: probe.codec,
        };

        const validated = AssetSchema.parse(asset);

        // Upsert into SQLite
        upsertAsset({
          id: validated.id,
          filepath: validated.filepath,
          filename: validated.filename,
          type: validated.type,
          tag: validated.tag,
          duration_sec: validated.durationSec,
          width: validated.dimensions?.width ?? null,
          height: validated.dimensions?.height ?? null,
          fps: validated.fps ?? null,
          has_audio: validated.hasAudio ? 1 : 0,
          mtime,
        });

        catalogAssets.push(validated);
      } catch (fileErr: any) {
        // Read-only: never fail the whole scan on a single file error
        console.warn(`[IngestionAgent] Skipping unreadable file ${filePath}: ${fileErr.message}`);
      }
    }

    const catalog: AssetCatalog = {
      scannedAt: new Date().toISOString(),
      assets: catalogAssets,
    };

    return AssetCatalogSchema.parse(catalog);
  }
}

export const ingestionAgent = new IngestionAgent();
