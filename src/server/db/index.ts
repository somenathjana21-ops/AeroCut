import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export interface AssetRecord {
  id: string;
  filepath: string;
  filename: string;
  type: 'video' | 'image' | 'audio';
  tag: string;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  has_audio: number; // 0 or 1
  mtime: number;
  scanned_at: string;
}

export type JobStatus =
  | 'QUEUED'
  | 'PLANNING'
  | 'SYNTHESIZING'
  | 'COMPOSING'
  | 'RENDERING'
  | 'COMPLETE'
  | 'FAILED'
  | 'CANCELLED';

export interface JobRecord {
  id: string;
  status: JobStatus;
  mode: 'fast' | 'quality';
  prompt: string;
  aspect_ratio: '9:16' | '16:9';
  voice: string | null;
  edl_json: string | null;
  audio_timeline_json: string | null;
  props_json: string | null;
  output_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobEventRecord {
  id: number;
  job_id: string;
  stage: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  payload_json: string | null;
  created_at: string;
}

let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = process.env.DATABASE_PATH
    ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
    : path.resolve(process.cwd(), 'aerocut.db');

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run initial schema migration
  const schemaPath = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1')), 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);
  } else {
    // Fallback if schema.sql resolved relatively
    const fallbackPath = path.resolve(process.cwd(), 'src', 'server', 'db', 'schema.sql');
    if (fs.existsSync(fallbackPath)) {
      const schemaSql = fs.readFileSync(fallbackPath, 'utf8');
      db.exec(schemaSql);
    }
  }

  dbInstance = db;
  return dbInstance;
}

// ---------------------------------------------------------------------------
// Typed Query Helpers: Assets
// ---------------------------------------------------------------------------

export function upsertAsset(asset: Omit<AssetRecord, 'scanned_at'> & { scanned_at?: string }): void {
  const db = getDatabase();
  const scannedAt = asset.scanned_at || new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO assets (
      id, filepath, filename, type, tag, duration_sec,
      width, height, fps, has_audio, mtime, scanned_at
    ) VALUES (
      @id, @filepath, @filename, @type, @tag, @duration_sec,
      @width, @height, @fps, @has_audio, @mtime, @scanned_at
    )
    ON CONFLICT(filepath) DO UPDATE SET
      id = excluded.id,
      filename = excluded.filename,
      type = excluded.type,
      tag = excluded.tag,
      duration_sec = excluded.duration_sec,
      width = excluded.width,
      height = excluded.height,
      fps = excluded.fps,
      has_audio = excluded.has_audio,
      mtime = excluded.mtime,
      scanned_at = excluded.scanned_at
  `);

  stmt.run({
    id: asset.id,
    filepath: asset.filepath,
    filename: asset.filename,
    type: asset.type,
    tag: asset.tag,
    duration_sec: asset.duration_sec ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
    fps: asset.fps ?? null,
    has_audio: asset.has_audio ? 1 : 0,
    mtime: asset.mtime,
    scanned_at: scannedAt,
  });
}

export function getAssetById(id: string): AssetRecord | undefined {
  const db = getDatabase();
  const stmt = db.prepare<string, AssetRecord>('SELECT * FROM assets WHERE id = ?');
  return stmt.get(id);
}

export function getAssetByPath(filepath: string): AssetRecord | undefined {
  const db = getDatabase();
  const stmt = db.prepare<string, AssetRecord>('SELECT * FROM assets WHERE filepath = ?');
  return stmt.get(filepath);
}

export function getAllAssets(): AssetRecord[] {
  const db = getDatabase();
  const stmt = db.prepare<[], AssetRecord>('SELECT * FROM assets ORDER BY scanned_at DESC');
  return stmt.all();
}

// ---------------------------------------------------------------------------
// Typed Query Helpers: Jobs
// ---------------------------------------------------------------------------

export interface CreateJobInput {
  id: string;
  mode: 'fast' | 'quality';
  prompt: string;
  aspectRatio?: '9:16' | '16:9';
  voice?: string | null;
}

export function createJob(input: CreateJobInput): JobRecord {
  const db = getDatabase();
  const now = new Date().toISOString();
  const aspectRatio = input.aspectRatio || (input.mode === 'fast' ? '9:16' : '16:9');
  const stmt = db.prepare(`
    INSERT INTO jobs (
      id, status, mode, prompt, aspect_ratio, voice,
      edl_json, audio_timeline_json, props_json, output_path,
      error, created_at, updated_at
    ) VALUES (
      @id, 'QUEUED', @mode, @prompt, @aspect_ratio, @voice,
      NULL, NULL, NULL, NULL,
      NULL, @created_at, @updated_at
    )
  `);

  stmt.run({
    id: input.id,
    mode: input.mode,
    prompt: input.prompt,
    aspect_ratio: aspectRatio,
    voice: input.voice ?? null,
    created_at: now,
    updated_at: now,
  });

  const created = getJob(input.id);
  if (!created) {
    throw new Error(`Failed to create job with id: ${input.id}`);
  }
  return created;
}

export function getJob(id: string): JobRecord | undefined {
  const db = getDatabase();
  const stmt = db.prepare<string, JobRecord>('SELECT * FROM jobs WHERE id = ?');
  return stmt.get(id);
}

export function updateJobStatus(id: string, status: JobStatus, error?: string | null): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE jobs
    SET status = ?, error = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(status, error ?? null, now, id);
}

export function updateJobEdl(id: string, edlJson: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE jobs
    SET edl_json = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(edlJson, now, id);
}

export function updateJobAudioTimeline(id: string, audioTimelineJson: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE jobs
    SET audio_timeline_json = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(audioTimelineJson, now, id);
}

export function updateJobProps(id: string, propsJson: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE jobs
    SET props_json = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(propsJson, now, id);
}

export function updateJobOutput(id: string, outputPath: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE jobs
    SET output_path = ?, status = 'COMPLETE', updated_at = ?
    WHERE id = ?
  `);
  stmt.run(outputPath, now, id);
}

export function listJobs(limit = 50): JobRecord[] {
  const db = getDatabase();
  const stmt = db.prepare<number, JobRecord>('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?');
  return stmt.all(limit);
}

// ---------------------------------------------------------------------------
// Typed Query Helpers: Job Events
// ---------------------------------------------------------------------------

export interface InsertJobEventInput {
  jobId: string;
  stage: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  payloadJson?: string | null;
}

export function insertJobEvent(input: InsertJobEventInput): JobEventRecord {
  const db = getDatabase();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO job_events (
      job_id, stage, level, message, payload_json, created_at
    ) VALUES (
      @job_id, @stage, @level, @message, @payload_json, @created_at
    )
  `);

  const info = stmt.run({
    job_id: input.jobId,
    stage: input.stage,
    level: input.level,
    message: input.message,
    payload_json: input.payloadJson ?? null,
    created_at: now,
  });

  const id = Number(info.lastInsertRowid);
  const getStmt = db.prepare<number, JobEventRecord>('SELECT * FROM job_events WHERE id = ?');
  const event = getStmt.get(id);
  if (!event) {
    throw new Error(`Failed to retrieve inserted job event ${id}`);
  }
  return event;
}

export function getJobEvents(jobId: string): JobEventRecord[] {
  const db = getDatabase();
  const stmt = db.prepare<string, JobEventRecord>(
    'SELECT * FROM job_events WHERE job_id = ? ORDER BY id ASC'
  );
  return stmt.all(jobId);
}
