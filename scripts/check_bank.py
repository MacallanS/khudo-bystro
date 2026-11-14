# -*- coding: utf-8 -*-
import re
from collections import Counter
from pathlib import Path

t = Path(r"d:\RussM\khudo-bystro\src\game\wordBank.ts").read_text(encoding="utf-8")
words = re.findall(r"w: '([^']+)'", t)
cats = re.findall(r"c: '([^']+)'", t)
diffs = re.findall(r"d: '([^']+)'", t)
print("entries", len(words), "unique", len(set(words)))
print("cats", Counter(cats))
print("diffs", Counter(diffs))
