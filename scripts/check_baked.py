# -*- coding: utf-8 -*-
"""Сверка wordBank + числительные с public/tts/eugene/*.wav."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "src" / "game" / "wordBank.ts"
RU_NUMBERS = ROOT / "src" / "game" / "ruNumbers.ts"
EUGENE = ROOT / "public" / "tts" / "eugene"

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


def slug(w: str) -> str:
    text = w.strip().lower()
    text = re.sub(r"[^а-яё\-\s]+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip()
    return text.replace(" ", "_")


def wanted() -> set[str]:
    slugs: set[str] = set()
    bank = BANK.read_text(encoding="utf-8")
    for m in re.finditer(r"\{\s*w:\s*'([^']+)'", bank):
        s = slug(m.group(1))
        if s:
            slugs.add(s)
    if RU_NUMBERS.is_file():
        for m in re.finditer(r":\s*'([^']+)'", RU_NUMBERS.read_text(encoding="utf-8")):
            s = slug(m.group(1))
            if s and re.search(r"[а-яё]", s):
                slugs.add(s)
    for c in EXTRA_CARDINALS:
        s = slug(c)
        if s:
            slugs.add(s)
    slugs.add("кот")
    return slugs


def main() -> int:
    files = {p.stem for p in EUGENE.glob("*.wav")} if EUGENE.is_dir() else set()
    need = wanted()
    missing = sorted(need - files)
    orphans = sorted(files - need)
    print("wanted", len(need), "files", len(files), "missing", len(missing), "orphans", len(orphans))
    print("sample missing", missing[:40])
    print("sample orphans", orphans[:20])
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
