import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { AudioLayer } from '../components/AudioLayer';
import { FontLoader } from '../components/FontLoader';
import { KineticSubtitle } from '../components/KineticSubtitle';
import { PatternInterrupt } from '../components/PatternInterrupt';
import { SceneRenderer } from '../components/SceneRenderer';
import type { CompositionProps } from '../schema';

export const FastShort: React.FC<CompositionProps> = ({
  scenes,
  words,
  audio,
  theme,
}) => {
  const hookLine = scenes[0]?.text || 'Stop Scrolling';

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.background,
        color: theme.foreground,
        overflow: 'hidden',
      }}
    >
      {/* 0. Local font declarations */}
      <FontLoader />

      {/* 1. Scene Sequences */}
      {scenes.map((scene) => (
        <Sequence
          key={`scene-${scene.beatIndex}-${scene.startFrame}`}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
        >
          <SceneRenderer scene={scene} theme={theme} mode="fast" />
        </Sequence>
      ))}

      {/* 2. Pattern Interrupt hook over the first 90 frames (3 seconds at 30fps) */}
      <Sequence from={0} durationInFrames={90}>
        <PatternInterrupt hookLine={hookLine} theme={theme} />
      </Sequence>

      {/* 3. Kinetic word-level typography spanning the whole composition */}
      <KineticSubtitle words={words} theme={theme} />

      {/* 4. Audio layer with ducking and SFX spanning the whole composition */}
      <AudioLayer audio={audio} words={words} />
    </AbsoluteFill>
  );
};
