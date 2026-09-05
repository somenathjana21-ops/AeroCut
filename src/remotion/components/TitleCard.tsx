import React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { KenBurnsProps, Theme } from '../schema';
import { DynamicMedia } from './DynamicMedia';

interface TitleCardProps {
  text?: string;
  assetPath?: string;
  kenBurns?: KenBurnsProps;
  durationInFrames: number;
  theme: Theme;
  mode?: 'fast' | 'quality';
}

export const TitleCard: React.FC<TitleCardProps> = ({
  text,
  assetPath,
  kenBurns,
  durationInFrames,
  theme,
  mode = 'fast',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Mode-based entrance animation
  let scale = 1.0;
  let opacity = 1.0;
  let translateY = 0;

  if (mode === 'fast') {
    // Fast Mode: spring scale punch
    const spr = spring({
      frame,
      fps,
      config: {
        damping: 14,
        stiffness: 180,
      },
    });
    scale = interpolate(spr, [0, 1], [0.88, 1.0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    opacity = interpolate(spr, [0, 1], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else {
    // Quality Mode: eased motion, no springs
    opacity = interpolate(frame, [0, 15], [0, 1], {
      easing: Easing.inOut(Easing.cubic),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    translateY = interpolate(frame, [0, 20], [25, 0], {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  // Subtle floating motion across the scene duration
  const floatY = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, -10], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: theme.background,
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Background Media or Gradient Mesh */}
      <DynamicMedia
        assetPath={assetPath}
        kenBurns={kenBurns}
        durationInFrames={durationInFrames}
        theme={theme}
      />

      {/* Dark overlay for contrast and legibility */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: assetPath
            ? 'linear-gradient(180deg, rgba(10, 10, 11, 0.65) 0%, rgba(10, 10, 11, 0.85) 100%)'
            : 'radial-gradient(circle at center, transparent 30%, rgba(10, 10, 11, 0.7) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Statement text */}
      {text && (
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            maxWidth: '85%',
            textAlign: 'center',
            transform: `scale(${scale}) translateY(${translateY + floatY}px)`,
            opacity,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily: theme.fontFamily || 'Inter, sans-serif',
              fontSize: mode === 'fast' ? '64px' : '56px',
              fontWeight: 900,
              letterSpacing: '-0.035em',
              lineHeight: 1.12,
              color: theme.foreground,
              textShadow:
                '0 4px 24px rgba(0, 0, 0, 0.95), 0 2px 8px rgba(0, 0, 0, 0.9)',
              textTransform: mode === 'fast' ? 'uppercase' : 'none',
            }}
          >
            {text}
          </h1>

          {/* Accent underline bar */}
          <div
            style={{
              width: '80px',
              height: '4px',
              backgroundColor: theme.accent,
              borderRadius: '2px',
              margin: '24px auto 0',
              boxShadow: `0 0 16px ${theme.accent}`,
            }}
          />
        </div>
      )}
    </div>
  );
};
