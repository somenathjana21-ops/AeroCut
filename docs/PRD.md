# PRD — AeroCut

## 1. What it is

AeroCut turns a folder of raw media plus a task prompt into a finished, rendered MP4 without a human touching a timeline.

The user drops footage, images, music and SFX into `assets/raw/`, writes a task prompt, and the system produces narration, word-aligned subtitles, an edit decision list, a Remotion composition, and a hardware-encoded video.

It runs entirely on the local machine, controlled either through an Antigravity Skill or a localhost web console.

## 2. What it is not

Naming the boundaries early prevents scope creep later:

- **Not a generative video model.** It edits and composes media you supply. It does not synthesise footage. If you want generated scenes, use Veo and drop the output into `assets/raw/`.
- **Not a manual NLE.** There is no drag-on-timeline UI. Correction happens by re-prompting or by editing the EDL JSON, not by nudging clips.
- **Not multi-user or hosted.** Localhost, single operator, no auth. Do not expose the port.
- **Not a broadcast finisher.** No colour grading, no keyframe-level control, no multi-cam sync.

## 3. Users

**The technical explainer creator.** Has a script or an article and some screen recordings. Wants a clean 16:9 explainer with code panels, diagram beats and readable subtitles, without spending an evening in Premiere.

**The volume shorts producer.** Has a topic and a folder of b-roll. Wants a 9:16 vertical short with a hard hook, aggressive pacing and word-level kinetic captions, in under two minutes of wall-clock time.

## 4. The two modes

Every downstream component branches on this one choice. It is the most load-bearing decision in the product.

| | Fast Mode | Quality Mode |
|---|---|---|
| Target | Shorts, Reels, TikTok | YouTube explainers, longform |
| Duration | ≤ 45 s (hard cap) | 1–15 min |
| Canvas | 1080×1920 (9:16) | 1920×1080 or 3840×2160 (16:9) |
| Frame rate | 30 fps | 30 or 60 fps |
| Scene length | 1.2 – 2.5 s | 4 – 9 s |
| Subtitles | Word-level kinetic, one active word scaled and coloured | Two-line clean, phrase-level, lower third |
| Motion | Spring physics, overshoot, punch-ins | Linear/eased, slow Ken Burns |
| Hook | Mandatory 3-second pattern interrupt | Optional cold open |
| Audio | Voice + music ducked 18 dB + dense SFX | Voice + music ducked 12 dB + sparse SFX |
| Bitrate | 8M | 12M (1080p) / 24M (4K) |
| Target turnaround | < 90 s end-to-end | Best effort |

## 5. Functional requirements

### 5.1 Asset ingestion

- Watch `assets/raw/` and register every file that appears
- Extract via `ffprobe`: duration, codec, container, resolution, frame rate, audio channels, bit depth
- Classify into `video` / `image` / `audio`, then tag: `talking-head`, `b-roll`, `screen-capture`, `music`, `sfx-riser`, `sfx-impact`, `sfx-whoosh`, `sfx-ui`
- Classification uses filename heuristics first, media properties second (a 2-second mono file under 500 KB is an SFX, not a music bed), and only escalates to a vision model when both are ambiguous
- Never modify or move the original file. Ingestion is read-only

### 5.2 Narrative planning

- Accept a task prompt, and optionally a script file, an article, or a URL
- Produce an Edit Decision List: an ordered array of Beats
- Each Beat carries: voiceover text, visual archetype, energy level 1–10, and asset preferences
- Respect the mode's duration and scene-length constraints. A Fast Mode plan that sums to 70 seconds is a validation failure, not a warning
- Visual archetypes: `TitleCard`, `KineticText`, `AssetCut`, `CodeView`, `SplitCompare`, `DiagramStep`, `Outro`

### 5.3 Voice and alignment

- Synthesise narration per Beat (not per script) so Beat boundaries stay exact
- Extract word-level timestamps from the synthesised audio via `faster-whisper`
- Concatenate Beat audio into a single track, recording each Beat's absolute offset
- Place SFX at scene transitions, offset +0.05 s from the cut
- Emit a ducking envelope: music drops by the mode's dB value while voice is active, with 250 ms attack and 400 ms release

**Why transcribe audio we just generated?** Because TTS engines do not report reliable word timings, and subtitles that drift by 200 ms look broken. Transcribing the actual output waveform is the only way to get timings that match what the viewer hears.

### 5.4 Video assembly

- Generate typed props for a Remotion composition — **not** freeform TSX
- Compositions are pre-built and version-controlled; the agent fills them with data
- Mount assets through Remotion's `<Video>`, `<Img>`, `<Audio>`, `<Sequence>`, `<AbsoluteFill>`
- Drive all animation from `useCurrentFrame()` and `spring()`. No CSS transitions, no `setTimeout` — they don't exist in a deterministic frame-by-frame render

**Why props and not generated components?** Because generated TSX fails at render time, deep inside a headless browser, with a stack trace that points at bundled code. Generated props fail at Zod parse time, in under a second, with a message naming the field. The difference in debuggability is enormous, and it is the single most important architectural decision in this system.

### 5.5 Rendering

- Render via `@remotion/renderer` with `hardwareAcceleration: 'if-possible'`
- Codec `h264`, quality controlled by `videoBitrate` (CRF is incompatible with hardware encoders)
- Stream frame progress, ETA and encoder identity to the client
- On NVENC failure, fall back to software encode and log why rather than aborting the job
- Output to `assets/output/<jobId>.mp4` with a sidecar `<jobId>.json` containing the full EDL and asset manifest

### 5.6 Control surfaces

Two ways in, sharing one job queue:

**Antigravity Skill** — the agent reads `SKILL.md`, calls the CLI, reports back. This is the primary path.

**Localhost console** — Next.js at `:3000`. Asset dropzone, job config form, live agent activity stream, `@remotion/player` preview, render button, job history.

## 6. Non-functional requirements

**Reliability.** Every agent output is Zod-validated before the next stage runs. A failed render dumps the serve URL, input props and full FFmpeg stderr to `logs/<jobId>/`. Jobs are resumable from the last completed stage.

**Latency.** Fast Mode: under 90 seconds from prompt to MP4 on the recommended hardware. Realistically the LLM planning call and the frame render dominate; TTS and Whisper are a few seconds each.

**Determinism.** Same EDL plus same assets produces a byte-identical render. This means no `Math.random()` and no `Date.now()` anywhere in the composition tree — seed any randomness from the frame number.

**Portability.** Runs standalone on Windows 10/11 with no WSL. Degrades cleanly to software encode and CPU Whisper on machines without an NVIDIA GPU.

**Observability.** Every stage transition, agent decision and validation failure is written to SQLite and broadcast over WebSocket. When a video comes out wrong, you should be able to read the EDL and see exactly which Beat was misplanned.

## 7. Out of scope for v1

Multi-language output, voice cloning, direct platform upload, cloud rendering, collaborative editing, template marketplace, mobile client.

## 8. Success criteria

v1 is done when:

1. A user drops three b-roll clips and a music file into `assets/raw/`, prompts *"45-second vertical short explaining what a transformer model is"*, and gets a rendered MP4 with synced kinetic subtitles, ducked music and a hook — with no further intervention.
2. Ten consecutive Fast Mode jobs complete without a manual fix.
3. Subtitle drift stays under 100 ms across a 45-second video.
4. Fast Mode renders complete in under 90 seconds on an RTX 3060.
