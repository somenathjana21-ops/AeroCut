import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Theme } from '../schema';

interface PatternInterruptProps {
  hookLine: string;
  theme: Theme;
}

export const PatternInterrupt: React.FC<PatternInterruptProps> = ({ hookLine, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Active for the first 90 frames (3 seconds at 30fps)
  if (frame >= 90) {
    return null;
  }

  // Scale punch 1.15 -> 1.0 on a spring
  const springPunch = spring({
    frame,
    fps,
    config: {
      damping: 14,
      stiffness: 180,
    },
  });

  const scale = interpolate(springPunch, [0, 1], [1.15, 1.0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Brief chromatic-aberration-style offset flash in the first 8 frames
  const flash = interpolate(frame, [0, 2, 8], [1, 0.8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Fade out cleanly at the end of the 90 frames (frames 84-90)
  const exitOpacity = interpolate(frame, [84, 90], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const redOffset = -8 * flash;
  const cyanOffset = 8 * flash;
  const chromaticShadow =
    flash > 0.01
      ? `${redOffset}px 0 rgba(255, 45, 85, ${0.9 * flash}), ${cyanOffset}px 0 rgba(0, 240, 255, ${0.9 * flash}), 0 8px 30px rgba(0,0,0,0.9)`
      : '0 8px 30px rgba(0,0,0,0.9)';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 8%',
        zIndex: 40,
        pointerEvents: 'none',
        opacity: exitOpacity,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
      }}
    >
      {/* Chromatic flash vignette overlay */}
      {flash > 0.01 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(circle at center, transparent 40%, rgba(79, 140, 255, ${flash * 0.25}) 100%)`,
            boxShadow: `inset 0 0 120px rgba(255, 255, 255, ${flash * 0.3})`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Slam-in hook card container */}
      <div
        style={{
          position: 'relative',
          padding: '24px 36px',
          borderRadius: '20px',
          background: 'rgba(10, 10, 11, 0.85)',
          border: `2px solid ${flash > 0.1 ? theme.accent : 'rgba(255, 255, 255, 0.12)'}`,
          backdropFilter: 'blur(12px)',
          textAlign: 'center',
          maxWidth: '92%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            fontSize: '18px',
            fontWeight: 800,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: theme.accent,
            marginBottom: '12px',
          }}
        >
          HOOK
        </div>

        <h1
          style={{
            margin: 0,
            fontFamily: theme.fontFamily || 'Inter, sans-serif',
            fontSize: '68px',
            fontWeight: 900,
            letterSpacing: '-0.04em',
            lineHeight: 1.08,
            color: theme.foreground,
            textShadow: chromaticShadow,
            textTransform: 'uppercase',
          }}
        >
          {hookLine}
        </h1>
      </div>
    </div>
  );
};
