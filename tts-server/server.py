"""
Локальный живой диктор: Silero TTS v5 (open-source, лучший для русского).
GET /tts?q=слово&voice=aidar → audio/wav
"""

from __future__ import annotations

import io
import os
import ssl
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
import torch

from stress import mark_stress
from shape import SHAPES, shape_word

PORT = int(os.environ.get("TTS_PORT", "9899"))
SAMPLE_RATE = int(os.environ.get("TTS_SR", "48000"))
DEFAULT_VOICE = os.environ.get("TTS_VOICE", "aidar")
VOICES = ("aidar", "baya", "kseniya", "xenia", "eugene")

MODEL_URL = "https://models.silero.ai/models/tts/ru/v5_ru.pt"
# ~145_411_255 bytes expected
MODEL_MIN_BYTES = 100_000_000

HUB_ROOT = Path.home() / ".cache" / "torch" / "hub" / "snakers4_silero-models_master"
MODEL_DIR = HUB_ROOT / "src" / "silero" / "model"
LOCAL_MODEL = Path(__file__).resolve().parent / "models" / "v5_ru.pt"


def _download(url: str, dest: Path, attempts: int = 6) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    ctx = ssl.create_default_context()
    last_err: Exception | None = None
    for i in range(1, attempts + 1):
        try:
            print(f"Downloading Silero weights ({i}/{attempts})…", flush=True)
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "khudo-bystro-tts/1.0"},
            )
            with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
                total = int(resp.headers.get("Content-Length") or 0)
                done = 0
                with open(tmp, "wb") as f:
                    while True:
                        chunk = resp.read(1024 * 256)
                        if not chunk:
                            break
                        f.write(chunk)
                        done += len(chunk)
                        if total and done % (5 * 1024 * 1024) < 256 * 1024:
                            pct = int(done * 100 / total)
                            print(f"  {pct}% ({done // (1024 * 1024)} MB)", flush=True)
            size = tmp.stat().st_size
            if size < MODEL_MIN_BYTES:
                raise RuntimeError(f"download too small: {size} bytes")
            tmp.replace(dest)
            print(f"Saved {dest} ({size // (1024 * 1024)} MB)", flush=True)
            return
        except Exception as e:  # noqa: BLE001
            last_err = e
            print(f"download failed: {e}", flush=True)
            if tmp.exists():
                try:
                    tmp.unlink()
                except OSError:
                    pass
            time.sleep(min(2 * i, 12))
    raise RuntimeError(f"cannot download Silero model: {last_err}")


def _find_existing() -> Path | None:
    candidates = [
        LOCAL_MODEL,
        MODEL_DIR / "v5_ru.pt",
        HUB_ROOT / "src" / "silero" / "v5_ru.pt",  # wrong path from earlier curl
    ]
    for p in candidates:
        if p.is_file() and p.stat().st_size >= MODEL_MIN_BYTES:
            return p
    return None


def load_silero():
    """Load v5_ru via PackageImporter (avoids fragile torch.hub re-download)."""
    existing = _find_existing()
    if existing is None:
        target = LOCAL_MODEL
        _download(MODEL_URL, target)
        existing = target
    else:
        print(f"Using cached weights: {existing}", flush=True)

    # Keep a copy where torch.hub / silero expects it
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    expected = MODEL_DIR / "v5_ru.pt"
    if existing.resolve() != expected.resolve():
        if not expected.exists() or expected.stat().st_size < MODEL_MIN_BYTES:
            print(f"Copying weights → {expected}", flush=True)
            expected.write_bytes(existing.read_bytes())

    from torch import package

    imp = package.PackageImporter(str(expected))
    model = imp.load_pickle("tts_models", "model")
    return model


print("Loading Silero v5_ru…", flush=True)
device = torch.device("cpu")
model = load_silero()
model.to(device)
print(
    f"Silero ready on http://127.0.0.1:{PORT}/tts  voices={','.join(VOICES)}",
    flush=True,
)


def float_to_wav(audio: np.ndarray, sr: int) -> bytes:
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    audio = np.clip(audio, -1.0, 1.0)
    pcm = (audio * 32767.0).astype("<i2")
    data_size = pcm.nbytes
    buf = io.BytesIO()
    buf.write(b"RIFF")
    buf.write(int(36 + data_size).to_bytes(4, "little"))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write((16).to_bytes(4, "little"))
    buf.write((1).to_bytes(2, "little"))
    buf.write((1).to_bytes(2, "little"))
    buf.write(int(sr).to_bytes(4, "little"))
    buf.write(int(sr * 2).to_bytes(4, "little"))
    buf.write((2).to_bytes(2, "little"))
    buf.write((16).to_bytes(2, "little"))
    buf.write(b"data")
    buf.write(int(data_size).to_bytes(4, "little"))
    buf.write(pcm.tobytes())
    return buf.getvalue()


_synth_lock = threading.Lock()


def speakable(text: str) -> tuple[str, bool]:
    """Точка в конце, чтобы модель договорила последний слог.

    Для слов игры ударение стоит вручную: автоударение съедает «ын» в «дыне»
    и читает «г» в «гвозде» как «х».
    """
    text = " ".join(text.split()).lower()
    phrase, manual = mark_stress(text)
    if phrase and phrase[-1] not in ".!?…":
        phrase += "."
    return phrase, manual


def _reset_model_state() -> None:
    modules = getattr(model, "modules", None)
    if not callable(modules):
        return
    for module in modules():
        reset = getattr(module, "reset_states", None)
        if not callable(reset):
            continue
        try:
            reset()
        except Exception:
            pass


def synthesize(text: str, voice: str) -> bytes:
    speaker = voice if voice in VOICES else DEFAULT_VOICE
    clean = " ".join(text.split()).lower()
    shaped = clean in SHAPES
    if shaped:
        phrase, manual = SHAPES[clean], True
    else:
        phrase, manual = speakable(clean)
    with _synth_lock:
        with torch.inference_mode():
            audio = model.apply_tts(
                text=phrase,
                speaker=speaker,
                sample_rate=SAMPLE_RATE,
                # Своё «+» не отдаём автоударению — оно переставляет удар и смазывает согласные.
                put_accent=not manual,
                put_yo=True,
            )
        if hasattr(audio, "detach"):
            arr = np.array(audio.detach().cpu().numpy(), dtype=np.float32, copy=True)
        else:
            arr = np.array(audio, dtype=np.float32, copy=True)
        if shaped:
            shaped_arr = shape_word(clean, arr, SAMPLE_RATE)
            # Если «а» в «гриба» не отделилась, не говорим «гриба» — оставляем обычное «гриб».
            if clean == "гриб" and shaped_arr is arr:
                audio = model.apply_tts(
                    text="гр+иб.",
                    speaker=speaker,
                    sample_rate=SAMPLE_RATE,
                    put_accent=False,
                    put_yo=True,
                )
                if hasattr(audio, "detach"):
                    arr = np.array(audio.detach().cpu().numpy(), dtype=np.float32, copy=True)
                else:
                    arr = np.array(audio, dtype=np.float32, copy=True)
            else:
                arr = shaped_arr
        _reset_model_state()
    return float_to_wav(arr, SAMPLE_RATE)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path in ("/", "/health"):
            body = b"ok silero"
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path != "/tts":
            self.send_response(404)
            self._cors()
            self.end_headers()
            return

        qs = parse_qs(parsed.query)
        text = (qs.get("q") or qs.get("text") or [""])[0].strip()
        voice = (qs.get("voice") or [DEFAULT_VOICE])[0].strip().lower()
        if not text or len(text) > 120:
            self.send_response(400)
            self._cors()
            self.end_headers()
            self.wfile.write(b"bad q")
            return

        try:
            wav = synthesize(text, voice)
        except Exception as e:  # noqa: BLE001
            msg = str(e).encode("utf-8", errors="ignore")
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return

        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Cache-Control", "public, max-age=86400")
        self.send_header("X-TTS-Engine", "silero")
        self.send_header("Content-Length", str(len(wav)))
        self.end_headers()
        self.wfile.write(wav)


if __name__ == "__main__":
    # Один поток: Silero не умеет параллельный apply_tts.
    HTTPServer.allow_reuse_address = True
    httpd = HTTPServer(("127.0.0.1", PORT), Handler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
