# -*- coding: utf-8 -*-
import re
from pathlib import Path

from word_filters import is_diminutive

t = Path(r"d:/RussM/khudo-bystro/src/game/wordBank.ts").read_text(encoding="utf-8")
words = re.findall(r"w: '([^']+)'", t)
dim = [w for w in words if is_diminutive(w)]
print("total", len(words), "diminutive", len(dim))
print("sample", dim[:50])