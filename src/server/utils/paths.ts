import fs from 'node:fs';
import path from 'node:path';

export const ROOT_DIR = process.cwd();
export const ASSETS_DIR = path.resolve(ROOT_DIR, 'assets');
export const RAW_ASSETS_DIR = path.resolve(ASSETS_DIR, 'raw');
export const LIBRARY_DIR = path.resolve(ASSETS_DIR, 'library');
export const MUSIC_DIR = path.resolve(LIBRARY_DIR, 'music');
export const SFX_DIR = path.resolve(LIBRARY_DIR, 'sfx');
export const PROCESSED_DIR = path.resolve(ASSETS_DIR, 'processed');
export const OUTPUT_DIR = path.resolve(ASSETS_DIR, 'output');
export const LOGS_DIR = path.resolve(ROOT_DIR, 'logs');
export const PUBLIC_DIR = path.resolve(ROOT_DIR, 'public');

/**
 * Ensures all required asset directories and the public/assets junction exist.
 * On Windows, a directory junction lets Remotion staticFile('assets/...')
 * reach the root assets directory cleanly without copying files.
 */
export function ensureDirectories(): void {
  const dirs = [
    RAW_ASSETS_DIR,
    MUSIC_DIR,
    SFX_DIR,
    PROCESSED_DIR,
    OUTPUT_DIR,
    LOGS_DIR,
    PUBLIC_DIR,
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

}

/**
 * Copies a referenced asset to public/ so Remotion's bundler and staticFile()
 * can serve it natively on Windows without requiring symlinks or junctions.
 */
export function syncAssetToPublic(relativeAssetPath: string): void {
  if (!relativeAssetPath) return;
  const src = path.resolve(ROOT_DIR, relativeAssetPath);
  const dest = path.resolve(PUBLIC_DIR, relativeAssetPath);

  if (fs.existsSync(src)) {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    // Only copy if destination doesn't exist or has different mtime/size
    try {
      const srcStat = fs.statSync(src);
      const destStat = fs.existsSync(dest) ? fs.statSync(dest) : null;
      if (!destStat || srcStat.size !== destStat.size || srcStat.mtimeMs !== destStat.mtimeMs) {
        fs.copyFileSync(src, dest);
      }
    } catch {
      // ignore copy errors
    }
  }
}

/**
 * Converts any path (absolute or relative) into a forward-slash relative path
 * that staticFile() can resolve, e.g. "assets/processed/xyz/voice.mp3".
 */
export function toStaticAssetPath(filePath: string): string {
  if (!filePath) return '';
  let relativePath = path.isAbsolute(filePath)
    ? path.relative(ROOT_DIR, filePath)
    : filePath;

  // Convert Windows backslashes to forward slashes and strip leading slashes
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
}
