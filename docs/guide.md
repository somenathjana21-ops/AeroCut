# Build Guide

Six phases. Each has a build prompt, a verification prompt, manual checks, and known failure modes.

**Start a new Antigravity conversation for each phase.** Fresh context every time; the docs on disk carry the memory. Long conversations degrade, and by Phase 4 an agent that started at Phase 1 will have forgotten why Phase 1 decisions were made.

**Commit after each green phase.** `git add -A && git commit -m "Phase N green"`.

---

## Phase 0 — Setup (you, not the agent)

Do this by hand. It takes two minutes and an agent adds no value.

```
mkdir aerocut-engine
cd aerocut-engine
git init
mkdir .agents\skills\aerocut
mkdir .agents\workflows
mkdir docs
```

Copy the seven docs into `docs/`, `SKILL.md` into `.agents/skills/aerocut/`, and `aerocut-verify.md` into `.agents/workflows/`.

Then open the folder as your Antigravity workspace and confirm the skill is visible — ask the agent: *"What skills do you have available in this workspace?"* If `aerocut` isn't listed, the folder is `.agent` instead of `.agents`, or the frontmatter is malformed.

Verify your prerequisites now, before Phase 1:

```
node -v && python --version && ffprobe -version && nvidia-smi
```

---

## Phase 1 — Scaffold and environment gate

**Goal:** a working project skeleton and a script that proves the machine can actually do this.

The point of this phase is not the code. It's a hard gate so that when Phase 5 fails you already know it isn't drivers.

### Build prompt

```
Read docs/requirements.md, docs/dependencies.md and docs/architecture.md
before starting.

Execute Phase 1 of the AeroCut build: project scaffold and environment
verification.

1. Initialize a Next.js project in the current directory:
   - TypeScript, App Router, Tailwind, src/ directory, no ESLint for now
   - Do not create a new subfolder; scaffold into the existing root

2. Install Node dependencies. Resolve latest versions at install time --
   do not copy version numbers from the docs. The one hard constraint is
   remotion >= 4.0.484, and all @remotion/* packages must be on the exact
   same version as each other.
   - remotion, @remotion/cli, @remotion/player, @remotion/bundler,
     @remotion/renderer, @remotion/media-utils
   - ws, better-sqlite3, chokidar, zod, dotenv, execa
   - lucide-react, clsx, tailwind-merge
   - dev: tsx, concurrently, @types/ws, @types/better-sqlite3

3. Create the full directory tree from section 1 of docs/architecture.md.
   Add .gitkeep files in the empty asset directories.

4. Create remotion.config.ts:
   import { Config } from '@remotion/cli/config';
   Config.setVideoImageFormat('jpeg');
   Config.setOverwriteOutput(true);
   Config.setChromiumOpenGlRenderer('angle');
   Config.setHardwareAcceleration('if-possible');

   Do NOT use setFfmpegOverride and do NOT set a CRF value. Remotion has
   native NVENC support and CRF is incompatible with hardware encoders.

5. Set up the Python environment:
   - python -m venv python-services/venv
   - python-services/requirements.txt with edge-tts, faster-whisper,
     soundfile, numpy, pydantic (minimum versions, not pins)
   - Install it. Install torch separately with the CUDA index URL matching
     what nvidia-smi reports; fall back to the CPU index if that fails.

6. Write scripts/verify-environment.ts. It must CHECK each item and print
   [PASS] or [FAIL] with the detected value. It must not assume anything:
   - node version >= 20
   - python version between 3.10 and 3.12, using the venv interpreter
   - ffprobe on PATH
   - nvidia-smi present, and parse the driver version
   - remotion package version >= 4.0.484
   - all @remotion/* versions identical
   - the actual NVENC smoke test:
     ffmpeg -f lavfi -i testsrc=duration=1:size=640x360:rate=30
       -c:v h264_nvenc -b:v 2M -y <tmp>/nvenc_probe.mp4
     PASS only if the file is produced. Report the ffmpeg error on failure.
   - faster-whisper importable in the venv
   Exit code 1 if any check fails. Print a summary table.

7. Create .env.example per section 7 of docs/architecture.md, and a
   .gitignore covering node_modules, .next, venv, assets/processed,
   assets/output, assets/raw, logs, *.db, .env.

8. package.json scripts:
   "verify": "tsx scripts/verify-environment.ts"
   "dev": "concurrently \"next dev\" \"tsx src/server/ws-server.ts\""
   "studio": "remotion studio"

Do not write any pipeline, agent or component code in this phase.
Report which checks pass and which fail on this machine.
```

### Verification prompt

```
Check if Phase 1 is working as intended. Run npm run verify and show me the
complete output. Then confirm, by actually reading the files:
- remotion.config.ts uses setHardwareAcceleration and does NOT use
  setFfmpegOverride or any CRF setting
- every @remotion/* package in package.json is on the same version
- the directory tree matches docs/architecture.md section 1
Report anything that does not match rather than summarising it as fine.
```

### Manual checks

```
npm run verify              → all [PASS], exit 0
npx remotion versions       → one version, no mismatch warnings
python-services\venv\Scripts\python.exe -c "import faster_whisper; print('ok')"
```

Open `remotion.config.ts` and read it yourself. This is the file most likely to have been written from stale training data.

### Known failures

**`better-sqlite3` fails to compile.** No prebuilt binary for your Node version. Either install Visual Studio Build Tools with the C++ workload, or switch to `node:sqlite` (built into Node 22+). Keep the swap behind `src/server/db/index.ts`.

**NVENC smoke test fails but `nvidia-smi` works.** Your *system* FFmpeg lacks NVENC. This does not block the build — Remotion uses its own bundled FFmpeg which has it. Note it and move on.

**Agent installs `@remotion/core`.** It doesn't exist. The package is `remotion`.

**Agent scaffolds Next.js into a subfolder.** `create-next-app` does this when the directory isn't empty. Tell it to scaffold into `.` and merge.

---

## Phase 2 — Python audio services

**Goal:** text in, voice out, with word-level timings that actually match the waveform.

### Build prompt

```
Read docs/agents.md section "Agent 3 - Audio" and docs/architecture.md
section 6 before starting.

Execute Phase 2 of the AeroCut build: the Python audio services.

1. python-services/tts_synthesizer.py
   - Reads ONE JSON object from stdin:
     { "text": str, "voice": str, "outputPath": str, "rate": str|null }
   - Uses edge-tts to synthesize an MP3
   - Trims leading silence. This is critical: the hook rule requires the
     first audible voice frame at frame 0, and edge-tts routinely emits
     100-300ms of leading silence. Detect the first sample above a -45 dBFS
     threshold and trim to 20ms before it.
   - Measures the true duration of the trimmed file
   - Writes ONE JSON object to stdout:
     { "outputPath": str, "durationSec": float, "trimmedMs": float }
   - ALL logging, warnings and progress go to stderr. Nothing but the
     result JSON may ever reach stdout.

2. python-services/whisper_transcriber.py
   - Reads ONE JSON object from stdin:
     { "audioPath": str, "model": str, "device": str, "computeType": str }
   - device "auto" resolves to cuda if available, else cpu
   - Runs faster-whisper with word_timestamps=True
   - Writes ONE JSON object to stdout:
     { "durationSec": float, "text": str,
       "words": [{ "word": str, "start": float, "end": float }] }
   - Strips leading/trailing whitespace from each word token
   - On CUDA failure (missing cuDNN etc), catches the exception, logs to
     stderr, retries on CPU with compute_type int8, and sets
     "fellBackToCpu": true in the output
   - Again: stdout is JSON only. faster-whisper prints model download
     progress by default -- make sure it goes to stderr.

3. src/server/utils/python-runner.ts
   - runPython<T>(scriptPath, payload): Promise<T>
   - Resolves the venv interpreter per-platform (Scripts/python.exe on
     Windows, bin/python otherwise)
   - Spawns with execa, passes payload as JSON on stdin, parses stdout
   - Sets PYTHONIOENCODING=utf-8 in the child env
   - On JSON parse failure, throws an error that includes the first 500
     chars of both stdout and stderr. Do not throw a bare parse error.
   - 120 second timeout

4. scripts/test-audio-pipeline.ts
   - Synthesizes: "Transformers changed everything about how machines
     understand language. Here is why."
   - Runs the transcriber on the result
   - Prints: audio duration, trimmed ms, word count, first five words with
     timestamps, whether CUDA or CPU was used, total elapsed time
   - Asserts and reports clearly if: the MP3 is missing or zero bytes, the
     word array is empty, or the last word's end timestamp exceeds the
     audio duration

Add "test:audio": "tsx scripts/test-audio-pipeline.ts" to package.json.
```

### Verification prompt

```
Check if Phase 2 is working as intended. Run npm run test:audio and show me
the complete output including timings.

Then verify by reading the source, not by assuming:
- both Python scripts write ONLY JSON to stdout, with all logging on stderr
- tts_synthesizer.py actually implements silence trimming, and report the
  threshold it uses
- python-runner.ts sets PYTHONIOENCODING and includes stderr in its error
  messages on parse failure

If the word timestamps look wrong -- out of order, overlapping, or extending
past the audio duration -- say so rather than reporting success.
```

### Manual checks

Play the generated MP3. It must start on the word "Transformers" with no audible gap.

Check the timestamps by hand: word count should be around 15, `start` values monotonically increasing, final `end` within 0.3 s of the reported duration.

```
npm run test:audio          → completes in under 15s on CPU
```

### Known failures

**`JSON.parse` fails with "Unexpected token".** Something reached stdout that isn't JSON — usually a Whisper download progress bar or a Python warning. Find it and route it to stderr.

**`Could not locate cudnn_ops64_9.dll`.** GPU Whisper needs cuDNN 9. `pip install nvidia-cudnn-cu12 nvidia-cublas-cu12` inside the venv, or accept CPU fallback. CPU with `int8` transcribes a 45-second script in a few seconds; this is not worth a long fight.

**`UnicodeEncodeError` on Windows.** `PYTHONIOENCODING=utf-8` wasn't set in the child environment.

**Audio still has a gap at the start.** Trimming was implemented as a fixed offset rather than actual silence detection. It must analyse the waveform.

**Timestamps drift progressively.** The transcriber ran on concatenated audio rather than per-beat files. Per-beat, then offset.

---

## Phase 3 — Remotion components

**Goal:** compositions that render correctly from hand-written fixture props, before any agent exists to generate them.

Building this before the agents is deliberate. It gives you a known-good render target, so Phase 4 failures are unambiguously agent failures.

### Build prompt

```
Read docs/Brief.md in full, plus docs/agents.md "Agent 4 - Composition"
for the props schema and docs/architecture.md section 2 for the import
boundary rule.

Execute Phase 3 of the AeroCut build: Remotion components and compositions.

CRITICAL CONSTRAINT: nothing in src/remotion/ may import from
src/server/ or from any Node builtin (fs, path, child_process). These
files are bundled and run inside headless Chrome. A single Node import
breaks the bundle with an error that will not point you here.

1. src/remotion/schema.ts
   Zod schemas exactly as specified in docs/agents.md Agent 4: SceneSchema,
   WordSchema, CompositionPropsSchema. Export the inferred TS types. This
   file is the shared contract between the server and the render bundle --
   it must stay free of any runtime dependency.

2. Components in src/remotion/components/:

   KineticSubtitle.tsx -- Fast Mode captions
   - props: words, currentFrame-derived active word, theme
   - groups words into cards of 3-5
   - active word: spring scale 1.0 -> 1.18, damping 12 stiffness 180,
     accent colour
   - inactive words in the card: 85% opacity, foreground colour
   - positioned in the lower third, 12% safe margin from bottom
   - heavy weight, tight tracking, text shadow for legibility on any bg

   PhraseSubtitle.tsx -- Quality Mode captions
   - two lines max, phrase-level, no per-word animation
   - fade in/out only, 8% bottom safe margin

   PatternInterrupt.tsx -- the 3-second hook
   - active for the first 90 frames at 30fps
   - scale punch 1.15 -> 1.0 on a spring
   - brief chromatic-aberration-style offset flash in the first 8 frames
   - accepts the hook line as a slam-in title card

   DynamicMedia.tsx -- b-roll and image container
   - <Video> or <Img> based on file extension
   - Ken Burns driven by interpolate() with parameters passed in as props,
     never computed inside the component
   - object-fit cover, centered, fills the frame

   CodeTerminal.tsx -- code panel
   - monospace, line-by-line reveal timed across the scene duration
   - simple token-based highlighting, no external syntax library

   TitleCard.tsx -- full-screen statement, optional background media

   AudioLayer.tsx -- <Audio> for voice, music with volume as a frame
   function implementing the ducking envelope, and SFX at their frames

3. Compositions in src/remotion/compositions/:

   FastShort.tsx -- 1080x1920, 30fps
   - PatternInterrupt over the first 90 frames
   - one <Sequence> per scene, from startFrame for durationInFrames
   - archetype switch selects the component per scene
   - KineticSubtitle spanning the whole composition
   - AudioLayer spanning the whole composition

   QualityExplainer.tsx -- 1920x1080, 30fps
   - same structure, PhraseSubtitle, eased motion instead of springs

4. src/remotion/Root.tsx
   - register both with calculateMetadata so width, height, fps and
     durationInFrames come from the input props rather than being hardcoded
   - defaultProps from the fixtures below so Studio opens with something
     to look at

5. src/remotion/fixtures/sample-fast.ts and sample-quality.ts
   - hand-written CompositionProps with 5-6 scenes and around 30 words with
     plausible timestamps
   - reference only assets that exist, or none at all

6. src/remotion/index.ts -- registerRoot(RemotionRoot)

7. Self-host fonts in public/fonts/ and load via a local @font-face. Do NOT
   fetch webfonts at render time; a network hiccup mid-render produces a
   video in fallback fonts.

Every animation must derive from useCurrentFrame(). No CSS transitions, no
setTimeout, no Math.random(), no Date.now() -- the renderer evaluates frames
independently and out of order.
```

### Verification prompt

```
Check if Phase 3 is working as intended.

1. Run npm run studio and confirm both compositions load without errors.
2. Render both fixtures to actual files:
   npx remotion render FastShort out/test-fast.mp4 --props=<fixture json>
   npx remotion render QualityExplainer out/test-quality.mp4 --props=<...>
   Use --log=verbose and show me the encoder line from the output.
3. Confirm by grepping src/remotion/ that nothing imports from src/server/
   or from fs, path, or child_process.
4. Confirm no component uses Math.random, Date.now, setTimeout or a CSS
   transition.

Report the exact encoder line. I need to know whether it says
"hardware accelerated: true".
```

### Manual checks

Open Studio, scrub the timeline. Watch specifically for: subtitles moving with the scrub, the hook punch in the first three seconds, and no black frames.

Play `out/test-fast.mp4`. Check the first frame isn't black and the last word isn't clipped.

In the verbose render log, find:

```
Encoder: h264_nvenc, hardware accelerated: true
```

If it says `libx264, hardware accelerated: false`, NVENC didn't engage — check Remotion version ≥ 4.0.484 and the config file.

### Known failures

**Bundle error mentioning `fs` or `path`.** Something in `src/remotion/` imported server code. Trace the import chain from the component named in the error.

**Subtitles don't move when scrubbing.** Animation is driven by state or a timer instead of `useCurrentFrame()`.

**Video renders but is black.** Assets referenced by absolute Windows path. Use `staticFile()` with paths relative to `public/`.

**Render is slow with GPU idle.** `gl: 'angle'` missing, so Chrome is compositing in software. Also check `concurrency` — too high exhausts RAM and slows things down.

**CRF error from the encoder.** A `crf` value is set somewhere alongside hardware acceleration. They're incompatible. Remove it, use `videoBitrate`.

---

## Phase 4 — Agents and pipeline

**Goal:** prompt in, MP4 out, headless. This is the phase that matters.

### Build prompt

```
Read docs/agents.md IN FULL before starting. It contains the exact Zod
schemas and system prompts for all five agents. Implement them as
specified rather than designing your own.

Also read docs/architecture.md sections 3, 5 and 6.

Execute Phase 4 of the AeroCut build: agents, queue and orchestrator.

1. src/server/db/ -- schema.sql exactly as in docs/architecture.md section
   5, plus index.ts with the connection, migration on boot, and typed
   query helpers. Keep every SQL statement in this directory.

2. src/server/llm/client.ts
   - ONE exported function: generateStructured<T>(systemPrompt, userPrompt,
     schema: ZodSchema<T>, opts): Promise<T>
   - Provider selected by LLM_PROVIDER env var
   - On Zod validation failure: retry up to 2 more times, feeding the
     formatted validation errors back into the prompt as a correction
   - After 3 failures, throw with all validation errors attached
   - No other file in the codebase may know which provider is in use

3. src/server/agents/IngestionAgent.ts
   - Scans assets/raw/, probes with ffprobe via execa
   - Classification per docs/agents.md Agent 1: filename heuristics first,
     media properties second, vision model only if both are inconclusive
   - Caches by filepath + mtime; skip re-probing unchanged files
   - Upserts into the assets table
   - Read-only with respect to source files

4. src/server/agents/NarrativeAgent.ts
   - Uses the exact system prompt from docs/agents.md Agent 2
   - Validates against EDLSchema INCLUDING the superRefine duration and
     scene-length checks
   - Passes the asset catalog as compact JSON: id, tag, durationSec only

5. src/server/agents/AudioAgent.ts
   - Per-beat synthesis via runPython, never whole-script
   - Real measured durations replace the LLM's estimates everywhere
   - Per-beat transcription, then offset word timings by absolute beat start
   - Concatenates beat audio with ffmpeg concat demuxer
   - Places SFX at each transition +0.05s
   - Builds duck regions from voice-active spans
   - On Whisper failure: proportional fallback timing, set
     alignmentQuality 'estimated', do not fail the job

6. src/server/agents/CompositionAgent.ts
   - Merges EDL + AudioTimeline into CompositionProps
   - ALL timing converts to integer frames here. No seconds past this point.
   - durationInFrames = ceil(totalDurationSec * fps) + 15 frame tail
   - Asset paths resolved for staticFile()
   - Generates Ken Burns parameters
   - Validates against CompositionPropsSchema from src/remotion/schema.ts

7. src/server/agents/RenderAgent.ts
   - bundle() then selectComposition() then renderMedia()
   - hardwareAcceleration 'if-possible', codec h264, videoBitrate from env
   - NEVER set crf
   - chromiumOptions gl 'angle'
   - concurrency = floor(cpus/2), overridable
   - onProgress broadcasts to the WS hub
   - Post-render verification: file exists, size > 0, ffprobe duration
     within 0.5s of expected, video stream present
   - On failure dump serveUrl, inputProps and stderr to logs/<jobId>/

8. src/server/queue/JobQueue.ts -- SQLite-backed state machine:
   QUEUED -> PLANNING -> SYNTHESIZING -> COMPOSING -> RENDERING -> COMPLETE
   with FAILED and CANCELLED terminals. Persist before broadcasting.

9. src/server/pipeline.ts -- runs the five stages in order, updates job
   state at each transition, persists edl_json / audio_timeline_json /
   props_json to the job row as it goes, catches and records failures.

10. scripts/run-job.ts -- the CLI the Antigravity Skill invokes:
    npx tsx scripts/run-job.ts --prompt "..." --mode fast [--voice X]
      [--script path] [--json]
    With --json, prints ONE result object to stdout and all progress to
    stderr.

11. scripts/test-pipeline-headless.ts -- end to end with a fixed prompt,
    printing the timing of each stage.

Do not build any UI in this phase.
```

### Verification prompt

```
Check if Phase 4 is working as intended.

Run: npx tsx scripts/test-pipeline-headless.ts
Show me the full output with per-stage timings.

Then show me, from the database:
- the generated EDL for that job (edl_json), formatted
- the first 10 word timestamps from audio_timeline_json
- the final job status and output path

Then verify:
- assets/output/ contains a non-zero MP4
- ffprobe on it reports the expected duration and a video stream
- the render log shows which encoder was used

If the EDL beats violate the Fast Mode duration cap or scene length range,
tell me -- do not report success on a job that produced a file but broke
the constraints.
```

### Manual checks

**Watch the video.** All of it. This is the phase where "it rendered" and "it's correct" diverge.

Check specifically:
- Subtitles land on the words being spoken, throughout — not just at the start
- Music ducks when voice is active
- SFX land at cuts, not between them
- No asset repeats in adjacent scenes
- Total runtime is within the mode's cap

Read the EDL. Is the hook line actually a hook, or is it "In this video we'll explore…"? That's the most common Phase 4 quality failure and it's a prompt problem, not a code problem.

### Known failures

**EDL consistently overruns the duration cap.** Strengthen the constraint in the system prompt and let the superRefine retry loop do its work. Add the running total to the retry correction message.

**Subtitles drift progressively.** Whisper ran on concatenated audio instead of per-beat. Or the beat offsets weren't applied.

**Subtitles are off by exactly one beat's worth.** Silence trimming happened after duration measurement instead of before.

**`staticFile` can't find assets.** Windows backslashes, or paths outside `public/`. Normalise to forward slashes and copy or symlink assets where the bundler can reach them.

**LLM returns markdown-fenced JSON.** Strip fences before parsing, and add "no markdown fence" to the prompt — it's already in the system prompt in `docs/agents.md`.

**Render succeeds but the last word is cut off.** The frame tail wasn't added in `CompositionAgent`.

**Same b-roll clip in every scene.** The narrative agent isn't tracking usage. Pass previously-used ids in the prompt context.

---

## Phase 5 — Control console

**Goal:** the localhost UI. Everything already works headless; this is a front door.

### Build prompt

```
Read docs/architecture.md sections 4 and 5, and docs/PRD.md section 5.6.

Execute Phase 5 of the AeroCut build: the localhost control console.

IMPORTANT: the WebSocket server is a SEPARATE process on its own port.
Next.js App Router route handlers cannot hold an HTTP upgrade to a
persistent socket. Do not attempt to put WebSockets in app/api/.

1. src/server/ws-server.ts -- standalone ws server on WS_PORT (3001).
   Broadcast hub: any part of the pipeline can publish, all connected
   clients receive. Message types: job:status, job:event, render:progress,
   assets:updated. Heartbeat ping every 30s.

2. API routes in src/app/api/:
   - GET  /api/assets      -> current catalog from SQLite
   - POST /api/assets/scan -> trigger IngestionAgent, return count
   - GET  /api/jobs        -> job list, newest first
   - POST /api/jobs        -> enqueue, return jobId IMMEDIATELY. The
                              pipeline runs in the background. Never await
                              a render inside a request handler.
   - GET  /api/jobs/[id]   -> job detail with events
   - DELETE /api/jobs/[id] -> cancel
   - POST /api/upload      -> write files into assets/raw/

3. Components in src/app/components/:
   - SystemHealthBar: NVENC availability, queue depth, WS connection state
   - AssetDropzone: drag and drop into assets/raw/, live catalog with
     type and tag badges
   - JobConfigForm: prompt textarea, mode toggle, voice select, optional
     script upload, submit
   - AgentActivityStream: live WS feed, grouped by stage, with per-stage
     elapsed time. Auto-scroll with a pause-on-manual-scroll.
   - RemotionPreview: @remotion/player fed the props of the selected job.
     Only mount once props_json exists.
   - JobHistory: past jobs, status, duration, output link

4. src/app/page.tsx -- three columns: config left, activity center,
   preview right. Collapse to stacked below 1280px.

5. Style per docs/Brief.md section 5: near-black background, near-white
   text, one accent. Dense and functional, not decorative.

6. Wire the WS client with automatic reconnect and a visible
   disconnected state.

Progress must be visible for every stage, not just rendering. A job that
sits in PLANNING for 20 seconds with no feedback reads as frozen.
```

### Verification prompt

```
Check if Phase 5 is working as intended.

Start npm run dev. Then, using the browser:
1. Load localhost:3000 and confirm the health bar shows NVENC status and a
   connected WebSocket
2. Drop a test image into the dropzone; confirm it appears in the catalog
   with a correct type and tag
3. Submit a Fast Mode job and confirm the activity stream shows all five
   stages live, not just the render
4. Confirm the Remotion player loads the preview once props exist
5. Confirm the resulting MP4 appears in job history and plays

Take screenshots at each step. Report anything that appears frozen or shows
no feedback for more than a few seconds.
```

### Manual checks

Submit a job, then kill the WS server. The UI should show disconnected and recover when you restart it.

Submit two jobs quickly. The second should queue rather than run concurrently.

Refresh mid-render. State should restore from SQLite, not vanish.

### Known failures

**WebSocket won't connect.** Wrong port, or the server didn't start. Check `concurrently` is running both.

**UI freezes during render.** The render was awaited inside the route handler. `POST /api/jobs` must return immediately.

**Player errors on mount.** It mounted before `props_json` existed. Guard the render.

**Progress only appears during the render stage.** The earlier agents aren't broadcasting. Every stage transition publishes.

---

## Phase 6 — Skill packaging

**Goal:** make it usable from inside Antigravity by prompt alone.

### Build prompt

```
Read the existing .agents/skills/aerocut/SKILL.md and
docs/architecture.md section 8.

Execute Phase 6 of the AeroCut build: Antigravity integration and polish.

1. Verify scripts/run-job.ts matches what SKILL.md documents. If the CLI
   flags or the JSON output shape have drifted from the skill file, fix
   the SKILL.md to match reality -- the skill file must describe the
   actual interface, not an aspirational one.

2. Make --json output strictly parseable: ONE JSON object on stdout,
   everything else on stderr. Shape:
   { "ok": bool, "jobId": str, "outputPath": str|null,
     "durationSec": num|null, "error": str|null,
     "warnings": [str] }

3. Add scripts/doctor.ts -- a single command that reports current system
   state: environment checks, DB reachable, asset count, last 5 jobs and
   their outcomes, disk space in assets/output. This is what the skill
   runs when something is wrong.

4. Write the root README.md: what it is, prerequisites, install, the two
   ways to run it, troubleshooting table, and a note that the audio library
   ships empty and must be filled with licensed material.

5. Add npm scripts: "doctor", "job", "scan".

6. Clean up: remove unused scaffolding from create-next-app, delete dead
   imports, make sure .gitignore covers assets/raw, assets/processed,
   assets/output, logs, *.db and .env.

7. Test the whole loop: in a NEW Antigravity conversation, ask
   "make me a 30 second vertical short about how transformers work"
   and confirm the agent finds the skill, runs the CLI, and reports the
   output path.
```

### Verification prompt

```
Check if Phase 6 is working as intended.

1. Run npm run doctor and show the output.
2. Run: npx tsx scripts/run-job.ts --prompt "test" --mode fast --json
   Confirm stdout is exactly one parseable JSON object with nothing else.
3. Confirm SKILL.md documents the actual CLI flags that run-job.ts accepts,
   flag by flag.
4. Confirm .gitignore excludes assets/raw, assets/processed, assets/output,
   logs, *.db and .env.
```

### Final manual check

Open a completely new Antigravity conversation. Type:

> make me a 30 second vertical short explaining what a transformer model is, use whatever b-roll is in the project

If the agent finds the skill, runs the pipeline, and hands you a path to a watchable MP4 — you're done.

---

## Troubleshooting index

| Symptom | Likely cause | Where |
|---|---|---|
| `Unexpected token` parsing Python output | Non-JSON on stdout | Phase 2 |
| `cudnn_ops64_9.dll` not found | cuDNN missing | Phase 2 |
| Bundle error mentioning `fs` | Server import in `src/remotion/` | Phase 3 |
| Encoder says `libx264` | Remotion < 4.0.484, or config not applied | Phase 3 |
| CRF incompatibility error | `crf` set with hardware acceleration | Phase 3 |
| Video renders black | Absolute asset paths | Phase 3 |
| Subtitles drift | Whisper on concatenated audio | Phase 4 |
| EDL overruns duration | Narrative prompt too weak | Phase 4 |
| Last word clipped | Missing frame tail | Phase 4 |
| UI freezes on submit | Render awaited in route handler | Phase 5 |
| Skill not found | `.agent` vs `.agents`, or bad frontmatter | Phase 0 |
