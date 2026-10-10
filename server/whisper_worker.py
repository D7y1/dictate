"""Dictate transcription worker.

Long-lived process: loads a faster-whisper model once, then answers JSON-line
requests on stdin with word-timestamped segments on stdout.

  request:  {"id": 1, "audio": "path/to/audio.webm", "language": null | "en" | "ar"}
  response: {"id": 1, "ok": true, "language": "en", "segments": [...]}

The first line written is {"event": "ready", ...} once the model is loaded.
"""

import json
import os
import sys
import traceback


def emit(obj):
    # ASCII-escaped so Arabic survives any Windows console code page.
    sys.stdout.write(json.dumps(obj, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def expose_cuda_dlls():
    """CTranslate2 needs cuBLAS/cuDNN on the DLL path; borrow them from torch or the nvidia-* wheels."""
    if os.name != "nt":
        return
    import importlib.util

    dirs = []
    spec = importlib.util.find_spec("torch")
    if spec and spec.origin:
        dirs.append(os.path.join(os.path.dirname(spec.origin), "lib"))
    for pkg in ("nvidia.cublas", "nvidia.cudnn", "nvidia.cuda_nvrtc"):
        try:
            spec = importlib.util.find_spec(pkg)
        except Exception:
            spec = None
        if spec and spec.submodule_search_locations:
            dirs.extend(os.path.join(p, "bin") for p in spec.submodule_search_locations)
    for d in dirs:
        if os.path.isdir(d):
            os.add_dll_directory(d)
            os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")


def load_model(force_cpu=False):
    from faster_whisper import WhisperModel

    requested = os.environ.get("DICTATE_WHISPER_MODEL")
    device = "cpu" if force_cpu else os.environ.get("DICTATE_WHISPER_DEVICE")
    if not device:
        try:
            import ctranslate2

            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        except Exception:
            device = "cpu"

    # GTX 16xx cards produce garbage with pure float16, so int8_float16 is the safe GPU default.
    attempts = []
    if device == "cuda":
        attempts.append((requested or "large-v3-turbo", "cuda", os.environ.get("DICTATE_WHISPER_COMPUTE", "int8_float16")))
    attempts.append((requested or "small", "cpu", "int8"))

    last_error = None
    for name, dev, compute in attempts:
        for local_only in (True, False):  # prefer the cached model; download only if missing
            try:
                model = WhisperModel(name, device=dev, compute_type=compute, local_files_only=local_only)
                return model, name, dev, compute
            except Exception as exc:  # fall through to the next option
                last_error = exc
    raise last_error


# Phrases Whisper invents over silence, music or noise (it learned them from subtitle credits).
PHANTOMS = {
    "thank you", "thank you.", "thanks for watching", "thanks for watching!", "thank you for watching",
    "please subscribe", "subscribe", "bye", "bye.", "you", "okay.", ".",
    "شكرا", "شكرا.", "شكرا لكم", "شكرا للمشاهدة", "اشتركوا في القناة", "ترجمة نانسي قنقر", "سبحان الله",
}


def is_phantom(seg):
    """True when a segment is most likely Whisper hallucinating on non-speech."""
    text = seg.text.strip().lower()
    if seg.no_speech_prob > 0.6 and seg.avg_logprob < -0.8:
        return True
    if seg.compression_ratio > 2.6:  # repetition loops
        return True
    if text in PHANTOMS and (seg.no_speech_prob > 0.2 or seg.avg_logprob < -0.45):
        return True
    return False


def transcribe(model, audio, language):
    segments, info = model.transcribe(
        audio,
        language=language or None,
        # With no fixed language, detect it per segment so Arabic and English can mix.
        multilingual=not language,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
        condition_on_previous_text=False,
        hallucination_silence_threshold=1.0,
        beam_size=5,
    )
    out = []
    dropped = 0
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        if is_phantom(seg):
            dropped += 1
            continue
        out.append(
            {
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": text,
                "noSpeech": round(seg.no_speech_prob, 3),
                "logprob": round(seg.avg_logprob, 3),
                "words": [
                    {"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word, "p": round(w.probability, 3)}
                    for w in (seg.words or [])
                ],
            }
        )
    return {"language": info.language, "languageProbability": round(info.language_probability, 3), "duration": round(info.duration, 3), "dropped": dropped, "segments": out}


def main():
    expose_cuda_dlls()
    try:
        model, name, device, compute = load_model()
    except Exception as exc:
        emit({"event": "error", "error": f"Could not load a Whisper model: {exc}"})
        return 1
    emit({"event": "ready", "model": name, "device": device, "compute": compute})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            try:
                result = transcribe(model, req["audio"], req.get("language"))
            except RuntimeError as exc:
                # CUDA libraries can fail only at first inference; retry once on CPU.
                if device != "cuda":
                    raise
                emit({"event": "fallback", "reason": str(exc)})
                model, name, device, compute = load_model(force_cpu=True)
                result = transcribe(model, req["audio"], req.get("language"))
            emit({"id": req_id, "ok": True, "model": name, "device": device, **result})
        except Exception as exc:
            emit({"id": req_id, "ok": False, "error": str(exc), "trace": traceback.format_exc(limit=3)})
    return 0


if __name__ == "__main__":
    sys.exit(main())
