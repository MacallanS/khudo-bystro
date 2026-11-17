# -*- coding: utf-8 -*-
from pathlib import Path
from word_filters import is_diminutive, is_inflected

text = Path(__file__).with_name("gen_word_bank.py").read_text(encoding="utf-8")
ns: dict = {}
exec(text.split("for cat, text in MORE.items():")[0], ns)
DATA = ns["DATA"]


def ok(w: str) -> bool:
    if not w or len(w) < 2 or any("a" <= ch <= "z" for ch in w):
        return False
    if w.endswith(("ый", "ий", "ая", "ое", "ые", "ие", "ой")):
        return False
    if is_diminutive(w) or is_inflected(w):
        return False
    return True


for sample in ["собака", "герой", "такси", "дом", "включи", "бирочке", "кот"]:
    print(sample, "inf", is_inflected(sample), "dim", is_diminutive(sample), "ok", ok(sample))

total = okc = 0
for blob in DATA.values():
    for w in blob.split():
        w = w.strip().lower()
        if not w:
            continue
        total += 1
        if ok(w):
            okc += 1
print("DATA ok", okc, "/", total)