import type { CompositionProps } from '../schema';

export const sampleQualityProps: CompositionProps = {
  jobId: 'fixture-quality-001',
  mode: 'quality',
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 450, // 15 seconds
  scenes: [
    {
      beatIndex: 0,
      archetype: 'TitleCard',
      startFrame: 0,
      durationInFrames: 90,
      text: 'Building Modern Motion Pipelines',
      energy: 6,
      transitionIn: 'fade',
      kenBurns: {
        fromScale: 1.0,
        toScale: 1.04,
        fromX: 0,
        fromY: 0,
      },
    },
    {
      beatIndex: 1,
      archetype: 'CodeView',
      startFrame: 90,
      durationInFrames: 120,
      text: 'Deterministic Render Function',
      energy: 5,
      transitionIn: 'cut',
      codeSnippet: {
        language: 'typescript',
        code: `import { bundle } from '@remotion/bundler';\nimport { renderMedia } from '@remotion/renderer';\n\nexport async function executeRender(props) {\n  const serveUrl = await bundle({ entryPoint });\n  return await renderMedia({ serveUrl, props });\n}`,
      },
    },
    {
      beatIndex: 2,
      archetype: 'SplitCompare',
      startFrame: 210,
      durationInFrames: 80,
      text: 'Imperative Effects vs Pure Frames',
      energy: 6,
      transitionIn: 'fade',
    },
    {
      beatIndex: 3,
      archetype: 'DiagramStep',
      startFrame: 290,
      durationInFrames: 80,
      text: 'Headless Chrome Rendering Cluster',
      energy: 7,
      transitionIn: 'cut',
    },
    {
      beatIndex: 4,
      archetype: 'Outro',
      startFrame: 370,
      durationInFrames: 80,
      text: 'AeroCut Architecture Reference',
      energy: 6,
      transitionIn: 'fade',
    },
  ],
  words: [
    // Phrase 1: 0.3s - 2.8s
    { word: 'Today', start: 0.3, end: 0.7, beatIndex: 0 },
    { word: 'we', start: 0.7, end: 0.9, beatIndex: 0 },
    { word: 'are', start: 0.9, end: 1.1, beatIndex: 0 },
    { word: 'exploring', start: 1.1, end: 1.7, beatIndex: 0 },
    { word: 'modern', start: 1.7, end: 2.1, beatIndex: 0 },
    { word: 'video', start: 2.1, end: 2.4, beatIndex: 0 },
    { word: 'pipelines.', start: 2.4, end: 2.8, beatIndex: 0 },

    // Phrase 2: 3.2s - 6.8s
    { word: 'Remotion', start: 3.2, end: 3.8, beatIndex: 1 },
    { word: 'treats', start: 3.8, end: 4.15, beatIndex: 1 },
    { word: 'every', start: 4.15, end: 4.45, beatIndex: 1 },
    { word: 'single', start: 4.45, end: 4.8, beatIndex: 1 },
    { word: 'frame', start: 4.8, end: 5.2, beatIndex: 1 },
    { word: 'as', start: 5.2, end: 5.4, beatIndex: 1 },
    { word: 'a', start: 5.4, end: 5.5, beatIndex: 1 },
    { word: 'pure', start: 5.5, end: 5.8, beatIndex: 1 },
    { word: 'function.', start: 5.8, end: 6.4, beatIndex: 1 },

    // Phrase 3: 7.1s - 9.8s
    { word: 'Compare', start: 7.1, end: 7.6, beatIndex: 2 },
    { word: 'imperative', start: 7.6, end: 8.3, beatIndex: 2 },
    { word: 'animation', start: 8.3, end: 8.9, beatIndex: 2 },
    { word: 'with', start: 8.9, end: 9.15, beatIndex: 2 },
    { word: 'deterministic', start: 9.15, end: 9.8, beatIndex: 2 },
    { word: 'code.', start: 9.8, end: 10.2, beatIndex: 2 },

    // Phrase 4: 10.5s - 12.8s
    { word: 'Each', start: 10.5, end: 10.8, beatIndex: 3 },
    { word: 'frame', start: 10.8, end: 11.2, beatIndex: 3 },
    { word: 'renders', start: 11.2, end: 11.6, beatIndex: 3 },
    { word: 'concurrently', start: 11.6, end: 12.3, beatIndex: 3 },
    { word: 'on', start: 12.3, end: 12.5, beatIndex: 3 },
    { word: 'GPU.', start: 12.5, end: 12.9, beatIndex: 3 },

    // Phrase 5: 13.2s - 14.8s
    { word: 'Clean,', start: 13.2, end: 13.6, beatIndex: 4 },
    { word: 'fast,', start: 13.6, end: 14.0, beatIndex: 4 },
    { word: 'and', start: 14.0, end: 14.2, beatIndex: 4 },
    { word: 'fully', start: 14.2, end: 14.5, beatIndex: 4 },
    { word: 'reproducible.', start: 14.5, end: 15.0, beatIndex: 4 },
  ],
  audio: {
    voicePath: '',
    musicPath: undefined,
    musicGainDb: -10,
    duckToDb: -22,
    sfx: [],
  },
  theme: {
    background: '#0A0A0B',
    foreground: '#FAFAFA',
    accent: '#38BDF8',
    fontFamily: 'Inter',
    monoFontFamily: 'JetBrains Mono',
  },
};
