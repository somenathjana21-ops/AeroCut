import React, { useMemo } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Theme, Word } from '../schema';

interface KineticSubtitleProps {
  words: Word[];
  theme: Theme;
}

interface WordCard {
  words: Word[];
  start: number;
  end: number;
}

/**
 * Groups words into cards of 3-5 words based on punctuation, beat boundaries, or count.
 */
function groupIntoCards(words: Word[]): WordCard[] {
  if (!words || words.length === 0) return [];

  const cards: WordCard[] = [];
  let currentGroup: Word[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    currentGroup.push(word);

    const isLastWord = i === words.length - 1;
    const count = currentGroup.length;
    const hasPunctuation = /[.,!?;:]["'”’)]*$/.test(word.word.trim());
    const isBeatEnd = !isLastWord && words[i + 1].beatIndex !== word.beatIndex;

    const shouldBreak =
      count >= 5 ||
      (count >= 3 && (hasPunctuation || isBeatEnd)) ||
      isLastWord;

    if (shouldBreak) {
      cards.push({
        words: currentGroup,
        start: currentGroup[0].start,
        end: currentGroup[currentGroup.length - 1].end,
      });
      currentGroup = [];
    }
  }

  return cards;
}

export const KineticSubtitle: React.FC<KineticSubtitleProps> = ({ words, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const cards = useMemo(() => groupIntoCards(words), [words]);

  // Find the active card
  const activeCardIndex = cards.findIndex((card, idx) => {
    const nextCard = cards[idx + 1];
    const cardEndWithHold = nextCard ? nextCard.start : card.end + 0.4;
    return currentTime >= card.start && currentTime < cardEndWithHold;
  });

  if (activeCardIndex === -1) {
    return null;
  }

  const activeCard = cards[activeCardIndex];

  // Determine active word within the active card
  let activeWordIndex = activeCard.words.findIndex(
    (w) => currentTime >= w.start && currentTime <= w.end
  );

  // If in a small inter-word gap, pick the closest word; before speech begins, leave unhighlighted
  if (activeWordIndex === -1) {
    if (currentTime < activeCard.words[0].start) {
      activeWordIndex = -1;
    } else {
      let closestIdx = 0;
      let minDiff = Infinity;
      activeCard.words.forEach((w, idx) => {
        const diff = Math.abs(currentTime - w.start);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });
      activeWordIndex = closestIdx;
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '12%',
        left: '5%',
        right: '5%',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '14px 18px',
        zIndex: 50,
        pointerEvents: 'none',
        fontFamily: theme.fontFamily || 'Inter, sans-serif',
      }}
    >
      {activeCard.words.map((w, idx) => {
        const isActive = idx === activeWordIndex;
        const wordStartFrame = Math.round(w.start * fps);
        const framesSinceStart = Math.max(0, frame - wordStartFrame);

        // Active word: spring scale 1.0 -> 1.18, damping 12, stiffness 180, accent colour
        const springVal = spring({
          frame: framesSinceStart,
          fps,
          config: {
            damping: 12,
            stiffness: 180,
          },
        });

        const scale = isActive
          ? interpolate(springVal, [0, 1], [1.0, 1.18], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          : 1.0;

        const color = isActive ? theme.accent : theme.foreground;
        const opacity = isActive ? 1.0 : 0.85;

        return (
          <span
            key={`${w.beatIndex}-${w.start}-${w.word}-${idx}`}
            style={{
              display: 'inline-block',
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              color,
              opacity,
              fontSize: '62px',
              fontWeight: 900,
              letterSpacing: '-0.03em',
              textTransform: 'uppercase',
              lineHeight: 1.1,
              textShadow:
                '0 4px 16px rgba(0, 0, 0, 0.95), 0 2px 6px rgba(0, 0, 0, 0.9), 0 0 3px #000',
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};
