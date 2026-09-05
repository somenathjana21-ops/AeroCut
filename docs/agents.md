# Agent Contracts

Five stages, run in sequence. Each is a **pure function**: typed input, validated typed output, no shared mutable state.

That framing matters. These are not five long-running services and not five parallel autonomous agents negotiating with each other. Each is one LLM call (or one deterministic function) whose output is parsed by a Zod schema before the next stage is allowed to start. Build them as anything more elaborate and you will spend your time debugging coordination instead of making videos.

```
  assets/raw/ + task prompt
            │
            ▼
  ┌──────────────────────┐
  │ 1. IngestionAgent    │  deterministic — ffprobe, no LLM
  └──────────┬───────────┘
             │  AssetCatalog
             ▼
  ┌──────────────────────┐
  │ 2. NarrativeAgent    │  LLM — the hard one
  └──────────┬───────────┘
             │  EditDecisionList
             ▼
  ┌──────────────────────┐
  │ 3. AudioAgent        │  deterministic — TTS + Whisper
  └──────────┬───────────┘
             │  AudioTimeline
             ▼
  ┌──────────────────────┐
  │ 4. CompositionAgent  │  mostly deterministic — EDL+audio → props
  └──────────┬───────────┘
             │  CompositionProps
             ▼
  ┌──────────────────────┐
  │ 5. RenderAgent       │  deterministic — Remotion render
  └──────────┬───────────┘
             ▼
      assets/output/<jobId>.mp4
```

Only stage 2 is genuinely an LLM agent. Stages 1, 3 and 5 are deterministic pipelines that happen to be named "agents" because they occupy slots in the flow. Stage 4 is mostly mapping logic with an optional LLM assist for asset selection. Knowing which stages are which tells you where to spend your debugging time.

---

## Agent 1 — Ingestion

**Type:** deterministic. No LLM unless classification is genuinely ambiguous.

**Job:** enumerate `assets/raw/`, probe each file with `ffprobe`, classify, emit a catalog.

**Classification order:**
1. Filename heuristics — `whoosh`, `riser`, `impact`, `music`, `bgm`, `screen`, `cam` are strong signals
2. Media properties — audio under 3 s and mono is SFX; audio over 30 s is music; video with a single dominant face region is talking-head
3. Only if both are inconclusive, one vision-model call on a mid-point frame

**Output:**

```ts
const AssetSchema = z.object({
  id: z.string(),                          // stable hash of path + mtime
  filename: z.string(),
  filepath: z.string(),
  type: z.enum(['video', 'image', 'audio']),
  tag: z.enum([
    'talking-head', 'b-roll', 'screen-capture',
    'music', 'sfx-riser', 'sfx-impact', 'sfx-whoosh', 'sfx-ui',
    'unknown',
  ]),
  durationSec: z.number().nonnegative(),
  dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
  fps: z.number().optional(),
  hasAudio: z.boolean(),
  codec: z.string().optional(),
});

const AssetCatalogSchema = z.object({
  scannedAt: z.string().datetime(),
  assets: z.array(AssetSchema),
});
```

**Rules:**
- Never modify, move or rename a source file. Ingestion is strictly read-only
- `id` must be stable across runs so the same file keeps its identity
- Unreadable file → tag `unknown`, log, continue. One corrupt asset must not fail the scan
- Cache results by path + mtime; re-probing an unchanged 4K file on every job is pure waste

---

## Agent 2 — Narrative Director

**Type:** LLM. **This is the agent that determines whether the product works.**

**Job:** turn a task prompt (plus optional script/article/URL) and the asset catalog into an ordered list of Beats.

**Output:**

```ts
const BeatSchema = z.object({
  index: z.number().int().nonnegative(),
  voiceover: z.string().min(1),
  archetype: z.enum([
    'TitleCard', 'KineticText', 'AssetCut',
    'CodeView', 'SplitCompare', 'DiagramStep', 'Outro',
  ]),
  energy: z.number().int().min(1).max(10),
  preferredAssetIds: z.array(z.string()).default([]),
  codeSnippet: z.object({
    language: z.string(),
    code: z.string(),
  }).optional(),
  transitionIn: z.enum(['cut', 'whoosh', 'impact', 'fade']).default('cut'),
  estimatedDurationSec: z.number().positive(),
});

const EDLSchema = z.object({
  mode: z.enum(['fast', 'quality']),
  aspectRatio: z.enum(['9:16', '16:9']),
  title: z.string(),
  hookLine: z.string(),
  beats: z.array(BeatSchema).min(2),
  musicAssetId: z.string().optional(),
}).superRefine((edl, ctx) => {
  const total = edl.beats.reduce((s, b) => s + b.estimatedDurationSec, 0);
  if (edl.mode === 'fast' && total > 45) {
    ctx.addIssue({ code: 'custom',
      message: `Fast Mode capped at 45s, plan is ${total.toFixed(1)}s` });
  }
  const [lo, hi] = edl.mode === 'fast' ? [1.2, 2.5] : [4, 9];
  edl.beats.forEach((b, i) => {
    if (b.estimatedDurationSec < lo || b.estimatedDurationSec > hi) {
      ctx.addIssue({ code: 'custom', path: ['beats', i],
        message: `Beat ${i}: ${b.estimatedDurationSec}s outside ${lo}-${hi}s` });
    }
  });
  if (edl.mode === 'fast' && edl.beats[0].archetype !== 'TitleCard'
      && edl.beats[0].archetype !== 'KineticText') {
    ctx.addIssue({ code: 'custom', message: 'Fast Mode must open with a hook beat' });
  }
});
```

**System prompt:**

```
You are the Narrative Director for an automated video pipeline.

You receive: a task prompt, optionally a source script or article, and a
catalog of available media assets with their tags and durations.

You return: an ordered Edit Decision List of Beats. Nothing else. No prose,
no explanation, no markdown fence.

MODE CONSTRAINTS

Fast Mode (9:16 vertical short):
- Total runtime 45 seconds maximum. This is a hard cap.
- Each beat lasts 1.2 to 2.5 seconds.
- Beat 0 is the hook. It must state a specific number, contradict a common
  assumption, or open a loop. It must not begin with "In this video" or any
  variant of introducing yourself or the topic.
- Energy starts at 8 or higher and never drops below 5.

Quality Mode (16:9 landscape):
- Runtime as requested by the user.
- Each beat lasts 4 to 9 seconds.
- Beat 0 may be a cold open or a title card.
- Energy varies naturally between 3 and 8.

VOICEOVER

- Write for the ear. Short sentences. No semicolons, no parentheticals.
- Spell out numbers and symbols as they should be spoken.
- Estimate duration at roughly 2.6 words per second and set
  estimatedDurationSec accordingly.
- Never write stage directions, speaker labels or bracketed notes. Every
  character you write will be spoken aloud.

ASSET SELECTION

- Reference assets by their catalog id in preferredAssetIds.
- Never use the same asset in two consecutive beats.
- Match tags to archetypes: b-roll for AssetCut, screen-capture for CodeView.
- If nothing suitable exists, use KineticText and leave preferredAssetIds
  empty. Do not invent asset ids.

ARCHETYPES

TitleCard    - full-screen statement, minimal or no background media
KineticText  - word-level animated text over gradient or motion field
AssetCut     - b-roll or image fills the frame, subtitles overlaid
CodeView     - syntax-highlighted code panel, revealed line by line
SplitCompare - two items side by side
DiagramStep  - one step of a built-up diagram
Outro        - closing statement or call to action

Return only JSON matching the provided schema.
```

**Retry policy:** on Zod failure, feed the validation errors back and retry twice. If a third attempt fails, fail the job loudly with the errors attached. Do not paper over an invalid EDL with defaults — you'll get a video that's subtly wrong and much harder to diagnose than one that didn't render.

**Where you'll spend your time.** Expect to iterate on this prompt more than everything else combined. The common failure modes, in order of frequency: beats that overrun the duration cap, hook lines that are actually introductions, and voiceover text with bracketed stage directions in it that then get read aloud.

---

## Agent 3 — Audio

**Type:** deterministic pipeline. No LLM.

**Job:** synthesise voice per beat, extract word timings, build the audio timeline.

**Sequence:**
1. For each beat, `edge-tts` → `assets/processed/<jobId>/beat-<n>.mp3`
2. **Trim leading silence** — critical for the zero-pre-roll hook rule
3. Measure true duration with `ffprobe`; this replaces the LLM's estimate
4. `faster-whisper` with `word_timestamps=True` per beat file
5. Offset each beat's word timings by that beat's absolute start
6. Concatenate beat audio into `voice.mp3`
7. Place SFX at each transition, +0.05 s after the cut
8. Compute the ducking envelope

**Output:**

```ts
const WordSchema = z.object({
  word: z.string(),
  start: z.number(),      // absolute seconds from video start
  end: z.number(),
  beatIndex: z.number().int(),
});

const AudioTimelineSchema = z.object({
  jobId: z.string(),
  voiceTrackPath: z.string(),
  totalDurationSec: z.number().positive(),
  beats: z.array(z.object({
    index: z.number().int(),
    audioPath: z.string(),
    startSec: z.number(),
    endSec: z.number(),
  })),
  words: z.array(WordSchema),
  sfxPlacements: z.array(z.object({
    assetId: z.string(),
    atSec: z.number(),
    gainDb: z.number().default(-2),
  })),
  music: z.object({
    assetId: z.string(),
    gainDb: z.number(),
    duckToDb: z.number(),
    duckRegions: z.array(z.object({ start: z.number(), end: z.number() })),
  }).optional(),
});
```

**Rules:**
- Per-beat synthesis, not whole-script. Beat boundaries must stay exact and a single long file makes that impossible
- Real measured durations override the narrative agent's estimates everywhere downstream
- Whisper on the generated audio, never on the input text — the waveform is the ground truth for what the viewer hears
- If Whisper fails, fall back to proportional word timing within the known beat duration and flag `alignmentQuality: 'estimated'`. Degraded subtitles beat no video

---

## Agent 4 — Composition

**Type:** deterministic mapping, with an optional LLM assist for asset selection.

**Job:** merge EDL and AudioTimeline into typed props for a pre-built Remotion composition.

**This agent does not write TSX.** It fills a schema. Every visual capability exists as a version-controlled component; this agent chooses which to use and with what data.

**Output:**

```ts
const SceneSchema = z.object({
  beatIndex: z.number().int(),
  archetype: z.string(),
  startFrame: z.number().int(),
  durationInFrames: z.number().int().positive(),
  assetPath: z.string().optional(),
  text: z.string().optional(),
  codeSnippet: z.object({ language: z.string(), code: z.string() }).optional(),
  energy: z.number().min(1).max(10),
  transitionIn: z.string(),
  kenBurns: z.object({
    fromScale: z.number(), toScale: z.number(),
    fromX: z.number(), fromY: z.number(),
  }).optional(),
});

const CompositionPropsSchema = z.object({
  jobId: z.string(),
  mode: z.enum(['fast', 'quality']),
  width: z.number().int(),
  height: z.number().int(),
  fps: z.number().int(),
  durationInFrames: z.number().int().positive(),
  scenes: z.array(SceneSchema),
  words: z.array(WordSchema),
  audio: z.object({
    voicePath: z.string(),
    musicPath: z.string().optional(),
    musicGainDb: z.number(),
    duckToDb: z.number(),
    sfx: z.array(z.object({ path: z.string(), atFrame: z.number().int() })),
  }),
  theme: z.object({
    background: z.string(),
    foreground: z.string(),
    accent: z.string(),
    fontFamily: z.string(),
    monoFontFamily: z.string(),
  }),
});
```

**Rules:**
- All timing converts to **integer frames** here. Seconds must not survive past this boundary — floating-point drift in a frame-indexed renderer produces off-by-one flicker
- `durationInFrames = ceil(totalDurationSec * fps)` plus a small tail so the last word isn't clipped
- Asset paths resolve to what Remotion's `staticFile()` can reach. Absolute Windows paths with backslashes will not work inside the bundle
- Ken Burns parameters are generated here, not in the component. Components stay pure

---

## Agent 5 — Render

**Type:** deterministic. No LLM.

**Job:** bundle, render, verify, report.

```ts
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';

const serveUrl = await bundle({ entryPoint: 'src/remotion/index.ts' });

const composition = await selectComposition({
  serveUrl,
  id: props.mode === 'fast' ? 'FastShort' : 'QualityExplainer',
  inputProps: props,
});

await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  outputLocation: `assets/output/${jobId}.mp4`,
  inputProps: props,
  hardwareAcceleration: 'if-possible',
  videoBitrate: props.mode === 'fast' ? '8M' : '12M',
  concurrency: Math.max(1, Math.floor(os.cpus().length / 2)),
  chromiumOptions: { gl: 'angle' },
  onProgress: ({ renderedFrames, encodedFrames, progress }) => {
    ws.broadcast({ type: 'render:progress', jobId, progress, renderedFrames, encodedFrames });
  },
});
```

**Rules:**
- `hardwareAcceleration: 'if-possible'`, never `'required'` — a job that renders slowly beats a job that doesn't render
- **Never set `crf` alongside hardware acceleration.** They are mutually incompatible. Use `videoBitrate`
- `gl: 'angle'` on Windows for DirectX-backed compositing. Without it Chrome falls back to software rendering and renders are noticeably slower
- Verify the output before declaring success: file exists, non-zero size, `ffprobe` reports the expected duration ±0.5 s and a video stream
- On failure, dump serve URL, input props and full stderr to `logs/<jobId>/`
- Log the encoder line from verbose output (`Encoder: h264_nvenc, hardware accelerated: true`) so you know whether NVENC actually engaged

**Concurrency tuning.** Remotion renders frames in parallel headless Chrome instances. Too many exhausts RAM and paradoxically slows the render. Half your logical cores is a good default; tune from there by watching memory during a render.
