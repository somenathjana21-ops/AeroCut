# Creative Brief

The PRD says what the system does. This says what the output should *feel* like. Phase 3 components and the Phase 4 narrative agent both implement rules from here, so read it before either.

---

## 1. Vision

Most automated video looks automated: even pacing, generic stock, captions that sit still, music that never reacts to anything. The tell is always the same — nothing in the video responds to anything else in the video.

AeroCut's goal is output where the elements are aware of each other. Music ducks because someone is speaking. A whoosh lands because a cut happened. A word scales up because it's the word being said right now. That reactivity is what reads as "edited" rather than "generated."

## 2. Fast Mode — retention architecture

Vertical short-form. The viewer's thumb is already moving. Every rule here exists to interrupt that.

### The 3-second hook

Non-negotiable. The first 90 frames must contain all three of:

- **Visual:** a scale punch from 1.15× settling to 1.0× on a spring, or a hard-contrast title card slamming in
- **Auditory:** a riser resolving into an impact SFX on the first stressed syllable
- **Verbal:** the hook line, with zero pre-roll silence

Zero pre-roll is worth stating precisely: the first audible voice frame must be frame 0. `edge-tts` output routinely begins with 100–300 ms of silence, and the audio agent must trim it. Half a second of dead air at the top costs more retention than any other single defect in the format.

Hook lines that work: a specific number, a contradiction of an assumption, an unfinished statement. Hook lines that don't: "In this video, we'll be looking at…"

### Pacing

- A visual change every 1.5–2.5 seconds — cut, punch-in, overlay, or archetype switch
- Never hold a static frame past 3 seconds
- Ken Burns on stills is a *supplement* to cuts, not a substitute

### Kinetic typography

- Word-level, driven by Whisper timestamps
- Active word: scale 1.0 → 1.18 on a spring (`damping: 12`, `stiffness: 180`), accent colour
- Inactive words in the group: 85% opacity, neutral
- Group 3–5 words per card, never more — a full sentence on screen defeats the point
- Heavy weight, tight tracking, high-contrast stroke or shadow so it survives any background

### Audio

- Music ducks 18 dB while voice is active. 250 ms attack, 400 ms release
- SFX at every transition, +0.05 s after the cut. Slightly late reads as impact; slightly early reads as a mistake
- Voice 0 dB, SFX −2 dB, music −18 dB ducked / −8 dB idle

## 3. Quality Mode — clarity architecture

Landscape longform. The viewer chose to be here. The enemy is now boredom and confusion, not the scroll.

### Composition

- 16:9, generous margins, content on thirds
- Lower-third titles rather than full-screen cards
- Code panels: syntax-highlighted, monospace, line-by-line reveal timed to narration
- Split-screen when comparing two things — do not cut back and forth between them

### Pacing

- 4–9 seconds per beat
- Motion is eased, not sprung. `interpolate` with `Easing.inOut(Easing.cubic)`
- Ken Burns at 1.0 → 1.06 over the beat. Any more is distracting at this length

### Subtitles

- Two lines maximum, phrase-level, lower third
- No per-word animation. At this pace it reads as jitter
- Optional — a longform viewer with sound on doesn't need them

### Audio

- Music ducks 12 dB, ambient bed rather than a driving loop
- SFX sparingly: section transitions and reveals only
- Room for silence. A held beat before a key point is a legitimate device here, and forbidden in Fast Mode

## 4. Rules that apply to both

**Never leave the canvas empty.** Every frame has a background — asset, gradient, or motion field. Black frames read as a broken render.

**Never let a subtitle overlap a face or a UI element.** Safe areas: 12% from bottom in 9:16, 8% in 16:9.

**Never repeat the same asset in adjacent beats.** The narrative agent must track usage and prefer unseen assets.

**Never cut on a word.** Transitions land in the inter-word gap that Whisper gives you for free.

**Every video ends deliberately.** An outro card, a fade, a final line. Not a hard stop mid-breath.

## 5. Visual language defaults

These are starting points, overridable per project in `.env`:

- **Type:** Inter or Satoshi for UI and titles, JetBrains Mono for code. Bundle the files; do not fetch webfonts at render time — a network hiccup mid-render produces a video with fallback fonts
- **Palette:** near-black `#0A0A0B` background, near-white `#FAFAFA` text, one saturated accent for active words and highlights. One accent, not three
- **Corner radius:** 16 px on cards at 1080p, scaled proportionally at other resolutions
- **Shadow:** used for legibility separation only, never decoration

## 6. Failure aesthetics

When something is missing, degrade in a way that looks intentional:

- No matching b-roll → animated gradient with the beat's key phrase as kinetic text
- Whisper alignment fails → phrase-level subtitles from the Beat text, timed by proportional duration
- Music file missing → render without music, log a warning, don't fail the job
- SFX missing → silent transition

Failure states must never surface a filename, an error string, or a placeholder box in the rendered output.
