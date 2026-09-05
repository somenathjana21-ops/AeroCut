import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { AudioLayer } from '../components/AudioLayer';
import { FontLoader } from '../components/FontLoader';
import { PhraseSubtitle } from '../components/PhraseSubtitle';
import { SceneRenderer } from '../components/SceneRenderer';
import type { CompositionProps } from '../schema';

export const QualityExplainer: React.FC<CompositionProps> = ({
  scenes,
  words,
  audio,
  theme,
}) => {
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

      {/* 1. Scene Sequences with eased transitions */}
      {scenes.map((scene) => (
        <Sequence
          key={`scene-${scene.beatIndex}-${scene.startFrame}`}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
        >
          <SceneRenderer scene={scene} theme={theme} mode="quality" />
        </Sequence>
      ))}

      {/* 2. Phrase-level subtitle captions spanning the whole composition */}
      <PhraseSubtitle words={words} theme={theme} />

      {/* 3. Audio layer with ambient ducking and transitions spanning the whole composition */}
      <AudioLayer audio={audio} words={words} />
    </AbsoluteFill>
  );
};
