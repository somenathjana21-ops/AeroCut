import sys
import os
import json
import asyncio
import tempfile
import numpy as np
import soundfile as sf
import edge_tts

# Redirect stdout to stderr for all imports, library messages, and logs.
# Only the final JSON result will be written to the original stdout.
ORIG_STDOUT = sys.stdout
sys.stdout = sys.stderr

async def synthesize_tts(payload: dict) -> dict:
    text = payload.get("text", "")
    voice = payload.get("voice") or "en-US-ChristopherNeural"
    output_path = payload.get("outputPath", "")
    rate = payload.get("rate") or "+0%"

    if not text:
        raise ValueError("Field 'text' is required and cannot be empty")
    if not output_path:
        raise ValueError("Field 'outputPath' is required and cannot be empty")

    output_abs_path = os.path.abspath(output_path)
    os.makedirs(os.path.dirname(output_abs_path), exist_ok=True)

    # 1. Synthesize to temporary MP3 file
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_file:
        tmp_path = tmp_file.name

    try:
        sys.stderr.write(f"Synthesizing voice '{voice}' (rate: {rate})...\n")
        communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
        await communicate.save(tmp_path)

        # 2. Read audio data for silence trimming
        data, sample_rate = sf.read(tmp_path)
        if len(data) == 0:
            raise ValueError("Synthesized audio file is empty (0 samples)")

        # 3. Detect first sample above -45 dBFS threshold
        # dBFS formula: 20 * log10(|sample|) >= -45  =>  |sample| >= 10 ** (-45 / 20)
        threshold_amplitude = 10.0 ** (-45.0 / 20.0)
        if data.ndim > 1:
            magnitude = np.max(np.abs(data), axis=1)
        else:
            magnitude = np.abs(data)

        audible_indices = np.where(magnitude >= threshold_amplitude)[0]
        if len(audible_indices) > 0:
            first_audible_sample = int(audible_indices[0])
            lead_samples = int(0.020 * sample_rate)  # 20ms of lead
            trim_sample_index = max(0, first_audible_sample - lead_samples)
        else:
            trim_sample_index = 0

        trim_sample_index = min(trim_sample_index, max(0, len(data) - 1))
        trimmed_ms = float((trim_sample_index / sample_rate) * 1000.0)
        trimmed_data = data[trim_sample_index:]

        sys.stderr.write(
            f"Trimming leading silence: cut {trim_sample_index} samples ({trimmed_ms:.2f}ms)\n"
        )

        # 4. Write trimmed MP3 to output_path
        sf.write(output_abs_path, trimmed_data, sample_rate, format="MP3")

        # 5. Measure true duration of the written file
        file_info = sf.info(output_abs_path)
        duration_sec = float(file_info.duration)

        sys.stderr.write(
            f"Wrote {output_abs_path} (duration: {duration_sec:.3f}s, trimmed: {trimmed_ms:.2f}ms)\n"
        )

        return {
            "outputPath": output_path,
            "durationSec": round(duration_sec, 4),
            "trimmedMs": round(trimmed_ms, 2)
        }
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass

def main():
    try:
        raw_input = sys.stdin.read().strip()
        if not raw_input:
            raise ValueError("No input received on stdin")
        payload = json.loads(raw_input)
        result = asyncio.run(synthesize_tts(payload))
        
        # Write ONLY the result JSON to the original stdout
        ORIG_STDOUT.write(json.dumps(result) + "\n")
        ORIG_STDOUT.flush()
    except Exception as e:
        sys.stderr.write(f"Error in tts_synthesizer: {e}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
