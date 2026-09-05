---
description: Verify a completed AeroCut build phase against its checklist and report honestly on what passes and what does not
---

Move this file to `.agents/workflows/aerocut-verify.md`. Invoke it with `/aerocut-verify` and say which phase.

Verify the phase the user names. Do not accept your own prior claims of success as evidence — re-check everything by running commands and reading files.

1. Read the relevant phase section in `docs/guide.md`.

2. Run the checks for that phase:

   - **Phase 1** — `npm run verify`. Then read `remotion.config.ts` and confirm it uses `setHardwareAcceleration` and does not use `setFfmpegOverride` or set a CRF. Confirm all `@remotion/*` versions match.
   - **Phase 2** — `npm run test:audio`. Confirm both Python scripts write only JSON to stdout. Confirm silence trimming is implemented as waveform analysis, not a fixed offset.
   - **Phase 3** — `npm run studio` loads both compositions. Render both fixtures with `--log=verbose` and report the encoder line. Grep `src/remotion/` for imports of `src/server`, `fs`, `path`, `child_process`, and for `Math.random`, `Date.now`, `setTimeout`.
   - **Phase 4** — `npx tsx scripts/test-pipeline-headless.ts`. Then print the stored EDL and the first ten word timestamps. `ffprobe` the output MP4.
   - **Phase 5** — start `npm run dev`, exercise the console in the browser, screenshot each step.
   - **Phase 6** — `npm run doctor`, and confirm `--json` output is exactly one parseable object.

3. Report as a table: check, PASS or FAIL, and the observed value.

4. For every FAIL, name the file and line responsible. Do not fix anything yet.

5. Check the phase's "Known failures" list in `docs/guide.md` and say whether any of them match what you observed.

// turbo
6. If everything passes, run `git add -A && git commit -m "Phase <N> verified"`.

Rules for this workflow:

- A command that exits 0 is not proof the thing works. Read the output.
- If you cannot verify something, say you cannot verify it. Do not infer success from the absence of an error.
- Report partial passes as partial. "Mostly working" is a FAIL with detail.
