import React, { useMemo } from 'react';
import { Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import type { AudioProps, Word } from '../schema';

interface AudioLayerProps {
  audio: AudioProps;
  words?: Word[];
}

interface VoiceSpan {
  startFrame: number;
  endFrame: number;
}

function resolveAudioSource(pathStr?: string): string | null {
  if (!pathStr || pathStr.trim() === '') return null;
  if (
    pathStr.startsWith('http://') ||
    pathStr.startsWith('https://') ||
    pathStr.startsWith('data:') ||
    pathStr.startsWith('blob:')
  ) {
    return pathStr;
  }
  const normalized = pathStr.replace(/^[/\\]+/, '').replace(/\\/g, '/');
  return staticFile(normalized);
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export const AudioLayer: React.FC<AudioLayerProps> = ({ audio, words = [] }) => {
  const { fps } = useVideoConfig();

  // Precompute voice-active frame spans from words
  const voiceSpans = useMemo(() => {
    if (!words || words.length === 0) return [];

    const sortedWords = [...words].sort((a, b) => a.start - b.start);
    // 0.2s max gap to bridge adjacent words in continuous speech
    const bridgeGapSec = 0.2;
    const spans: VoiceSpan[] = [];
    let currentStart = -1;
    let currentEnd = -1;

    for (const w of sortedWords) {
      if (currentStart === -1) {
        currentStart = w.start;
        currentEnd = w.end;
      } else if (w.start - currentEnd <= bridgeGapSec) {
        currentEnd = Math.max(currentEnd, w.end);
      } else {
        spans.push({
          startFrame: Math.floor(currentStart * fps),
          endFrame: Math.ceil(currentEnd * fps),
        });
        currentStart = w.start;
        currentEnd = w.end;
      }
    }

    if (currentStart !== -1) {
      spans.push({
        startFrame: Math.floor(currentStart * fps),
        endFrame: Math.ceil(currentEnd * fps),
      });
    }

    return spans;
  }, [words, fps]);

  const idleGain = dbToLinear(audio.musicGainDb);
  const duckGain = dbToLinear(audio.duckToDb);
  const attackFrames = Math.max(1, Math.round(0.25 * fps)); // 250ms attack
  const releaseFrames = Math.max(1, Math.round(0.4 * fps)); // 400ms release

  // Ducking envelope function evaluated per frame (minimum gain across all nearby spans)
  const getMusicVolume = (frame: number): number => {
    if (voiceSpans.length === 0) {
      return idleGain;
    }

    let currentGain = idleGain;

    for (const span of voiceSpans) {
      // 1. Inside active speech span
      if (frame >= span.startFrame && frame <= span.endFrame) {
        return duckGain;
      }

      // 2. Approaching speech span (attack: duck from idleGain -> duckGain)
      if (frame < span.startFrame && frame >= span.startFrame - attackFrames) {
        const progress = (frame - (span.startFrame - attackFrames)) / attackFrames;
        const gain = idleGain - progress * (idleGain - duckGain);
        if (gain < currentGain) {
          currentGain = gain;
        }
      }

      // 3. Just left speech span (release: rise from duckGain -> idleGain)
      if (frame > span.endFrame && frame <= span.endFrame + releaseFrames) {
        const progress = (frame - span.endFrame) / releaseFrames;
        const gain = duckGain + progress * (idleGain - duckGain);
        if (gain < currentGain) {
          currentGain = gain;
        }
      }
    }

    return currentGain;
  };

  const voiceSrc = resolveAudioSource(audio.voicePath);
  const musicSrc = resolveAudioSource(audio.musicPath);

  return (
    <>
      {/* Voiceover track at 0 dB (gain = 1.0) */}
      {voiceSrc && <Audio src={voiceSrc} volume={1.0} />}

      {/* Music bed with dynamic ducking envelope */}
      {musicSrc && <Audio src={musicSrc} volume={getMusicVolume} />}

      {/* SFX placements at target frames (-2 dB) */}
      {audio.sfx &&
        audio.sfx.map((s, idx) => {
          const sfxSrc = resolveAudioSource(s.path);
          if (!sfxSrc || typeof s.atFrame !== 'number' || s.atFrame < 0) return null;

          return (
            <Sequence key={`sfx-${idx}-${s.atFrame}`} from={s.atFrame}>
              <Audio src={sfxSrc} volume={dbToLinear(-2)} />
            </Sequence>
          );
        })}
    </>
  );
};
