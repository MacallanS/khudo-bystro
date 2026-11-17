# -*- coding: utf-8 -*-
"""Фильтр уменьшительно-ласкательных и небазовых словоформ."""
from __future__ import annotations

import re

DIMINUTIVE_OK: frozenset[str] = frozenset(
    {
        "щенок",
        "котёнок",
        "телёнок",
        "поросёнок",
        "ягнёнок",
        "верблюдёнок",
        "утёнок",
        "гусёнок",
        "цыплёнок",
        "медвежонок",
        "лисёнок",
        "волчонок",
        "зайчонок",
        "белочонок",
        "козлёнок",
        "кончик",
        "огурец",
        "конец",
        "язык",
        "сорочка",
        "ладошка",
        "сторожка",
        "излучка",
        "горошка",
        "молоточка",
    }
)

_LASK_SUFFIX = re.compile(
    r"(?:"
    r"ечка|ёчка|юшка|ушка|ишка|"
    r"ечек|очек|ушек|ишек|"
    r"ёночек|еночек|оночек|"
    r"ёнечек|енечек|"
    r"ушечк|ишечк|юшечк|"
    r"ятко|енечка|онечка"
    r")$"
)

_FAKE_CHIK = re.compile(r".{5,}[аеёиоуыэюя]чик$")

# глагольные окончания (только конец строки)
_VERB_END = re.compile(
    r"(?:"
    r"ать|ить|еть|ять|оть|уть|ыть|"
    r"ишь|ите|"
    r"ешь|ёшь|ете|ёте|"
    r"ал|ала|али|"
    r"ил|ила|или|ит|"
    r"ут|ют|ёт"
    r")$"
)

# явные падежные хвосты
_INSTRUMENTAL_OK = frozenset({"дом", "том", "бром"})

_CASE_END = re.compile(
    r"(?:"
    r"очке|очку|очкой|очках|очкам|"
    r"ечке|ечку|ечкой|"
    r"ушке|ишке|юшке|"
    r"ами|ями|ого|его|ому|ему|"
    r"ах|ях|ам|ям|ою|ею|ью|ием|ьем|"
    r"ией|ьей|"
    r"ую|юю|ым|им|"
    r"ево|ово|ева|ова|еву|ову|евы|овы|"
    r"уй|юй|"
    r"ом|ем"
    r")$"
)


def is_diminutive(word: str) -> bool:
    w = word.strip().lower()
    if not w or w in DIMINUTIVE_OK:
        return False
    if _LASK_SUFFIX.search(w):
        return True
    if w.endswith("очка") and w not in DIMINUTIVE_OK:
        return True
    if _FAKE_CHIK.search(w) and w not in DIMINUTIVE_OK:
        return True
    return False


def is_inflected(word: str) -> bool:
    w = word.strip().lower()
    if len(w) < 3 or len(w) > 18:
        return True
    if w.endswith(("ся", "сь")):
        return True
    if _VERB_END.search(w):
        return True
    if len(w) > 4 and w.endswith(("ах", "ях", "ов", "ев")):
        return True
    if len(w) > 5 and w.endswith(("ам", "ям")):
        return True
    if _CASE_END.search(w) and w not in _INSTRUMENTAL_OK:
        return True
    # деепричастие / кратк. признак.
    if len(w) > 5 and w.endswith(("вши", "вш", "чив", "чил", "чит", "ны", "на", "но")):
        return True
    if len(w) >= 6 and w.endswith("чи"):
        return True
    if len(w) == 4 and w.endswith("и") and w not in {"такси", "цуги"}:
        return True
    if re.search(r"(?:ела|ели|ело|ети|ету|етя|ечу|еча|уя|ива|ыва)$", w):
        return True
    if len(w) >= 5 and w.endswith(("у", "ю", "я")) and w not in {"кенгуру", "рагу", "какао"}:
        return True
    if len(w) >= 5 and "й" in w and not w.endswith("й"):
        return True
    if len(w) >= 5 and w.endswith(("ке", "ку", "ки", "ках", "кам")):
        return True
    if len(w) >= 6 and w.endswith(("ака", "еке", "ики", "оке", "уке")):
        return True
    return False