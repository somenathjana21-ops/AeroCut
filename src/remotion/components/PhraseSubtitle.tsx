import React, { useMemo } from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Theme, Word } from '../schema';

interface PhraseSubtitleProps {
  words: Word[];
  theme: Theme;
}

interface Phrase {
  text: string;
  start: number;
  end: number;
  startFrame: number;
  endFrame: number;
}

/**
 * Groups words into 6-10 word phrases or clause boundaries for Quality Mode.
 */
function groupIntoPhrases(words: Word[], fps: number): Phrase[] {
  if (!words || words.length === 0) return [];

  const phrases: Phrase[] = [];
  let currentWords: Word[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    currentWords.push(word);

    const isLast = i === words.length - 1;
    const count = currentWords.length;
    const hasPunctuation = /[.,!?;:]$/.test(word.word.trim());
    const isBeatEnd = !isLast && words[i + 1].beatIndex !== word.beatIndex;

    const shouldBreak =
      count >= 10 ||
      (count >= 5 && (hasPunctuation || isBeatEnd)) ||
      isLast;

    if (shouldBreak) {
      const phraseStart = currentWords[0].start;
      const phraseEnd = currentWords[currentWords.length - 1].end;
      phrases.push({
        text: currentWords.map((w) => w.word).join(' '),
        start: phraseStart,
        end: phraseEnd,
        startFrame: Math.floor(phraseStart * fps),
        endFrame: Math.ceil(phraseEnd * fps),
      });
      currentWords = [];
    }
  }

  return phrases;
}

export const PhraseSubtitle: React.FC<PhraseSubtitleProps> = ({ words, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phrases = useMemo(() => groupIntoPhrases(words, fps), [words, fps]);

  // Find active phrase and hold limit
  let activePhrase: Phrase | null = null;
  let activeHoldLimit = 0;

  for (let idx = 0; idx < phrases.length; idx++) {
    const phrase = phrases[idx];
    const nextPhrase = phrases[idx + 1];
    const holdLimit = nextPhrase ? nextPhrase.startFrame : phrase.endFrame + Math.round(0.3 * fps);
    if (frame >= phrase.startFrame && frame < holdLimit) {
      activePhrase = phrase;
      activeHoldLimit = holdLimit;
      break;
    }
  }

  if (!activePhrase) {
    return null;
  }

  const totalFrames = activeHoldLimit - activePhrase.startFrame;
  const fadeFrames = Math.min(6, Math.max(1, Math.floor(totalFrames / 4)));

  // Smooth fade-in and fade-out aligned to phrase display window
  const fadeIn = interpolate(
    frame,
    [activePhrase.startFrame, activePhrase.startFrame + fadeFrames],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const fadeOut = interpolate(
    frame,
    [activeHoldLimit - fadeFrames, activeHoldLimit],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '8%', // 8% bottom safe margin
        left: '50%',
        transform: 'translateX(-50%)',
        width: '84%',
        maxWidth: '1280px',
        textAlign: 'center',
        zIndex: 50,
        pointerEvents: 'none',
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: theme.fontFamily || 'Inter, sans-serif',
          fontSize: '38px',
          fontWeight: 600,
          lineHeight: 1.35,
          color: theme.foreground,
          textShadow:
            '0 2px 10px rgba(0, 0, 0, 0.9), 0 4px 20px rgba(0, 0, 0, 0.75)',
          display: '-webkit-box',
          WebkitLineClamp: 2, // two lines max
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {activePhrase.text}
      </div>
    </div>
  );
};
