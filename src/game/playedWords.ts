const STORAGE_KEY = 'khudo-bystro-played-words-v1'

export function normalizeWord(w: string): string {
  return w.trim().toLowerCase()
}

function readList(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const item of parsed) {
      const w = normalizeWord(String(item ?? ''))
      if (!w || seen.has(w)) continue
      seen.add(w)
      out.push(w)
    }
    return out
  } catch {
    return []
  }
}

function writeList(words: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words))
  } catch {
    // quota / private mode
  }
}

/** Все слова, уже сыгранные на этом телефоне (между партиями и реваншами). */
export function getPlayedWords(): string[] {
  return readList()
}

export function getPlayedWordSet(): Set<string> {
  return new Set(getPlayedWords())
}

export function appendPlayedWords(words: string[]): void {
  if (!words.length) return
  const list = readList()
  const seen = new Set(list)
  let changed = false
  for (const raw of words) {
    const w = normalizeWord(raw)
    if (!w || seen.has(w)) continue
    seen.add(w)
    list.push(w)
    changed = true
  }
  if (changed) writeList(list)
}

export function clearPlayedWords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}