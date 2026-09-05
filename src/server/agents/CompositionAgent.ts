import { toStaticAssetPath, syncAssetToPublic } from '../utils/paths';
import {
  CompositionPropsSchema,
  type CompositionProps,
  type Scene,
  type Word,
} from '../../remotion/schema';
import type {
  EditDecisionList,
  AudioTimeline,
  AssetCatalog,
} from './schemas';

export interface ComposeInput {
  jobId: string;
  edl: EditDecisionList;
  audioTimeline: AudioTimeline;
  catalog: AssetCatalog;
  fps?: number;
}

export class CompositionAgent {
  /**
   * Merges EDL and AudioTimeline into typed CompositionProps.
   * Converts all scene and SFX timings to integer frames.
   * Resolves static asset paths and generates Ken Burns motion parameters.
   */
  public compose(input: ComposeInput): CompositionProps {
    const { jobId, edl, audioTimeline, catalog } = input;
    const fps = input.fps || 30;

    const isFast = edl.mode === 'fast';
    const width = edl.aspectRatio === '9:16' ? 1080 : 1920;
    const height = edl.aspectRatio === '9:16' ? 1920 : 1080;

    // durationInFrames = ceil(totalDurationSec * fps) + 15 frame tail
    const totalFrames = Math.ceil(audioTimeline.totalDurationSec * fps) + 15;

    // Asset map for quick lookup by ID
    const assetMap = new Map(catalog.assets.map((a) => [a.id, a]));

    // Build scene list with integer frame timings
    const scenes: Scene[] = [];
    const beatsCount = audioTimeline.beats.length;

    for (let i = 0; i < beatsCount; i++) {
      const audioBeat = audioTimeline.beats[i];
      const edlBeat = edl.beats[i] || edl.beats[edl.beats.length - 1];

      const startFrame = Math.round(audioBeat.startSec * fps);
      let durationInFrames: number;

      if (i < beatsCount - 1) {
        const nextStartFrame = Math.round(audioTimeline.beats[i + 1].startSec * fps);
        durationInFrames = Math.max(1, nextStartFrame - startFrame);
      } else {
        // Last scene takes the remaining duration
        durationInFrames = Math.max(1, totalFrames - startFrame);
      }

      // Resolve visual asset path if applicable
      let assetPath: string | undefined;
      if (edlBeat.preferredAssetIds && edlBeat.preferredAssetIds.length > 0) {
        for (const id of edlBeat.preferredAssetIds) {
          const matched = assetMap.get(id);
          if (matched) {
            assetPath = toStaticAssetPath(matched.filepath);
            break;
          }
        }
      }

      // If archetype is AssetCut and no preferred asset matched, pick an available b-roll
      if (!assetPath && edlBeat.archetype === 'AssetCut') {
        const bRoll = catalog.assets.find((a) => a.tag === 'b-roll' || a.tag === 'screen-capture');
        if (bRoll) {
          assetPath = toStaticAssetPath(bRoll.filepath);
        }
      }

      if (assetPath) {
        syncAssetToPublic(assetPath);
      }

      // Generate dynamic Ken Burns parameters based on energy & index
      const isEven = i % 2 === 0;
      const zoomIntensity = Math.min(0.18, 0.05 + (edlBeat.energy / 10) * 0.1);
      const kenBurns = {
        fromScale: isEven ? 1.0 : Math.round((1.0 + zoomIntensity) * 100) / 100,
        toScale: isEven ? Math.round((1.0 + zoomIntensity) * 100) / 100 : 1.0,
        fromX: isEven ? -15 : 15,
        fromY: isEven ? 8 : -8,
      };

      scenes.push({
        beatIndex: edlBeat.index,
        archetype: edlBeat.archetype,
        startFrame,
        durationInFrames,
        assetPath,
        text: edlBeat.voiceover,
        codeSnippet: edlBeat.codeSnippet,
        energy: edlBeat.energy,
        transitionIn: edlBeat.transitionIn,
        kenBurns,
      });
    }

    // Resolve Music path
    let musicPath: string | undefined;
    if (audioTimeline.music?.assetId) {
      const musicAsset = assetMap.get(audioTimeline.music.assetId);
      if (musicAsset) {
        musicPath = toStaticAssetPath(musicAsset.filepath);
      }
    }

    if (musicPath) {
      syncAssetToPublic(musicPath);
    }

    // Convert SFX placements to integer frames and resolve paths
    const sfx = audioTimeline.sfxPlacements
      .map((placement) => {
        const asset = assetMap.get(placement.assetId);
        if (!asset) return null;
        const sfxPath = toStaticAssetPath(asset.filepath);
        syncAssetToPublic(sfxPath);
        return {
          path: sfxPath,
          atFrame: Math.round(placement.atSec * fps),
        };
      })
      .filter((item): item is { path: string; atFrame: number } => item !== null);

    const props: CompositionProps = {
      jobId,
      mode: edl.mode,
      width,
      height,
      fps,
      durationInFrames: totalFrames,
      scenes,
      words: audioTimeline.words,
      audio: {
        voicePath: audioTimeline.voiceTrackPath,
        musicPath,
        musicGainDb: audioTimeline.music?.gainDb ?? -8,
        duckToDb: audioTimeline.music?.duckToDb ?? -18,
        sfx,
      },
      theme: {
        background: process.env.THEME_BACKGROUND || '#0A0A0B',
        foreground: process.env.THEME_FOREGROUND || '#FAFAFA',
        accent: process.env.THEME_ACCENT || '#4F8CFF',
        fontFamily: 'Inter',
        monoFontFamily: 'JetBrains Mono',
      },
    };

    return CompositionPropsSchema.parse(props);
  }
}

export const compositionAgent = new CompositionAgent();
