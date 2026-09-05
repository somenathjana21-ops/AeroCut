# Dependencies

Versions below were current when this spec was written. **Resolve `latest` at install time rather than copying these numbers** — the original version of this spec pinned a two-year-old dependency tree, which is exactly the failure mode to avoid.

Only one version constraint is genuinely load-bearing:

> **`remotion` must be ≥ 4.0.484.** NVENC hardware encoding on Windows and Linux landed in that release. Below it, `--hardware-acceleration` silently does nothing on Windows and every render runs on the CPU.

---

## 1. Node ecosystem

### Core

| Package | Version at writing | Purpose |
|---|---|---|
| `next` | 16.x | Localhost control console and API routes |
| `react` / `react-dom` | 19.x | UI, and Remotion's rendering root |
| `typescript` | 5.9+ | Type safety across agent contracts |
| `tsx` | 4.x | Run TypeScript directly for scripts and the WS server |

Remotion's peer requirements on React are the thing to check if install complains. Match whatever the installed Remotion version asks for rather than forcing a React version.

### Remotion

| Package | Version at writing | Purpose |
|---|---|---|
| `remotion` | 4.0.520 | Core primitives: `Sequence`, `AbsoluteFill`, `useCurrentFrame`, `spring`, `interpolate` |
| `@remotion/cli` | 4.0.520 | Studio, CLI render, config file |
| `@remotion/player` | 4.0.520 | In-browser preview in the console |
| `@remotion/bundler` | 4.0.520 | Programmatic bundling for the render agent |
| `@remotion/renderer` | 4.0.520 | Programmatic render — this is what `RenderAgent` calls |
| `@remotion/media-utils` | 4.0.520 | Audio duration/waveform helpers |
| `@remotion/google-fonts` | 4.0.520 | Optional; only if you don't self-host fonts |

Keep every `@remotion/*` package on the **exact same version**. Mismatches produce confusing bundler errors that look like something else entirely.

The package is `remotion`. There is no `@remotion/core`.

### Services

| Package | Version at writing | Purpose |
|---|---|---|
| `ws` | 8.x | WebSocket server for agent telemetry |
| `better-sqlite3` | 13.x | Synchronous job queue and asset catalog |
| `chokidar` | 4.x+ | Filesystem watcher on `assets/raw/` |
| `zod` | 4.x | Validation of every agent output |
| `dotenv` | 17.x | Config loading |
| `execa` | 9.x | Child process handling for Python and FFmpeg — better Windows behaviour than raw `child_process` |

**On `better-sqlite3`:** it's a native module needing a compile toolchain if no prebuilt binary matches your Node version. Node 22+ ships `node:sqlite` built in, which is a viable zero-dependency swap. Keep the DB layer behind an interface in `src/server/db/index.ts` so this is a one-file change.

**On `chokidar` v4:** it dropped glob pattern support. Watch the directory and filter by extension in your own handler.

### UI

| Package | Version at writing | Purpose |
|---|---|---|
| `tailwindcss` | 4.x | Styling. Note v4 configures via CSS, not `tailwind.config.js` |
| `lucide-react` | latest | Icons |
| `clsx` + `tailwind-merge` | latest | Class composition |

### LLM client

Pick one and keep it behind an interface:

| Package | For |
|---|---|
| `@google/genai` | Gemini — natural fit alongside Antigravity |
| `openai` | GPT models |
| `ollama` | Fully local |

`src/server/llm/client.ts` exposes one function — `generateStructured(prompt, zodSchema)` — and nothing else in the codebase knows which provider is behind it. Swapping providers should be a single-file edit.

---

## 2. Python ecosystem

Isolated in `python-services/venv/`. Node never imports Python; it shells out and reads JSON from stdout.

```
edge-tts>=7.2
faster-whisper>=1.2
soundfile>=0.13
numpy>=2.0
pydantic>=2.11
```

### Torch

Not in `requirements.txt`, because the correct install command depends on your CUDA version and pip cannot express that.

GPU:
```
pip install torch --index-url https://download.pytorch.org/whl/cu124
```

CPU only:
```
pip install torch --index-url https://download.pytorch.org/whl/cpu
```

Check what `nvidia-smi` reports as your CUDA version and pick the matching wheel index. `faster-whisper` uses CTranslate2 rather than Torch directly for inference, so a CPU-only Torch install still gives you working transcription — just slower.

### cuDNN on Windows

For GPU transcription, `faster-whisper` needs cuDNN 9 and cuBLAS DLLs that don't ship with it:

```
pip install nvidia-cudnn-cu12 nvidia-cublas-cu12
```

If you see `Could not locate cudnn_ops64_9.dll`, this is the fix. If it still fails, fall back to CPU with `compute_type="int8"` — for a 45-second script it's a few seconds either way and not worth a long fight.

### TTS alternatives

`edge-tts` is a client for Microsoft's cloud endpoint. Free, no key, **requires internet**. If you need offline:

- **Piper** — small, fast, fully local, good quality. The pragmatic offline choice
- **Kokoro-82M** — better prosody, larger model, heavier setup

`tts_synthesizer.py` should expose one CLI contract regardless of engine so this stays a single-file swap.

---

## 3. Native binaries

**FFmpeg + ffprobe** on `PATH`. Used only for ingestion probing and post-processing — Remotion bundles its own FFmpeg for the render, and that bundled Windows x64 build already contains `h264_nvenc` and `hevc_nvenc`.

Install: [gyan.dev builds](https://www.gyan.dev/ffmpeg/builds/), extract to `C:\ffmpeg`, add `C:\ffmpeg\bin` to system `PATH`. Or `winget install Gyan.FFmpeg`.

**Chrome Headless Shell** — Remotion downloads this automatically on first render. Roughly 150 MB, one-time.

---

## 4. Install order

Order matters more than usual here, because failures at each step have different causes and you want them isolated:

1. `npm install` — Node tree. Native module compile failures surface here
2. `python -m venv python-services/venv` then activate
3. `pip install -r python-services/requirements.txt`
4. `pip install torch --index-url ...` — separately, so a CUDA mismatch doesn't take the whole requirements file down with it
5. `npx remotion versions` — confirms Remotion installed cleanly and all `@remotion/*` versions match
6. `npx tsx scripts/verify-environment.ts` — the full gate

---

## 5. What deliberately isn't here

**No `moviepy`.** Remotion owns assembly. Two compositing systems in one pipeline is a recipe for timing drift.

**No `fluent-ffmpeg`.** Unmaintained, and `execa` with explicit argument arrays is clearer and safer than a wrapper that stringifies your commands.

**No React state library.** The console has one WebSocket stream and a job list. `useState` plus a reducer is sufficient; adding Redux here would be ceremony.

**No ORM.** Four tables, hand-written SQL, `better-sqlite3` prepared statements. Prisma's generate step in the middle of an agent-driven build is friction you don't need.

**No test framework in v1.** The phase verification scripts *are* the test suite. Add Vitest once the pipeline stabilises.
