# -*- coding: utf-8 -*-
"""Дописывает STRESS для новых слов банка из словаря ruaccent + жёсткие правила.

ones / ё — детерминированно; остальное — accents.json.gz из ruaccent;
OVERRIDE — ручные правки игровых омографов.
"""
from __future__ import annotations

import gzip
import importlib.util
import json
import re
from pathlib import Path

ROOT = Path(r"d:\RussM\khudo-bystro")
STRESS_PATH = ROOT / "tts-server" / "stress.py"
BANK_PATH = ROOT / "src" / "game" / "wordBank.ts"
VOWELS = set("аеёиоуыэюя")

RUACCENT_GZ = Path(
    r"C:\Users\Tema\AppData\Local\Programs\Python\Python312"
    r"\Lib\site-packages\ruaccent\dictionary\accents.json.gz"
)

# Игровые чтения / уменьшительные вне словаря
OVERRIDE: dict[str, str] = {
    "замок": "з+амок",  # крепость
    "атлас": "+атлас",  # карта
    "хлопушка": "хлоп+ушка",
    "носорожик": "носор+ожик",
    "енотик": "ен+отик",
    "сусличок": "сусл+ичок",
    "тюленчик": "тюл+енчик",
    "медузка": "мед+узка",
    "осьминожка": "осьмин+ожка",
    "лосьонок": "л+осьонок",
    "ланька": "л+анька",
    "маралчик": "мар+алчик",
    "антилопка": "антил+опка",
    "газелька": "газ+елька",
    "мангустик": "манг+устик",
    "фламингочик": "флам+ингочик",
    "пеликанчик": "пелик+анчик",
    "аистик": "а+истик",
    "страусик": "стр+аусик",
    "грачик": "гр+ачик",
    "воронушка": "вор+онушка",
    "стрижик": "стр+ижик",
    "удодик": "+удодик",
    "медузочка": "мед+узочка",
    "креветочка": "кревет+очка",
    "руккола": "р+уккола",
    "ковричек": "к+овричек",
    "электросамокат": "электросамок+ат",
    "моноколесо": "монокол+есо",
    "мопедик": "моп+едик",
    "скутерик": "скут+ерик",
    "планшетик": "планш+етик",
    "вебка": "в+ебка",
    "кубочек": "к+убочек",
    "гантелька": "г+антелька",
    "пазлик": "п+азлик",
    "обручик": "+обручик",
    "тяпочка": "т+япочка",
    "шланчик": "шл+анчик",
    "дракониха": "драк+ониха",
    "салютик": "сал+ютик",
    "каруселька": "карус+елька",
}


def load_stress() -> dict[str, str]:
    spec = importlib.util.spec_from_file_location("stress", STRESS_PATH)
    m = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(m)
    return dict(m.STRESS)


def bank_words() -> list[str]:
    return re.findall(r"w: '([^']+)'", BANK_PATH.read_text(encoding="utf-8"))


def mark_one_vowel(word: str) -> str | None:
    idxs = [i for i, ch in enumerate(word) if ch in VOWELS]
    if len(idxs) != 1:
        return None
    i = idxs[0]
    return word[:i] + "+" + word[i:]


def mark_yo(word: str) -> str | None:
    i = word.find("ё")
    if i < 0:
        return None
    return word[:i] + "+" + word[i:]


def validate(key: str, value: str) -> None:
    if value.replace("+", "") != key:
        raise SystemExit(f"stress mismatch: {key} -> {value}")
    plus = value.find("+")
    if plus < 0 or plus + 1 >= len(value) or value[plus + 1] not in VOWELS:
        raise SystemExit(f"stress mark not before a vowel: {value}")
    if value.count("+") != 1:
        raise SystemExit(f"expected one stress mark: {value}")


def normalize_lex(raw: str, word: str) -> str | None:
    """accents.json иногда даёт несколько + или чужой регистр."""
    out = raw.strip().lower()
    if not out:
        return None
    # оставить только первое ударение
    if out.count("+") > 1:
        i = out.find("+")
        out = out[: i + 1] + out[i + 1 :].replace("+", "")
    if out.replace("+", "") != word:
        return None
    return out


def rewrite_stress(merged: dict[str, str]) -> None:
    lines = [
        '"""Ударения для диктора. «+» стоит прямо перед ударной гласной.\n',
        "\n",
        "Автоударение Silero на коротких словах съедает гласную («дыня» → без «ын»)\n",
        "и смазывает звонкие «г», «б» перед глухим взрывом («гвоздь» слышится как «хвоздь»).\n",
        '"""\n',
        "\n",
        "from __future__ import annotations\n",
        "\n",
        '_VOWELS = set("аеёиоуыэюя")\n',
        "\n",
        "# ключ — слово как в игре, значение — то же слово с «+»\n",
        "STRESS: dict[str, str] = {\n",
    ]
    for k in sorted(merged.keys()):
        lines.append(f'    "{k}": "{merged[k]}",\n')
    lines.append("}\n\n\n")
    lines.append(
        """def mark_stress(text: str) -> tuple[str, bool]:
    \"\"\"Вернуть фразу с «+» и флаг: все слова нашлись в словаре.\"\"\"
    parts: list[str] = []
    known = True
    for word in text.split(" "):
        if not word:
            continue
        hinted = STRESS.get(word)
        if hinted is None:
            known = False
            parts.append(word)
        else:
            parts.append(hinted)
    if not parts:
        return text, False
    return " ".join(parts), known


def _check() -> None:
    for key, value in STRESS.items():
        if value.replace("+", "") != key:
            raise SystemExit(f"stress mismatch: {key} -> {value}")
        plus = value.find("+")
        if plus < 0 or plus + 1 >= len(value) or value[plus + 1] not in _VOWELS:
            raise SystemExit(f"stress mark not before a vowel: {value}")
"""
    )
    STRESS_PATH.write_text("".join(lines), encoding="utf-8")


def main() -> None:
    print("loading accents.json.gz…")
    lex: dict[str, str] = json.load(gzip.open(RUACCENT_GZ, "rt", encoding="utf-8"))
    print("lex size", len(lex))

    existing = load_stress()
    words = bank_words()
    missing = [w for w in words if w not in existing]
    print("missing", len(missing))

    added = 0
    failed: list[str] = []
    for w in missing:
        marked: str | None = None
        if w in OVERRIDE:
            marked = OVERRIDE[w]
        else:
            marked = mark_one_vowel(w) or mark_yo(w)
            if marked is None and w in lex:
                marked = normalize_lex(lex[w], w)
        if marked is None:
            failed.append(w)
            continue
        try:
            validate(w, marked)
        except SystemExit as e:
            print("bad", e)
            failed.append(w)
            continue
        existing[w] = marked
        added += 1

    for k, v in OVERRIDE.items():
        validate(k, v)
        existing[k] = v

    if failed:
        print("FAILED", len(failed))
        print("\n".join(failed))
        # всё равно пишем то, что есть? нет — добьём вручную ниже
        Path(ROOT / "scripts" / "_stress_failed.txt").write_text(
            "\n".join(failed), encoding="utf-8"
        )

    rewrite_stress(existing)
    print("wrote", STRESS_PATH, "added", added, "total", len(existing), "failed", len(failed))
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
