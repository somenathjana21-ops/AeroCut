import sys
import os
import json
import soundfile as sf
from faster_whisper import WhisperModel

# Redirect stdout to stderr for all imports, library messages, and logs.
# Only the final JSON result will be written to the original stdout.
ORIG_STDOUT = sys.stdout
sys.stdout = sys.stderr

# Suppress Hugging Face symlink warnings on Windows
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

def resolve_device(requested_device: str) -> str:
    dev = (requested_device or "auto").lower()
    if dev == "auto":
        try:
            import ctranslate2
            if ctranslate2.get_cuda_device_count() > 0:
                return "cuda"
            return "cpu"
        except Exception as e:
            sys.stderr.write(f"CUDA check encountered error: {e}, falling back to cpu\n")
            return "cpu"
    return dev

def run_transcription(audio_path: str, model_name: str, device: str, compute_type: str):
    sys.stderr.write(
        f"Loading faster-whisper model '{model_name}' on device='{device}' (compute_type='{compute_type}')...\n"
    )
    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    sys.stderr.write(f"Transcribing '{audio_path}' with word_timestamps=True...\n")
    segments_iter, info = model.transcribe(audio_path, word_timestamps=True)
    # Evaluate generator into list immediately so CUDA execution errors are caught in the try block
    segments = list(segments_iter)
    return segments, info

def main():
    try:
        raw_input = sys.stdin.read().strip()
        if not raw_input:
            raise ValueError("No input received on stdin")
        payload = json.loads(raw_input)

        audio_path = payload.get("audioPath")
        if not audio_path or not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: '{audio_path}'")

        model_name = payload.get("model") or "base"
        requested_device = payload.get("device") or "auto"
        target_device = resolve_device(requested_device)
        
        # Determine compute type
        requested_compute_type = payload.get("computeType") or payload.get("compute_type")
        if requested_compute_type:
            compute_type = requested_compute_type
        else:
            compute_type = "float16" if target_device == "cuda" else "int8"

        fell_back_to_cpu = False
        segments = []
        info = None

        if target_device == "cuda":
            try:
                segments, info = run_transcription(audio_path, model_name, "cuda", compute_type)
            except Exception as cuda_err:
                sys.stderr.write(
                    f"CUDA execution failed: {cuda_err}\nRetrying on CPU with compute_type='int8'...\n"
                )
                target_device = "cpu"
                compute_type = "int8"
                fell_back_to_cpu = True
                segments, info = run_transcription(audio_path, model_name, "cpu", "int8")
        else:
            segments, info = run_transcription(audio_path, model_name, "cpu", compute_type)

        words = []
        segment_texts = []
        for s in segments:
            if s.text:
                segment_texts.append(s.text.strip())
            if s.words:
                for w in s.words:
                    word_token = w.word.strip()
                    if word_token:
                        words.append({
                            "word": word_token,
                            "start": round(float(w.start), 3),
                            "end": round(float(w.end), 3)
                        })

        full_text = " ".join(segment_texts).strip()
        duration_sec = round(float(info.duration), 3) if info and info.duration else 0.0

        if duration_sec <= 0.0:
            try:
                file_info = sf.info(audio_path)
                duration_sec = round(float(file_info.duration), 3)
            except Exception:
                pass

        result = {
            "durationSec": duration_sec,
            "text": full_text,
            "words": words,
            "device": target_device
        }

        if fell_back_to_cpu:
            result["fellBackToCpu"] = True

        ORIG_STDOUT.write(json.dumps(result) + "\n")
        ORIG_STDOUT.flush()
    except Exception as e:
        sys.stderr.write(f"Error in whisper_transcriber: {e}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
