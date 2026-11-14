"""Точечная правка двух слов, которые Silero говорит криво.

«гриб» — конечная «б» без взрыва. Синтезируем «гриба» и срезаем гласную «а»,
оставляя щелчок согласной.
«паук» — ударное «у» тянется. Середину этой гласной укорачиваем, «па» и «к» не трогаем.
"""

from __future__ import annotations

import numpy as np

# phrase, put_accent is off because of «+»
SHAPES: dict[str, str] = {
    "гриб": "гр+иба",
    "паук": "па+ук.",
}


def _frames(y: np.ndarray, sr: int, win_s: float = 0.01) -> tuple[np.ndarray, int]:
    win = max(1, int(sr * win_s))
    n = len(y) // win
    if n <= 0:
        return np.zeros(0, dtype=np.float32), win
    rms = np.empty(n, dtype=np.float32)
    for i in range(n):
        chunk = y[i * win : (i + 1) * win]
        rms[i] = float(np.sqrt(np.mean(chunk * chunk)))
    return rms, win


def _spans(y: np.ndarray, sr: int, thr_ratio: float, merge_s: float) -> list[tuple[int, int]]:
    rms, win = _frames(y, sr)
    if len(rms) == 0 or float(rms.max()) < 1e-4:
        return []
    thr = max(0.012, thr_ratio * float(rms.max()))
    hot = rms > thr
    raw: list[tuple[int, int]] = []
    start = None
    for i, on in enumerate(hot):
        if on and start is None:
            start = i
        elif not on and start is not None:
            raw.append((start * win, i * win))
            start = None
    if start is not None:
        raw.append((start * win, min(len(y), len(hot) * win)))
    if not raw:
        return []
    merged = [raw[0]]
    gap = int(sr * merge_s)
    for a, b in raw[1:]:
        if a - merged[-1][1] <= gap:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    return merged


def _fade_out(y: np.ndarray, sr: int, ms: float = 18) -> np.ndarray:
    n = min(len(y), int(sr * ms / 1000))
    if n <= 1:
        return y
    out = y.copy()
    out[-n:] *= np.linspace(1.0, 0.0, n, dtype=np.float32)
    return out


def _join(a: np.ndarray, b: np.ndarray, sr: int, ms: float = 12) -> np.ndarray:
    n = min(len(a), len(b), int(sr * ms / 1000))
    if n <= 1:
        return np.concatenate([a, b])
    ramp = np.linspace(0.0, 1.0, n, dtype=np.float32)
    mid = a[-n:] * (1.0 - ramp) + b[:n] * ramp
    return np.concatenate([a[:-n], mid, b[n:]])


def _pad(y: np.ndarray, sr: int, ms: float = 40) -> np.ndarray:
    pad = np.zeros(int(sr * ms / 1000), dtype=np.float32)
    return np.concatenate([y, pad])


def drop_last_vowel(y: np.ndarray, sr: int) -> np.ndarray:
    """Срезать последнюю гласную, оставив короткий взрыв согласной перед ней."""
    spans = _spans(y, sr, thr_ratio=0.2, merge_s=0.045)
    if len(spans) < 2:
        return y
    onset, stop = spans[-1]
    if stop - onset < int(sr * 0.05):
        return y
    keep = onset + int(sr * 0.028)
    if keep >= len(y) - int(sr * 0.02):
        return y
    return _pad(_fade_out(y[:keep], sr, ms=8), sr)


def shorten_held_vowel(y: np.ndarray, sr: int) -> np.ndarray:
    """Убрать середину долгой ударной гласной. Начало и конец слога остаются."""
    spans = _spans(y, sr, thr_ratio=0.1, merge_s=0.03)
    if not spans:
        return y
    start, end = spans[0][0], spans[-1][1]
    if end - start < int(sr * 0.24):
        return y
    head_n = int(sr * 0.07)
    tail_n = int(sr * 0.09)
    mid_keep = int(sr * 0.05)
    if head_n + tail_n + mid_keep >= end - start:
        return y
    head = y[start : start + head_n]
    tail = y[end - tail_n : end]
    mid_a = start + head_n
    mid_b = end - tail_n
    cut = mid_a + max(0, (mid_b - mid_a - mid_keep) // 2)
    mid = y[cut : cut + mid_keep]
    body = _join(_join(head, mid, sr), tail, sr)
    return _pad(np.concatenate([y[:start], body]), sr)


def shape_word(word: str, audio: np.ndarray, sr: int) -> np.ndarray:
    if word == "гриб":
        return drop_last_vowel(audio, sr)
    if word == "паук":
        return shorten_held_vowel(audio, sr)
    return audio
