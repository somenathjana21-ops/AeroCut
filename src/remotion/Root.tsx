import React from 'react';
import { Composition } from 'remotion';
import { FastShort } from './compositions/FastShort';
import { QualityExplainer } from './compositions/QualityExplainer';
import { sampleFastProps } from './fixtures/sample-fast';
import { sampleQualityProps } from './fixtures/sample-quality';
import { CompositionPropsSchema, type CompositionProps } from './schema';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FastShort"
        component={FastShort}
        schema={CompositionPropsSchema}
        defaultProps={sampleFastProps}
        durationInFrames={sampleFastProps.durationInFrames}
        fps={sampleFastProps.fps}
        width={sampleFastProps.width}
        height={sampleFastProps.height}
        calculateMetadata={async ({ props }) => {
          return {
            width: props.width,
            height: props.height,
            fps: props.fps,
            durationInFrames: props.durationInFrames,
          };
        }}
      />

      <Composition
        id="QualityExplainer"
        component={QualityExplainer}
        schema={CompositionPropsSchema}
        defaultProps={sampleQualityProps}
        durationInFrames={sampleQualityProps.durationInFrames}
        fps={sampleQualityProps.fps}
        width={sampleQualityProps.width}
        height={sampleQualityProps.height}
        calculateMetadata={async ({ props }) => {
          return {
            width: props.width,
            height: props.height,
            fps: props.fps,
            durationInFrames: props.durationInFrames,
          };
        }}
      />
    </>
  );
};
