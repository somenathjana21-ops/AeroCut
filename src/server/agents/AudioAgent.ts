import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import { runPython } from '../utils/python-runner';
import { toStaticAssetPath, syncAssetToPublic, PROCESSED_DIR } from '../utils/paths';
import {
  AudioTimelineSchema,
  type AudioTimeline,
  type EditDecisionList,
  type AssetCatalog,
  type Word,
} from './schemas';

interface TtsResponse {
  outputPath: string;
  durationSec: number;
  trimmedMs: number;
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface WhisperResponse {
  durationSec: number;
  text: string;
  words: WhisperWord[];
  device?: string;
  fellBackToCpu?: boolean;
}

export interface BuildAudioTimelineInput {
  jobId: string;
  edl: EditDecisionList;
  catalog: AssetCatalog;
  voice?: string | null;
  onEvent?: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export class AudioAgent {
  /**
   * Synthesizes voice per beat, measures true duration, extracts word timestamps,
   * concatenates voice.mp3, places SFX at transitions, and builds duck regions.
   */
  public async buildTimeline(input: BuildAudioTimelineInput): Promise<AudioTimeline> {
    const { jobId, edl, catalog, voice, onEvent } = input;

    const jobProcessedDir = path.resolve(PROCESSED_DIR, jobId);
    if (!fs.existsSync(jobProcessedDir)) {
      fs.mkdirSync(jobProcessedDir, { recursive: true });
    }

    const ttsVoice = voice || process.env.TTS_VOICE || 'en-US-ChristopherNeural';
    const whisperModel = process.env.WHISPER_MODEL || 'base';
    const whisperDevice = process.env.WHISPER_DEVICE || 'auto';
    const whisperComputeType = process.env.WHISPER_COMPUTE_TYPE || 'int8';

    const beatsTimeline: Array<{
      index: number;
      audioPath: string;
      startSec: number;
      endSec: number;
    }> = [];

    const allWords: Word[] = [];
    let currentStartSec = 0.0;

    // 1. Synthesize each beat and transcribe
    for (let i = 0; i < edl.beats.length; i++) {
      const beat = edl.beats[i];
      const beatAudioFilename = `beat-${beat.index}.mp3`;
      const beatAudioPath = path.join(jobProcessedDir, beatAudioFilename);

      onEvent?.('info', `Synthesizing beat ${beat.index}: "${beat.voiceover.slice(0, 40)}..."`);

      // 1a. TTS synthesis via runPython (never whole-script)
      const ttsResult = await runPython<TtsResponse>(
        'python-services/tts_synthesizer.py',
        {
          text: beat.voiceover,
          voice: ttsVoice,
          outputPath: beatAudioPath,
          rate: '+0%',
        }
      );

      // Real measured duration replaces the LLM's estimate
      const measuredDurationSec = Math.max(0.2, ttsResult.durationSec);
      const beatStartSec = Math.round(currentStartSec * 1000) / 1000;
      const beatEndSec = Math.round((currentStartSec + measuredDurationSec) * 1000) / 1000;

      beatsTimeline.push({
        index: beat.index,
        audioPath: toStaticAssetPath(beatAudioPath),
        startSec: beatStartSec,
        endSec: beatEndSec,
      });

      // 1b. Per-beat transcription via faster-whisper
      let transcribedWords: WhisperWord[] = [];
      let usedFallback = false;

      try {
        const whisperResult = await runPython<WhisperResponse>(
          'python-services/whisper_transcriber.py',
          {
            audioPath: beatAudioPath,
            model: whisperModel,
            device: whisperDevice,
            computeType: whisperComputeType,
          }
        );

        if (whisperResult.words && whisperResult.words.length > 0) {
          transcribedWords = whisperResult.words;
        } else {
          usedFallback = true;
        }
      } catch (whisperErr: any) {
        onEvent?.(
          'warn',
          `Whisper transcription failed on beat ${beat.index} (${whisperErr.message}). Using proportional timing fallback.`
        );
        usedFallback = true;
      }

      // Proportional fallback timing if Whisper fails
      if (usedFallback || transcribedWords.length === 0) {
        onEvent?.(
          'info',
          `AlignmentQuality 'estimated' for beat ${beat.index}`
        );
        const tokens = beat.voiceover.trim().split(/\s+/).filter(Boolean);
        const count = tokens.length || 1;
        const wordDuration = measuredDurationSec / count;

        transcribedWords = tokens.map((tok, idx) => ({
          word: tok,
          start: Math.round(idx * wordDuration * 1000) / 1000,
          end: Math.round(((idx + 1) * wordDuration) * 1000) / 1000,
        }));
      }

      // Offset word timings by absolute beat start
      for (const tw of transcribedWords) {
        const absStart = Math.round((beatStartSec + tw.start) * 1000) / 1000;
        const absEnd = Math.round((beatStartSec + tw.end) * 1000) / 1000;
        allWords.push({
          word: tw.word,
          start: absStart,
          end: Math.max(absStart + 0.05, absEnd),
          beatIndex: beat.index,
        });
      }

      currentStartSec = beatEndSec;
    }

    const totalDurationSec = Math.round(currentStartSec * 1000) / 1000;

    // 2. Concatenate beat audio with ffmpeg concat demuxer
    const voiceTrackPath = path.join(jobProcessedDir, 'voice.mp3');
    const concatListPath = path.join(jobProcessedDir, 'concat_list.txt');
    const concatContent = beatsTimeline
      .map((b) => `file 'beat-${b.index}.mp3'`)
      .join('\n');

    fs.writeFileSync(concatListPath, concatContent, 'utf8');

    try {
      await execa('ffmpeg', [
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatListPath,
        '-c',
        'copy',
        '-y',
        voiceTrackPath,
      ]);
    } catch {
      // If direct copy fails, re-encode to clean MP3
      await execa('ffmpeg', [
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatListPath,
        '-c:a',
        'libmp3lame',
        '-q:a',
        '2',
        '-y',
        voiceTrackPath,
      ]);
    }

    syncAssetToPublic(toStaticAssetPath(voiceTrackPath));

    // 3. SFX placement: Place SFX at each transition +0.05s
    const sfxPlacements: Array<{ assetId: string; atSec: number; gainDb: number }> = [];
    const availableSfx = catalog.assets.filter((a) => a.tag.startsWith('sfx-'));

    for (let i = 1; i < beatsTimeline.length; i++) {
      const beat = edl.beats[i];
      const targetTag = beat.transitionIn === 'whoosh' ? 'sfx-whoosh' : 'sfx-impact';

      let matchingAsset = availableSfx.find((a) => a.tag === targetTag);
      if (!matchingAsset && availableSfx.length > 0) {
        matchingAsset = availableSfx[i % availableSfx.length];
      }

      if (matchingAsset) {
        sfxPlacements.push({
          assetId: matchingAsset.id,
          atSec: Math.round((beatsTimeline[i].startSec + 0.05) * 1000) / 1000,
          gainDb: -2,
        });
      }
    }

    // 4. Music bed & voice-active duck regions
    let musicConfig: AudioTimeline['music'] = undefined;
    let selectedMusicAsset = edl.musicAssetId
      ? catalog.assets.find((a) => a.id === edl.musicAssetId)
      : undefined;

    if (!selectedMusicAsset) {
      selectedMusicAsset = catalog.assets.find((a) => a.tag === 'music');
    }

    if (selectedMusicAsset) {
      const duckRegions: Array<{ start: number; end: number }> = [];
      const bridgeGap = 0.3; // bridge words within 300ms

      let regionStart = -1;
      let regionEnd = -1;

      for (const w of allWords) {
        if (regionStart === -1) {
          regionStart = w.start;
          regionEnd = w.end;
        } else if (w.start - regionEnd <= bridgeGap) {
          regionEnd = Math.max(regionEnd, w.end);
        } else {
          duckRegions.push({
            start: Math.round(regionStart * 1000) / 1000,
            end: Math.round(regionEnd * 1000) / 1000,
          });
          regionStart = w.start;
          regionEnd = w.end;
        }
      }

      if (regionStart !== -1) {
        duckRegions.push({
          start: Math.round(regionStart * 1000) / 1000,
          end: Math.round(regionEnd * 1000) / 1000,
        });
      }

      musicConfig = {
        assetId: selectedMusicAsset.id,
        gainDb: -8,
        duckToDb: -18,
        duckRegions,
      };
    }

    const timeline: AudioTimeline = {
      jobId,
      voiceTrackPath: toStaticAssetPath(voiceTrackPath),
      totalDurationSec,
      beats: beatsTimeline,
      words: allWords,
      sfxPlacements,
      music: musicConfig,
    };

    return AudioTimelineSchema.parse(timeline);
  }
}

export const audioAgent = new AudioAgent();
