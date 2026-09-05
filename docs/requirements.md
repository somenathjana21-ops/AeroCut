# Requirements

Everything AeroCut needs on the host machine, and how to prove each piece works before you build on top of it.

---

## 1. Hardware

| Component | Minimum | Recommended | Why |
|---|---|---|---|
| GPU | NVIDIA Turing (GTX 1650 Super / RTX 20-series) | RTX 3060 12GB or better | NVENC encode. Pascal and older lack the modern NVENC generation; Ada cards have 2–3 encode engines |
| GPU driver | 525 | 555+ | Remotion's NVENC path requires 525 minimum |
| VRAM | 6 GB | 12 GB | Headless Chrome frame rendering + faster-whisper model, concurrently |
| CPU | 6C/12T | 8C/16T | Remotion parallelises frame rendering across cores; this is usually the real bottleneck, not the GPU |
| RAM | 16 GB | 32 GB | Each Chrome render worker holds a full compositor. 4K compositions are memory-hungry |
| Storage | 20 GB free, SSD | 50 GB, NVMe | Intermediate frame buffers are written and deleted constantly |

**AMD or Intel Arc GPU:** the pipeline still works, you just lose hardware encode. Set `HARDWARE_ACCELERATION=disable` and Remotion falls back to libx264. Renders are roughly 3–8× slower but the output is otherwise identical (arguably slightly better quality per bit).

**No GPU at all:** same fallback, plus set the Whisper model to `base` on CPU rather than `small`/`medium`.

---

## 2. Software

| Tool | Version | Notes |
|---|---|---|
| OS | Windows 10 21H2+ / Windows 11 | Native. WSL2 works but adds GPU passthrough complexity — not recommended for a first build |
| Node.js | 20.x or 22.x LTS | Not 23/25 odd-numbered releases. Remotion targets LTS |
| npm / pnpm | npm 10+ or pnpm 9+ | pnpm is faster here; either is fine |
| Python | 3.10 – 3.12 | 3.13 has patchy wheel coverage for the audio stack. Must be on `PATH` |
| FFmpeg + ffprobe | Any recent build | Used for **ingestion probing and post-processing only**. Remotion bundles its own FFmpeg for the render |
| Chrome / Chromium | Any | Remotion downloads Chrome Headless Shell automatically if absent |
| Git | Any | For phase checkpointing |

### On FFmpeg specifically

The original spec told you to compile FFmpeg with `--enable-nvenc`. You don't need to. Remotion's bundled Windows x64 FFmpeg already includes `h264_nvenc` and `hevc_nvenc`, and that is the binary that performs the render.

You still want a system FFmpeg on `PATH` because `IngestionAgent` shells out to `ffprobe` for asset metadata, and post-processing steps (loudness normalisation, thumbnail extraction) use `ffmpeg` directly. Any build works — the gyan.dev "full" or "essentials" release is the standard choice.

---

## 3. Verification

Run each of these before Phase 1. These are the checks the Phase 1 script will automate, but running them by hand first tells you where you actually stand.

### Toolchain present

```
node -v          → v20.x or v22.x
npm -v           → 10.x+
python --version → 3.10–3.12
ffprobe -version → any
git --version    → any
```

### NVIDIA stack alive

```
nvidia-smi
```

Look for driver version ≥ 525 in the header and your GPU listed. If this command isn't found, your driver install is broken — reinstall from nvidia.com before continuing.

### System FFmpeg has NVENC (optional, informational)

```
ffmpeg -encoders | findstr nvenc
```

Expected:

```
V....D h264_nvenc    NVIDIA NVENC H.264 encoder (codec h264)
V....D hevc_nvenc    NVIDIA NVENC hevc encoder (codec hevc)
```

If empty, that's fine — Remotion doesn't use your system FFmpeg for encoding. It only means you can't do NVENC post-processing outside Remotion.

### Encoder actually functions

The presence of an encoder in the list does **not** mean it works. Prove it:

```
ffmpeg -f lavfi -i testsrc=duration=3:size=1280x720:rate=30 -c:v h264_nvenc -b:v 5M -y nvenc_test.mp4
```

If this produces a 3-second file, hardware encode is genuinely working. If it errors with `Cannot load nvEncodeAPI64.dll` or `No capable devices found`, the driver is the problem, not FFmpeg.

### PyTorch sees CUDA (optional)

Only matters if you want GPU-accelerated Whisper. CPU Whisper is perfectly usable for short scripts.

```
python -c "import torch; print(torch.cuda.is_available(), torch.version.cuda)"
```

`True` plus a CUDA version means GPU transcription is available.

---

## 4. Known Windows friction

**`faster-whisper` on GPU needs cuDNN 9 and cuBLAS.** These are not bundled. The reliable path is installing `nvidia-cudnn-cu12` and `nvidia-cublas-cu12` via pip inside the venv, which puts the DLLs somewhere the loader finds them. If GPU transcription throws `Could not locate cudnn_ops64_9.dll`, that's this. CPU fallback with `compute_type="int8"` is a completely acceptable answer — a 45-second script transcribes in a few seconds either way.

**`better-sqlite3` is a native module.** It needs to compile against your Node version, which means Visual Studio Build Tools with the C++ workload. Prebuilt binaries usually cover LTS Node on x64, so most people never hit this. If `npm install` fails on it, install Build Tools or switch to `node:sqlite` (built into Node 22+) which needs no compilation.

**Long path names.** Remotion's node_modules tree plus a deeply nested project path can exceed the legacy 260-character limit. Keep the project near the drive root (`C:\dev\aerocut-engine`) or enable long paths:

```
git config --system core.longpaths true
```

**Windows Defender.** Real-time scanning on `node_modules` and the frame buffer directory measurably slows renders. Adding the project folder as an exclusion is worth doing.

**Antivirus and `edge-tts`.** Some security suites flag the outbound connection to Microsoft's speech endpoint. It's benign; allowlist it if prompted.

---

## 5. Network

`edge-tts` is a client for Microsoft's cloud read-aloud service. It is free, requires no API key, and requires **internet access at synthesis time**. If you need genuinely offline voice, swap in [Piper](https://github.com/rhasspy/piper) or Kokoro — both run fully local, both are lower-latency, and Piper in particular is small enough to bundle. The audio agent contract in `agents.md` is written so this is a one-file swap.

Nothing else in the pipeline requires network at runtime once dependencies are installed, unless you wire in a cloud LLM for the narrative agent.
