from pathlib import Path
import re, importlib.util
bank = Path(r"d:/RussM/khudo-bystro/src/game/wordBank.ts").read_text(encoding="utf-8")
words = re.findall(r"w: '([^']+)'", bank)
spec = importlib.util.spec_from_file_location("stress", r"d:/RussM/khudo-bystro/tts-server/stress.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
missing = [w for w in words if w not in m.STRESS]
print("bank", len(words), "missing", len(missing))
Path(r"d:/RussM/khudo-bystro/scripts/_miss.txt").write_text("\n".join(missing), encoding="utf-8")
print("wrote _miss.txt")
