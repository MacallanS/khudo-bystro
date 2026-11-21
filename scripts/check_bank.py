# -*- coding: utf-8 -*-
"""Аудит wordBank.ts: мусорные суффиксы, дубли, категории."""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

from word_filters import is_diminutive, is_inflected

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "src" / "game" / "wordBank.ts"

JUNK_RE = re.compile(
    r"(?:нув|нул|нула|нули|авин|ялен|усен|кни|гни|шлюх|нарко|ублюд|идиот)$"
)


def main() -> int:
    text = BANK.read_text(encoding="utf-8")
    words = re.findall(r"w: '([^']+)'", text)
    cats = re.findall(r"c: '([^']+)'", text)
    print("count", len(words), "unique", len(set(words)))
    print(Counter(cats))

    bad = []
    for w in words:
        if JUNK_RE.search(w):
            bad.append(("junk", w))
        if is_inflected(w) and w not in {
            "ванная",
            "столовая",
            "мороженое",
            "пирожное",
            "жаркое",
            "плавание",
            "пожарный",
            "полицейский",
            "скорая",
        }:
            bad.append(("filt", w))
        if is_diminutive(w):
            bad.append(("dim", w))
    print("flagged", len(bad))
    for item in bad[:40]:
        print(" ", item)

    must_absent = [
        "одеялен",
        "пилявин",
        "шоркнув",
        "шлюха",
        "наркоманка",
        "ублюдок",
    ]
    must_present = ["кот", "одеяло", "пила"]
    for w in must_absent:
        print(w, "ABSENT" if w not in words else "FAIL_PRESENT")
    for w in must_present:
        print(w, "OK" if w in words else "MISSING")

    if any(w in words for w in must_absent):
        return 1
    if any(w not in words for w in must_present):
        return 1
    if any(t == "junk" for t, _ in bad):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
