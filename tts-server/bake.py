"""
Запекает Silero eugene в public/tts/eugene/*.wav для GitHub Pages.
Инкрементально: существующие файлы пропускает.

  py -3.12 tts-server/bake.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORD_BANK = ROOT / "src" / "game" / "wordBank.ts"
RU_NUMBERS = ROOT / "src" / "game" / "ruNumbers.ts"
OUT_DIR = ROOT / "public" / "tts" / "eugene"
VOICE = "eugene"

# Числительные 1…40 на случай wordCount=40 (на экране до 25, слоты до 40)
EXTRA_CARDINALS = [
    "один",
    "два",
    "три",
    "четыре",
    "пять",
    "шесть",
    "семь",
    "восемь",
    "девять",
    "десять",
    "одиннадцать",
    "двенадцать",
    "тринадцать",
    "четырнадцать",
    "пятнадцать",
    "шестнадцать",
    "семнадцать",
    "восемнадцать",
    "девятнадцать",
    "двадцать",
    "двадцать один",
    "двадцать два",
    "двадцать три",
    "двадцать четыре",
    "двадцать пять",
    "двадцать шесть",
    "двадцать семь",
    "двадцать восемь",
    "двадцать девять",
    "тридцать",
    "тридцать один",
    "тридцать два",
    "тридцать три",
    "тридцать четыре",
    "тридцать пять",
    "тридцать шесть",
    "тридцать семь",
    "тридцать восемь",
    "тридцать девять",
    "сорок",
]


def normalize_key(raw: str) -> str:
    text = raw.strip().lower()
    text = re.sub(r"[^а-яё\-\s]+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def slug_for(word: str) -> str:
    return normalize_key(word).replace(" ", "_")


def collect_phrases() -> list[str]:
    phrases: set[str] = set()
    bank = WORD_BANK.read_text(encoding="utf-8")
    for m in re.finditer(r"\{\s*w:\s*'([^']+)'", bank):
        key = normalize_key(m.group(1))
        if key:
            phrases.add(key)

    if RU_NUMBERS.is_file():
        nums = RU_NUMBERS.read_text(encoding="utf-8")
        for m in re.finditer(r":\s*'([^']+)'", nums):
            key = normalize_key(m.group(1))
            if key and re.search(r"[а-яё]", key):
                phrases.add(key)

    for c in EXTRA_CARDINALS:
        key = normalize_key(c)
        if key:
            phrases.add(key)

    # пробное слово для prepareNarrator
    phrases.add("кот")
    return sorted(phrases)


def wav_bytes_to_file(wav_bytes: bytes, dest: Path) -> None:
    """Silero уже отдаёт готовый WAV — пишем как есть."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(wav_bytes)


def main() -> int:
    phrases = collect_phrases()
    print(f"Phrases: {len(phrases)}", flush=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Импорт после сбора фраз — долгая загрузка модели
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from server import synthesize  # noqa: WPS433

    done = 0
    skipped = 0
    failed = 0
    for i, phrase in enumerate(phrases, 1):
        slug = slug_for(phrase)
        if not slug:
            continue
        dest = OUT_DIR / f"{slug}.wav"
        if dest.is_file() and dest.stat().st_size > 400:
            skipped += 1
            continue
        try:
            wav = synthesize(phrase, VOICE)
            wav_bytes_to_file(wav, dest)
            done += 1
            if done % 25 == 0 or i == len(phrases):
                print(
                    f"  baked {done} (+{skipped} skip) / {i}/{len(phrases)} — {phrase}",
                    flush=True,
                )
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  FAIL {phrase}: {e}", flush=True)

    print(
        f"Done. new={done} skipped={skipped} failed={failed} dir={OUT_DIR}",
        flush=True,
    )
    return 1 if failed and done == 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
