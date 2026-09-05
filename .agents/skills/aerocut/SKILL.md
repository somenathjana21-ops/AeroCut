---
name: aerocut
description: Generates finished videos from a text prompt and the media in this project. Handles scripting, voiceover, word-level subtitles, motion graphics and GPU-accelerated rendering through the local AeroCut pipeline. Use when the user asks to make, edit, render or produce a video, short, reel, explainer or clip from the assets in this workspace.
---

# AeroCut

An automated video pipeline in this workspace. It takes a prompt and the media in `assets/raw/`, and produces a rendered MP4 in `assets/output/`.

Move this file to `.agents/skills/aerocut/SKILL.md` in the workspace root. It will not be discovered anywhere else.

## When to use this

- "Make me a short about X"
- "Turn this article into a video"
- "Render a 16:9 explainer using the footage in raw"
- "Redo that last video but slower / longer / with a different voice"

## When not to use this

- The user wants to generate footage that doesn't exist. AeroCut edits and composes supplied media; it does not synthesise video. Suggest generating clips elsewhere and dropping them in `assets/raw/`.
- The user wants frame-level manual control. There is no timeline UI. Point them at re-prompting or hand-editing the EDL.
- The user is asking how the pipeline works rather than asking for a video. Read `docs/` and answer.

## Before running anything

Check `assets/raw/` has media in it:

```
npm run scan
```

This runs ingestion and prints the catalog. If it's empty, tell the user to add media before proceeding — a job with no assets produces text-only output, which is rarely what someone wants.

## Running a job

```
npx tsx scripts/run-job.ts --prompt "<the user's request>" --mode <fast|quality> --json
```

Flags:

| Flag | Required | Values | Notes |
|---|---|---|---|
| `--prompt` | yes | string | Pass the user's intent, not a rewritten version |
| `--mode` | yes | `fast` \| `quality` | See the decision tree below |
| `--voice` | no | edge-tts voice id | Default `en-US-ChristopherNeural` |
| `--script` | no | path | An existing script or article to work from |
| `--json` | no | flag | One JSON object on stdout; use this when calling programmatically |

Result shape on stdout:

```json
{
  "ok": true,
  "jobId": "...",
  "outputPath": "assets/output/....mp4",
  "durationSec": 42.3,
  "error": null,
  "warnings": []
}
```

Progress goes to stderr. Fast Mode typically completes in 60–120 seconds; Quality Mode scales with length.

## Choosing the mode

```
Did the user name a platform?
├─ TikTok / Reels / Shorts / "vertical"  → fast
├─ YouTube / "explainer" / "longform"    → quality
└─ Not stated
   ├─ Requested duration under 60s       → fast
   ├─ Requested duration over 60s        → quality
   └─ No duration given
      ├─ Topic is a hook, hot take, or   → fast
      │  single punchy idea
      └─ Topic needs explanation,        → quality
         comparison, or code
```

If it's genuinely ambiguous, ask. One short question beats a two-minute render of the wrong format.

## After a job completes

Report the output path and the runtime. Do not describe the video's contents as if you watched it — you didn't.

If you want to say something about what was made, read the EDL from the job row and summarise the beat structure. That's a factual claim you can support.

Offer one concrete next step: adjust the hook, change the voice, switch modes, or re-run with different assets.

## When something fails

Run the diagnostic first, before speculating:

```
npm run doctor
```

Then map what you see:

| Doctor output | Action |
|---|---|
| Environment check fails | Report which one. Driver and Python problems need the user, not you |
| Asset count is 0 | Ask the user to add media to `assets/raw/` |
| Last job FAILED | Read `logs/<jobId>/` for the actual error before guessing |
| Disk space low | Old renders in `assets/output/` can be cleared |

If the failure was an EDL validation error, the narrative planning stage produced something out of spec. Re-running often succeeds — LLM planning is not deterministic. Re-run once before escalating.

If the render failed with an NVENC error, re-run with `HARDWARE_ACCELERATION=disable`. It will be slower but it will complete.

Never edit files under `src/remotion/` to fix a job-specific problem. Those are shared components; a change there affects every future video. Job-specific problems are prompt or asset problems.

## Project constraints

- `src/remotion/` must never import from `src/server/` or from Node builtins. It runs inside headless Chrome
- Never set a CRF value on a hardware-accelerated render — use `videoBitrate`
- All `@remotion/*` packages stay on one version
- Source files in `assets/raw/` are read-only; the pipeline never modifies them

## Reference

Read these only when you need them, not on every invocation:

| File | Contains |
|---|---|
| `docs/PRD.md` | Mode definitions and functional spec |
| `docs/Brief.md` | Creative rules the output must satisfy |
| `docs/agents.md` | The five agent contracts and Zod schemas |
| `docs/architecture.md` | Directory layout and data flow |
| `docs/guide.md` | The phased build plan and troubleshooting index |
