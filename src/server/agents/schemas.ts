import { z } from 'zod';
export {
  WordSchema,
  SceneSchema,
  CompositionPropsSchema,
  type Word,
  type Scene,
  type CompositionProps,
} from '../../remotion/schema.js';

// ---------------------------------------------------------------------------
// Agent 1: Ingestion Schemas
// ---------------------------------------------------------------------------

export const AssetTagSchema = z.enum([
  'talking-head',
  'b-roll',
  'screen-capture',
  'music',
  'sfx-riser',
  'sfx-impact',
  'sfx-whoosh',
  'sfx-ui',
  'unknown',
]);

export type AssetTag = z.infer<typeof AssetTagSchema>;

export const AssetSchema = z.object({
  id: z.string(), // stable hash of path + mtime
  filename: z.string(),
  filepath: z.string(),
  type: z.enum(['video', 'image', 'audio']),
  tag: AssetTagSchema,
  durationSec: z.number().nonnegative(),
  dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
  fps: z.number().optional(),
  hasAudio: z.boolean(),
  codec: z.string().optional(),
});

export type Asset = z.infer<typeof AssetSchema>;

export const AssetCatalogSchema = z.object({
  scannedAt: z.string().datetime(),
  assets: z.array(AssetSchema),
});

export type AssetCatalog = z.infer<typeof AssetCatalogSchema>;

// ---------------------------------------------------------------------------
// Agent 2: Narrative Director Schemas
// ---------------------------------------------------------------------------

export const BeatArchetypeSchema = z.enum([
  'TitleCard',
  'KineticText',
  'AssetCut',
  'CodeView',
  'SplitCompare',
  'DiagramStep',
  'Outro',
]);

export type BeatArchetype = z.infer<typeof BeatArchetypeSchema>;

export const BeatSchema = z.object({
  index: z.number().int().nonnegative(),
  voiceover: z.string().min(1),
  archetype: BeatArchetypeSchema,
  energy: z.number().int().min(1).max(10),
  preferredAssetIds: z.array(z.string()).default([]),
  codeSnippet: z
    .object({
      language: z.string(),
      code: z.string(),
    })
    .optional(),
  transitionIn: z.enum(['cut', 'whoosh', 'impact', 'fade']).default('cut'),
  estimatedDurationSec: z.number().positive(),
});

export type Beat = z.infer<typeof BeatSchema>;

export const EDLSchema = z
  .object({
    mode: z.enum(['fast', 'quality']),
    aspectRatio: z.enum(['9:16', '16:9']),
    title: z.string(),
    hookLine: z.string(),
    beats: z.array(BeatSchema).min(2),
    musicAssetId: z.string().optional(),
  })
  .superRefine((edl, ctx) => {
    const total = edl.beats.reduce((s, b) => s + b.estimatedDurationSec, 0);
    if (edl.mode === 'fast' && total > 45) {
      ctx.addIssue({
        code: 'custom',
        message: `Fast Mode capped at 45s, plan is ${total.toFixed(1)}s`,
      });
    }
    const [lo, hi] = edl.mode === 'fast' ? [1.2, 2.5] : [4, 9];
    edl.beats.forEach((b, i) => {
      if (b.estimatedDurationSec < lo || b.estimatedDurationSec > hi) {
        ctx.addIssue({
          code: 'custom',
          path: ['beats', i],
          message: `Beat ${i}: ${b.estimatedDurationSec}s outside ${lo}-${hi}s`,
        });
      }
    });
    if (
      edl.mode === 'fast' &&
      edl.beats[0].archetype !== 'TitleCard' &&
      edl.beats[0].archetype !== 'KineticText'
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Fast Mode must open with a hook beat',
      });
    }
  });

export type EditDecisionList = z.infer<typeof EDLSchema>;

// ---------------------------------------------------------------------------
// Agent 3: Audio Timeline Schemas
// ---------------------------------------------------------------------------

export const AudioTimelineSchema = z.object({
  jobId: z.string(),
  voiceTrackPath: z.string(),
  totalDurationSec: z.number().positive(),
  beats: z.array(
    z.object({
      index: z.number().int(),
      audioPath: z.string(),
      startSec: z.number(),
      endSec: z.number(),
    })
  ),
  words: z.array(
    z.object({
      word: z.string(),
      start: z.number(),
      end: z.number(),
      beatIndex: z.number().int(),
    })
  ),
  sfxPlacements: z.array(
    z.object({
      assetId: z.string(),
      atSec: z.number(),
      gainDb: z.number().default(-2),
    })
  ),
  music: z
    .object({
      assetId: z.string(),
      gainDb: z.number(),
      duckToDb: z.number(),
      duckRegions: z.array(z.object({ start: z.number(), end: z.number() })),
    })
    .optional(),
});

export type AudioTimeline = z.infer<typeof AudioTimelineSchema>;
