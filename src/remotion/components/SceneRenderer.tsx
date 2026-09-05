import React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Scene, Theme } from '../schema';
import { CodeTerminal } from './CodeTerminal';
import { DynamicMedia } from './DynamicMedia';
import { TitleCard } from './TitleCard';

interface SceneRendererProps {
  scene: Scene;
  theme: Theme;
  mode: 'fast' | 'quality';
}

export const SceneRenderer: React.FC<SceneRendererProps> = ({ scene, theme, mode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  switch (scene.archetype) {
    case 'TitleCard':
    case 'KineticText':
      return (
        <TitleCard
          text={scene.text}
          assetPath={scene.assetPath}
          kenBurns={scene.kenBurns}
          durationInFrames={scene.durationInFrames}
          theme={theme}
          mode={mode}
        />
      );

    case 'CodeView':
      if (scene.codeSnippet) {
        return (
          <CodeTerminal
            codeSnippet={scene.codeSnippet}
            durationInFrames={scene.durationInFrames}
            theme={theme}
          />
        );
      }
      return (
        <TitleCard
          text={scene.text}
          assetPath={scene.assetPath}
          kenBurns={scene.kenBurns}
          durationInFrames={scene.durationInFrames}
          theme={theme}
          mode={mode}
        />
      );

    case 'SplitCompare': {
      // Side-by-side (or top/bottom in vertical) split comparison
      const isVertical = mode === 'fast';
      const parts = scene.text
        ? scene.text.split(/\s*(?:vs\.?|against|versus|\/|\|)\s*/i)
        : ['Option A', 'Option B'];
      const leftText = parts[0]?.trim() || 'Option A';
      const rightText = parts[1]?.trim() || (parts[0] ? 'Alternative' : 'Option B');

      const splitProgress =
        mode === 'fast'
          ? spring({ frame, fps, config: { damping: 14, stiffness: 180 } })
          : interpolate(frame, [0, 15], [0, 1], {
              easing: Easing.out(Easing.cubic),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });

      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: theme.background,
            display: 'flex',
            flexDirection: isVertical ? 'column' : 'row',
            overflow: 'hidden',
          }}
        >
          {/* First Pane */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '30px',
              borderRight: isVertical ? 'none' : '2px solid rgba(255, 255, 255, 0.1)',
              borderBottom: isVertical ? '2px solid rgba(255, 255, 255, 0.1)' : 'none',
              background: 'linear-gradient(135deg, rgba(20, 21, 30, 0.9) 0%, rgba(10, 10, 11, 0.95) 100%)',
              transform: `scale(${0.9 + 0.1 * splitProgress})`,
              opacity: splitProgress,
            }}
          >
            <div
              style={{
                fontSize: '16px',
                fontWeight: 800,
                color: '#8b92a5',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}
            >
              Side A
            </div>
            <h2
              style={{
                margin: 0,
                fontFamily: theme.fontFamily || 'Inter, sans-serif',
                fontSize: isVertical ? '48px' : '40px',
                fontWeight: 800,
                color: theme.foreground,
                textAlign: 'center',
              }}
            >
              {leftText}
            </h2>
          </div>

          {/* Second Pane */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '30px',
              background: `linear-gradient(135deg, ${theme.accent}15 0%, rgba(10, 10, 11, 0.95) 100%)`,
              transform: `scale(${0.9 + 0.1 * splitProgress})`,
              opacity: splitProgress,
            }}
          >
            <div
              style={{
                fontSize: '16px',
                fontWeight: 800,
                color: theme.accent,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '12px',
              }}
            >
              Side B
            </div>
            <h2
              style={{
                margin: 0,
                fontFamily: theme.fontFamily || 'Inter, sans-serif',
                fontSize: isVertical ? '48px' : '40px',
                fontWeight: 800,
                color: theme.foreground,
                textAlign: 'center',
              }}
            >
              {rightText}
            </h2>
          </div>
        </div>
      );
    }

    case 'DiagramStep': {
      // Step-by-step diagram node callout
      const stepNumber = scene.beatIndex + 1;
      const appear =
        mode === 'fast'
          ? spring({ frame, fps, config: { damping: 14, stiffness: 180 } })
          : interpolate(frame, [0, 18], [0, 1], {
              easing: Easing.out(Easing.cubic),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });

      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: theme.background,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '8%',
            overflow: 'hidden',
          }}
        >
          {/* Subtle grid backdrop */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
              pointerEvents: 'none',
            }}
          />

          <div
            style={{
              position: 'relative',
              padding: '36px 48px',
              borderRadius: '24px',
              background: 'rgba(16, 17, 24, 0.92)',
              border: `1px solid ${theme.accent}55`,
              boxShadow: `0 24px 70px rgba(0, 0, 0, 0.8), 0 0 30px ${theme.accent}22`,
              textAlign: 'center',
              maxWidth: '900px',
              transform: `scale(${0.92 + 0.08 * appear})`,
              opacity: appear,
            }}
          >
            {/* Step badge */}
            <div
              style={{
                display: 'inline-block',
                padding: '6px 18px',
                borderRadius: '100px',
                backgroundColor: `${theme.accent}25`,
                border: `1px solid ${theme.accent}`,
                color: theme.accent,
                fontSize: '16px',
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: '16px',
              }}
            >
              Step {stepNumber}
            </div>

            <h2
              style={{
                margin: 0,
                fontFamily: theme.fontFamily || 'Inter, sans-serif',
                fontSize: mode === 'fast' ? '54px' : '46px',
                fontWeight: 800,
                lineHeight: 1.2,
                color: theme.foreground,
              }}
            >
              {scene.text || `Step ${stepNumber} Execution`}
            </h2>
          </div>
        </div>
      );
    }

    case 'Outro':
      return (
        <TitleCard
          text={scene.text || 'AeroCut'}
          assetPath={scene.assetPath}
          kenBurns={scene.kenBurns}
          durationInFrames={scene.durationInFrames}
          theme={theme}
          mode={mode}
        />
      );

    case 'AssetCut':
    default:
      return (
        <DynamicMedia
          assetPath={scene.assetPath}
          kenBurns={scene.kenBurns}
          durationInFrames={scene.durationInFrames}
          theme={theme}
        />
      );
  }
};
