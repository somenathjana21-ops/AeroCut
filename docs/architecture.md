# Architecture

## 1. Directory layout

```
aerocut-engine/
│
├── .agents/                            # Antigravity integration
│   ├── skills/
│   │   └── aerocut/
│   │       └── SKILL.md                # frontmatter + agent instructions
│   ├── workflows/
│   │   └── aerocut-verify.md           # /aerocut-verify slash command
│   └── rules/
│       └── project.md                  # optional standing constraints
│
├── assets/
│   ├── raw/                            # user drop zone — read-only to the system
│   ├── library/
│   │   ├── music/                      # your licensed beds
│   │   └── sfx/                        # whooshes, risers, impacts
│   ├── processed/<jobId>/              # generated voice, per-beat audio
│   └── output/                         # final MP4 + sidecar JSON
│
├── docs/                               # this spec
│
├── logs/<jobId>/                       # failure dumps
│
├── python-services/
│   ├── venv/
│   ├── requirements.txt
│   ├── tts_synthesizer.py              # stdin JSON → mp3, stdout JSON
│   └── whisper_transcriber.py          # mp3 path → stdout word JSON
│
├── scripts/
│   ├── verify-environment.ts           # Phase 1 gate
│   ├── test-audio-pipeline.ts          # Phase 2 gate
│   ├── test-render.ts                  # Phase 3 gate
│   └── run-job.ts                      # Phase 4 gate + the CLI the Skill calls
│
├── public/
│   └── fonts/                          # self-hosted, bundled at render time
│
├── src/
│   ├── app/                            # Next.js console
│   │   ├── api/
│   │   │   ├── assets/route.ts
│   │   │   ├── jobs/route.ts
│   │   │   ├── jobs/[id]/route.ts
│   │   │   └── upload/route.ts
│   │   ├── components/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   │
│   ├── remotion/                       # PURE — no Node imports below this line
│   │   ├── components/
│   │   │   ├── KineticSubtitle.tsx
│   │   │   ├── PhraseSubtitle.tsx
│   │   │   ├── PatternInterrupt.tsx
│   │   │   ├── DynamicMedia.tsx
│   │   │   ├── CodeTerminal.tsx
│   │   │   ├── TitleCard.tsx
│   │   │   └── AudioLayer.tsx
│   │   ├── compositions/
│   │   │   ├── FastShort.tsx
│   │   │   └── QualityExplainer.tsx
│   │   ├── Root.tsx
│   │   ├── index.ts
│   │   └── schema.ts                   # Zod props — shared with the server
│   │
│   └── server/
│       ├── agents/
│       │   ├── IngestionAgent.ts
│       │   ├── NarrativeAgent.ts
│       │   ├── AudioAgent.ts
│       │   ├── CompositionAgent.ts
│       │   └── RenderAgent.ts
│       ├── llm/client.ts               # only file that knows the provider
│       ├── db/{index.ts,schema.sql}
│       ├── queue/JobQueue.ts
│       ├── utils/{python-runner.ts,ffprobe.ts,paths.ts}
│       ├── pipeline.ts                 # the orchestrator
│       └── ws-server.ts                # standalone process
│
├── .env.example
├── next.config.mjs
├── package.json
├── remotion.config.ts
└── tsconfig.json
```

## 2. The one boundary that matters

**`src/remotion/` must never import from `src/server/`.**

Remotion components are bundled by webpack and executed inside headless Chrome. A single transitive import of `fs`, `better-sqlite3`, or anything Node-only breaks the bundle, and the error surfaces as an opaque failure deep in the render rather than at build time.

The shared contract between the two worlds is `src/remotion/schema.ts` — pure Zod types, importable from both directions. `CompositionAgent` produces data matching that schema; the compositions consume it. Nothing else crosses.

If you find yourself wanting to read a file from inside a component, the answer is to pass the data in as a prop.

## 3. Data flow

```
User drops files in assets/raw/
        │
        ├─ chokidar fires ──► IngestionAgent ──► asset_catalog table
        │
User submits prompt + mode (console or Skill CLI)
        │
        ▼
   JobQueue.enqueue()  →  status: QUEUED
        │
        ▼  pipeline.ts picks it up
        │
   ┌────────────────────────────────────────────┐
   │ 1. load AssetCatalog          → PLANNING   │
   │ 2. NarrativeAgent  → EDL      → validate   │
   │ 3. AudioAgent      → Timeline → SYNTHESIZING│
   │ 4. CompositionAgent → Props   → validate   │
   │ 5. RenderAgent     → MP4      → RENDERING  │
   └────────────────────────────────────────────┘
        │        │
        │        └─► every transition broadcast over WS
        ▼
   status: COMPLETE, artifact path recorded
```

State machine:

```
QUEUED → PLANNING → SYNTHESIZING → COMPOSING → RENDERING → COMPLETE
   └─────────┴──────────┴──────────────┴───────────┴──────► FAILED
                                                             CANCELLED
```

Each transition writes to SQLite before broadcasting. A crash mid-job leaves a recoverable record rather than a job stuck in an in-memory state that vanished.

## 4. Processes

Three, in dev:

| Process | Port | Command |
|---|---|---|
| Next.js console | 3000 | `next dev` |
| WebSocket telemetry | 3001 | `tsx src/server/ws-server.ts` |
| Remotion Studio (optional) | 3002 | `remotion studio` |

Run the first two together via `concurrently`.

**The WebSocket server is separate on purpose.** Next.js App Router route handlers work on Web Request/Response and cannot hold an HTTP upgrade to a persistent socket. The original spec's `app/api/ws/route.ts` cannot work. A standalone `ws` server on its own port is the straightforward answer; the browser connects to `ws://localhost:3001` directly.

Long renders also must not run inside a Next request. `POST /api/jobs` enqueues and returns immediately; the pipeline runs in the background and reports progress over the socket.

## 5. Database

Four tables, SQLite via `better-sqlite3`:

```sql
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  filepath TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  type TEXT NOT NULL,
  tag TEXT NOT NULL,
  duration_sec REAL,
  width INTEGER, height INTEGER, fps REAL,
  has_audio INTEGER,
  mtime INTEGER NOT NULL,           -- cache key for re-probing
  scanned_at TEXT NOT NULL
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  prompt TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  voice TEXT,
  edl_json TEXT,                    -- persisted for resume + debugging
  audio_timeline_json TEXT,
  props_json TEXT,
  output_path TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  stage TEXT NOT NULL,
  level TEXT NOT NULL,              -- info | warn | error
  message TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_job_events_job ON job_events(job_id, id);
CREATE INDEX idx_jobs_status ON jobs(status);
```

Persisting the EDL and props as JSON on the job row is what makes a job resumable and, more importantly, debuggable. When a video comes out wrong, you read `edl_json` and see precisely which beat was misplanned.

## 6. Python bridge

Node never imports Python. It spawns a subprocess and reads JSON from stdout.

```ts
// src/server/utils/python-runner.ts
export async function runPython<T>(script: string, payload: unknown): Promise<T> {
  const python = process.platform === 'win32'
    ? path.join('python-services', 'venv', 'Scripts', 'python.exe')
    : path.join('python-services', 'venv', 'bin', 'python');

  const { stdout } = await execa(python, [script], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return JSON.parse(stdout) as T;
}
```

Contract, strictly enforced:
- Input: one JSON object on stdin
- Output: one JSON object on stdout, nothing else
- Diagnostics, warnings and progress: **stderr only**

That last rule is not optional. `faster-whisper` prints model download progress by default, and if any of it reaches stdout your `JSON.parse` fails with a message that tells you nothing useful.

Set `PYTHONIOENCODING=utf-8` when spawning on Windows, or non-ASCII text in the script will raise a `UnicodeEncodeError` from the default cp1252 console encoding.

## 7. Configuration

```env
# LLM
LLM_PROVIDER=gemini
GEMINI_API_KEY=
LLM_MODEL=gemini-2.5-flash

# Voice
TTS_ENGINE=edge-tts
TTS_VOICE=en-US-ChristopherNeural
WHISPER_MODEL=base
WHISPER_DEVICE=auto              # auto | cuda | cpu
WHISPER_COMPUTE_TYPE=int8

# Render
HARDWARE_ACCELERATION=if-possible
VIDEO_BITRATE_FAST=8M
VIDEO_BITRATE_QUALITY=12M
RENDER_CONCURRENCY=auto
CHROMIUM_GL=angle

# Theme
THEME_BACKGROUND=#0A0A0B
THEME_FOREGROUND=#FAFAFA
THEME_ACCENT=#4F8CFF

# Ports
WS_PORT=3001
```

## 8. Antigravity integration

The Skill is a thin wrapper. `SKILL.md` tells the agent how to invoke the CLI and how to read results; it does not reimplement the pipeline.

```
Antigravity agent
      │  reads .agents/skills/aerocut/SKILL.md
      ▼
  npx tsx scripts/run-job.ts --prompt "..." --mode fast
      │
      ▼
  pipeline.ts  (same code path as the web console)
      │
      ▼
  JSON result on stdout → agent reports the output path
```

One pipeline, two front doors. The Skill and the console must never diverge — if a capability exists in one and not the other, it belongs in `pipeline.ts` and both should reach it.
