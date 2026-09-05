import { z } from 'zod';

export const WordSchema = z.object({
  word: z.string(),
  start: z.number(), // absolute seconds from video start
  end: z.number(),
  beatIndex: z.number().int(),
});

export type Word = z.infer<typeof WordSchema>;

export const SceneSchema = z.object({
  beatIndex: z.number().int(),
  archetype: z.string(),
  startFrame: z.number().int(),
  durationInFrames: z.number().int().positive(),
  assetPath: z.string().optional(),
  text: z.string().optional(),
  codeSnippet: z.object({ language: z.string(), code: z.string() }).optional(),
  energy: z.number().min(1).max(10),
  transitionIn: z.string(),
  kenBurns: z.object({
    fromScale: z.number(),
    toScale: z.number(),
    fromX: z.number(),
    fromY: z.number(),
  }).optional(),
});

export type Scene = z.infer<typeof SceneSchema>;

export const CompositionPropsSchema = z.object({
  jobId: z.string(),
  mode: z.enum(['fast', 'quality']),
  width: z.number().int(),
  height: z.number().int(),
  fps: z.number().int(),
  durationInFrames: z.number().int().positive(),
  scenes: z.array(SceneSchema),
  words: z.array(WordSchema),
  audio: z.object({
    voicePath: z.string(),
    musicPath: z.string().optional(),
    musicGainDb: z.number(),
    duckToDb: z.number(),
    sfx: z.array(z.object({ path: z.string(), atFrame: z.number().int() })),
  }),
  theme: z.object({
    background: z.string(),
    foreground: z.string(),
    accent: z.string(),
    fontFamily: z.string(),
    monoFontFamily: z.string(),
  }),
});

export type CompositionProps = z.infer<typeof CompositionPropsSchema>;
export type Theme = CompositionProps['theme'];
export type AudioProps = CompositionProps['audio'];
export type KenBurnsProps = NonNullable<Scene['kenBurns']>;
