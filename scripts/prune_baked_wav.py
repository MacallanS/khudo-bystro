# -*- coding: utf-8 -*-
"""Удаляет WAV, которых нет в текущем wordBank (+ числительные bake)."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "src" / "game" / "wordBank.ts"
OUT = ROOT / "public" / "tts" / "eugene"


def normalize_key(raw: str) -> str:
    text = raw.strip().lower()
    text = re.sub(r"[^а-яё\-\s]+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def slug_for(word: str) -> str:
    return normalize_key(word).replace(" ", "_")


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


def wanted_slugs() -> set[str]:
    slugs: set[str] = set()
    bank = BANK.read_text(encoding="utf-8")
    for m in re.finditer(r"\{\s*w:\s*'([^']+)'", bank):
        slug = slug_for(m.group(1))
        if slug:
            slugs.add(slug)
    slugs.add("кот")
    nums = ROOT / "src" / "game" / "ruNumbers.ts"
    if nums.is_file():
        for m in re.finditer(r":\s*'([^']+)'", nums.read_text(encoding="utf-8")):
            slug = slug_for(m.group(1))
            if slug and re.search(r"[а-яё]", slug):
                slugs.add(slug)
    for c in EXTRA_CARDINALS:
        slug = slug_for(c)
        if slug:
            slugs.add(slug)
    return slugs


def main() -> None:
    if not OUT.is_dir():
        print("no out dir", OUT)
        return
    keep = wanted_slugs()
    removed = 0
    for wav in list(OUT.glob("*.wav")):
        if wav.stem not in keep:
            wav.unlink()
            removed += 1
    print("keep", len(keep), "removed", removed, "left", len(list(OUT.glob("*.wav"))))


if __name__ == "__main__":
    main()