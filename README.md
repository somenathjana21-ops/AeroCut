# AeroCut — Start Here

An agentic media pipeline you build **with** Google Antigravity, that then runs **inside** Antigravity as a workspace Skill.

You drop footage, images, music and SFX into a folder, write a task prompt ("make a 45-second vertical short about transformers using the b-roll and this article"), and the pipeline scripts it, voices it, aligns subtitles to the audio, assembles a Remotion composition, and renders an MP4 on your NVIDIA GPU.

This is a rebuild of the spec from your Gemini thread. Same product, but the parts that would have failed on first contact with a real build have been fixed.

---

## What changed from the original spec

The original architecture was directionally sound. These specific details were not, and each one would have cost you a debugging session:

| Original | Problem | Corrected here |
|---|---|---|
| Skill at `.antigravity/skills/` and `.agent/skills/` | Neither matches current Antigravity. It reads `.agents/skills/` (with `.agent/skills/` kept only for backward compatibility) | `.agents/skills/aerocut/SKILL.md` |
| `skill.json` with `capabilities`, `env`, `actions` | Antigravity has no such descriptor format. Skills are a `SKILL.md` with YAML frontmatter — `description` is the only required field | `SKILL.md` with proper frontmatter; config knobs moved to `.env` |
| `Config.setFfmpegOverride()` injecting `-c:v h264_nvenc` | Fighting Remotion instead of using it. Remotion has had first-class NVENC since v4.0.484 | `Config.setHardwareAcceleration('if-possible')` / `--hardware-acceleration if-possible` |
| Custom FFmpeg build with `--enable-nvenc` required | Remotion's bundled FFmpeg already ships `h264_nvenc` and `hevc_nvenc` on Windows x64 | System FFmpeg still needed, but only for `ffprobe` ingestion and post-processing — not for the render |
| `-cq 19` plus CRF-style quality control | CRF is **incompatible** with hardware encoders. The render errors or silently ignores it | `--video-bitrate` (8M is roughly file-size-parity with software x264 at 1080p) |
| `package.json` should contain `@remotion/core` | That package does not exist | The core package is `remotion` |
| `npx remotion preview` | Renamed in Remotion 4.x | `npx remotion studio` |
| WebSocket server at `src/app/api/ws/route.ts` | Next.js App Router route handlers cannot hold a WebSocket upgrade | Standalone `ws-server.ts` process on its own port, run alongside Next |
| Pinned versions (`next@14.2`, `react@18.3`, `torch==2.3.0+cu121`, `faster-whisper==1.0.3`) | All roughly two years stale as of now | Current majors, with only one hard floor that actually matters: `remotion >= 4.0.484` |
| "Free **local** TTS via edge-tts" | `edge-tts` is a client for Microsoft's cloud read-aloud endpoint. It is free and needs no key, but it is **not local and needs internet** | Documented honestly, with Piper/Kokoro noted as the genuinely-offline option |

There is one more thing worth saying plainly: **the "5 autonomous agents" are not five separate services.** They are five prompt-and-schema contracts that one LLM fulfils in sequence, each validated with Zod before the next one runs. Building them as five long-lived processes is where projects like this usually die. The spec here treats them as pure functions: input contract in, validated JSON out.

---

## Prerequisites

Check these **before** you start Phase 1, because two of them cannot be fixed by an agent:

- Windows 10/11 64-bit, NVIDIA GPU (Turing / GTX 16-series or newer), driver 525+ (555+ recommended)
- Node.js 20 or 22 LTS
- Python 3.10–3.12, 64-bit, on `PATH`
- FFmpeg + ffprobe on `PATH` (any recent build — the [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) full build is fine)
- ~20 GB free on an SSD
- Antigravity 2.x with a workspace open

Sanity check, in a fresh terminal:

```
node -v
python --version
ffprobe -version
nvidia-smi
```

If `nvidia-smi` doesn't run, stop and fix your drivers first. Everything downstream assumes it works.

---

## Where the files go

Copy this bundle into your empty project folder, then move two things into place:

```
aerocut-engine/
├── .agents/
│   ├── skills/
│   │   └── aerocut/
│   │       └── SKILL.md        ← from agent-config/skills/aerocut/
│   └── workflows/
│       └── aerocut-verify.md   ← from agent-config/workflows/
├── docs/
│   ├── Brief.md
│   ├── PRD.md
│   ├── requirements.md
│   ├── dependencies.md
│   ├── agents.md
│   ├── architecture.md
│   └── guide.md
└── README.md
```

On Windows, File Explorer will not let you create a folder named `.agents` by typing it — it strips the leading dot. Use the terminal:

```
mkdir .agents\skills\aerocut
mkdir .agents\workflows
```

Then delete the `agent-config/` staging folder. It only exists because dot-folders are awkward to ship.

---

## How to run the build

`docs/guide.md` is the file you'll actually live in. It has six phases. Each phase gives you:

1. A **build prompt** to paste into Antigravity
2. A **verification prompt** to paste after it finishes
3. **Manual checks** you do yourself, because agents are unreliable narrators about their own work
4. **Known failure modes** for that phase

### Five rules that make this work

**One phase per conversation.** Start a fresh Antigravity conversation for each phase. Long conversations degrade — the agent starts forgetting Phase 1 decisions by Phase 4. Fresh context each time, with the docs on disk carrying the memory instead.

**Point at the docs, don't paste them.** Every prompt starts with a line telling Antigravity which docs to read. It has filesystem access. Pasting 400 lines of PRD into chat wastes the context you need for actual work.

**Verify before advancing.** A broken Phase 2 doesn't announce itself — it shows up as an inexplicable Phase 4 failure. Run the verification prompt, run the manual checks, and don't move on until both pass.

**Run the manual checks yourself.** When an agent says "✅ all verifications pass," that is a claim, not a result. The manual checks in each phase take under a minute.

**Commit after each green phase.** `git add -A && git commit -m "Phase N green"`. When Phase 5 goes sideways you want a known-good Phase 4 to return to, not a guess.

---

## Reading order

| File | Read when |
|---|---|
| `docs/requirements.md` | Now, before anything — it's the hardware/software gate |
| `docs/guide.md` | Now, and continuously — this is the build |
| `docs/PRD.md` | Now — it defines Fast Mode vs Quality Mode, which everything else references |
| `docs/Brief.md` | Before Phase 3 — creative rules the motion graphics must satisfy |
| `docs/agents.md` | Before Phase 4 — the five agent contracts and schemas |
| `docs/architecture.md` | Before Phase 4 — directory layout and data flow |
| `docs/dependencies.md` | When something won't install |

---

## Expectations, honestly

**Phase 1–3 will mostly go smoothly.** Environment setup and Remotion components are well-trodden ground with good documentation for the agent to draw on.

**Phase 4 is where the real work is.** Getting an LLM to emit a valid Edit Decision List that maps cleanly onto Remotion props, reliably, is the hard part of this entire project. Expect to iterate on the `NarrativeAgent` prompt more than anything else in the build. The Zod schemas exist so failures are loud and specific instead of producing a video with subtitles two seconds out of sync.

**Timeline.** Someone comfortable with TypeScript and React should get to a first rendered MP4 in a few focused evenings. Getting the output to actually look good is a longer tail of taste and tuning that no spec can hand you.

**One legal note.** `assets/library/music` and `assets/library/sfx` ship empty. Fill them with audio you have the rights to — [Pixabay](https://pixabay.com/music/), [Freesound](https://freesound.org/) (check per-file licenses), or paid libraries. Don't put commercial tracks there and then publish the output.
