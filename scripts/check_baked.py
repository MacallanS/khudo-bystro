# -*- coding: utf-8 -*-
from pathlib import Path
import re

bank = Path(r"d:/RussM/khudo-bystro/src/game/wordBank.ts").read_text(encoding="utf-8")
words = re.findall(r"w: '([^']+)'", bank)
eugene = Path(r"d:/RussM/khudo-bystro/public/tts/eugene")
files = {p.stem for p in eugene.glob("*.wav")}

def slug(w: str) -> str:
    return w.strip().lower().replace(" ", "_")

missing = [w for w in words if slug(w) not in files]
print("words", len(words), "files", len(files), "missing", len(missing))
print("sample missing", missing[:50])

cards = []
ones = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
teens = {10:"десять",11:"одиннадцать",12:"двенадцать",13:"тринадцать",14:"четырнадцать",15:"пятнадцать",16:"шестнадцать",17:"семнадцать",18:"восемнадцать",19:"девятнадцать"}
tens = {20:"двадцать",30:"тридцать",40:"сорок"}
for n in range(1, 41):
    if n < 10:
        cards.append(ones[n])
    elif n < 20:
        cards.append(teens[n])
    elif n in tens:
        cards.append(tens[n])
    else:
        ten = (n // 10) * 10
        cards.append(f"{tens[ten]} {ones[n % 10]}")

miss_c = [c for c in cards if slug(c) not in files]
print("cards missing", miss_c)
