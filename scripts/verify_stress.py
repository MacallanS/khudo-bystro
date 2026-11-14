# -*- coding: utf-8 -*-
from pathlib import Path
import re
import importlib.util

bank = Path(r"d:/RussM/khudo-bystro/src/game/wordBank.ts").read_text(encoding="utf-8")
words = re.findall(r"w: '([^']+)'", bank)
spec = importlib.util.spec_from_file_location("s", r"d:/RussM/khudo-bystro/tts-server/stress.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
miss = [w for w in words if w not in m.STRESS]
print("bank", len(words), "miss", len(miss))
print("пара", "пара" in words, "пол", "пол" in words)
m._check()
print("stress ok", len(m.STRESS))
