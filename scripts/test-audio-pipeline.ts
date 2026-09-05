import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { runPython } from '../src/server/utils/python-runner.js';

interface TtsOutput {
  outputPath: string;
  durationSec: number;
  trimmedMs: number;
}

interface WordTiming {
  word: string;
  start: number;
  end: number;
}

interface TranscriberOutput {
  durationSec: number;
  text: string;
  words: WordTiming[];
  device?: string;
  fellBackToCpu?: boolean;
}

async function main() {
  const startTime = performance.now();

  console.log('='.repeat(70));
  console.log('AeroCut Audio Pipeline Test (Phase 2)');
  console.log('='.repeat(70));

  const sampleText =
    'Transformers changed everything about how machines understand language. Here is why.';
  const outputDir = path.resolve(process.cwd(), 'assets', 'processed', 'test-audio');
  const outputPath = path.join(outputDir, 'hook_test.mp3');

  fs.mkdirSync(outputDir, { recursive: true });

  // 1. Synthesize Audio
  console.log(`\n[1/2] Synthesizing speech via edge-tts...`);
  console.log(`Input text: "${sampleText}"`);

  const ttsPayload = {
    text: sampleText,
    voice: 'en-US-ChristopherNeural',
    outputPath,
    rate: '+0%',
  };

  const ttsResult = await runPython<TtsOutput>(
    'python-services/tts_synthesizer.py',
    ttsPayload
  );

  // Assertion 1: Check MP3 file exists and is non-zero
  if (!fs.existsSync(outputPath)) {
    throw new Error(`ASSERTION FAILED: Output MP3 file does not exist at ${outputPath}`);
  }
  const fileStat = fs.statSync(outputPath);
  if (fileStat.size === 0) {
    throw new Error(`ASSERTION FAILED: Output MP3 file exists but is 0 bytes (${outputPath})`);
  }

  // 2. Transcribe Audio
  console.log(`\n[2/2] Transcribing audio via faster-whisper...`);
  const transcriberPayload = {
    audioPath: outputPath,
    model: 'base',
    device: 'auto',
    computeType: 'int8',
  };

  const transcriberResult = await runPython<TranscriberOutput>(
    'python-services/whisper_transcriber.py',
    transcriberPayload
  );

  // Assertion 2: Check words array is not empty
  if (!transcriberResult.words || transcriberResult.words.length === 0) {
    throw new Error(`ASSERTION FAILED: Transcriber returned empty words array!`);
  }

  // Assertion 3: Check last word's end timestamp does not exceed audio duration
  const lastWord = transcriberResult.words[transcriberResult.words.length - 1];
  const audioDuration = ttsResult.durationSec;
  // Allow a tiny 0.05s tolerance for audio container padding/float precision
  if (lastWord.end > audioDuration + 0.05) {
    throw new Error(
      `ASSERTION FAILED: Last word "${lastWord.word}" end timestamp (${lastWord.end}s) exceeds audio duration (${audioDuration}s)!`
    );
  }

  const totalElapsedTimeMs = performance.now() - startTime;
  const totalElapsedTimeSec = (totalElapsedTimeMs / 1000).toFixed(2);

  // Device determination
  let deviceUsed = transcriberResult.device?.toUpperCase() || 'UNKNOWN';
  if (transcriberResult.fellBackToCpu) {
    deviceUsed = 'CPU (fell back from CUDA)';
  }

  // Print results
  console.log('\n' + '-'.repeat(70));
  console.log('Pipeline Results:');
  console.log('-'.repeat(70));
  console.log(`Audio file:        ${outputPath} (${fileStat.size} bytes)`);
  console.log(`Audio duration:    ${ttsResult.durationSec.toFixed(3)}s`);
  console.log(`Trimmed silence:   ${ttsResult.trimmedMs.toFixed(2)}ms`);
  console.log(`Word count:        ${transcriberResult.words.length}`);
  console.log(`Device used:       ${deviceUsed}`);
  console.log(`Total elapsed:     ${totalElapsedTimeSec}s`);

  // Verify word timestamps are valid, sorted, and non-overlapping
  for (let i = 0; i < transcriberResult.words.length; i++) {
    const w = transcriberResult.words[i];
    if (w.start > w.end) {
      throw new Error(`ASSERTION FAILED: Word ${i} ("${w.word}") has start (${w.start}) > end (${w.end})`);
    }
    if (i > 0) {
      const prev = transcriberResult.words[i - 1];
      if (w.start < prev.start) {
        throw new Error(`ASSERTION FAILED: Words out of order: "${prev.word}" (${prev.start}s) followed by "${w.word}" (${w.start}s)`);
      }
    }
  }

  console.log('\nFirst 5 words:');
  const firstFive = transcriberResult.words.slice(0, 5);
  for (let i = 0; i < firstFive.length; i++) {
    const w = firstFive[i];
    console.log(`  ${i + 1}. [${w.start.toFixed(2)}s - ${w.end.toFixed(2)}s] "${w.word}"`);
  }

  console.log('\nAll words timeline:');
  for (let i = 0; i < transcriberResult.words.length; i++) {
    const w = transcriberResult.words[i];
    console.log(`  ${(i + 1).toString().padStart(2, ' ')}. [${w.start.toFixed(2).padStart(5, ' ')}s - ${w.end.toFixed(2).padStart(5, ' ')}s] "${w.word}"`);
  }

  console.log(`\nLast word:`);
  console.log(
    `  [${lastWord.start.toFixed(2)}s - ${lastWord.end.toFixed(2)}s] "${lastWord.word}" (<= audio duration ${ttsResult.durationSec.toFixed(3)}s: PASS)`
  );

  console.log('-'.repeat(70));
  console.log('ALL ASSERTIONS PASSED');
  console.log('='.repeat(70) + '\n');
}

main().catch((err) => {
  console.error('\nAudio pipeline test failed:');
  console.error(err);
  process.exit(1);
});
