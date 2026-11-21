import { WORD_BANK, type WordEntry } from './wordBank'
import type { WordCategory } from './types'

export type { WordEntry }

export const WORD_CATEGORIES: WordCategory[] = [
  'animals',
  'food',
  'home',
  'transport',
  'nature',
  'school',
  'tech',
  'sport',
  'clothes',
  'jobs',
  'body',
  'tools',
  'fantasy',
  'party',
  'kitchen',
  'city',
]

const CATEGORY_LABELS: Record<WordCategory, string> = {
  animals: 'животные',
  food: 'еда',
  home: 'дом',
  transport: 'транспорт',
  nature: 'природа',
  school: 'школа',
  tech: 'техника',
  sport: 'спорт',
  clothes: 'одежда',
  jobs: 'профессии',
  body: 'тело',
  tools: 'инструменты',
  fantasy: 'фэнтези',
  party: 'праздник',
  kitchen: 'кухня',
  city: 'город',
}

export type PickWordsOpts = {
  exclude?: string[]
  categories?: 'all' | WordCategory[]
}

export function listCategories(): WordCategory[] {
  return [...WORD_CATEGORIES]
}

export function categoryLabel(c: WordCategory): string {
  return CATEGORY_LABELS[c]
}

export function wordBankSize(): number {
  return WORD_BANK.length
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function matchCategories(
  entry: WordEntry,
  categories: 'all' | WordCategory[],
): boolean {
  if (categories === 'all' || !categories.length) return true
  return categories.includes(entry.c)
}

function takeFrom(
  pool: WordEntry[],
  need: number,
  banned: Set<string>,
  picked: string[],
): void {
  for (const e of shuffle(pool)) {
    if (picked.length >= need) return
    if (banned.has(e.w) || picked.includes(e.w)) continue
    picked.push(e.w)
  }
}

/** Берёт простые слова; если в категориях мало — добирает из всего банка. */
export function pickWords(
  count: number,
  excludeOrOpts: string[] | PickWordsOpts = [],
  maybeOpts?: PickWordsOpts,
): string[] {
  const opts: PickWordsOpts = Array.isArray(excludeOrOpts)
    ? { ...(maybeOpts ?? {}), exclude: excludeOrOpts }
    : excludeOrOpts

  const banned = new Set(
    (opts.exclude ?? []).map((w) => w.trim().toLowerCase()).filter(Boolean),
  )
  const categories =
    !opts.categories ||
    opts.categories === 'all' ||
    (Array.isArray(opts.categories) && opts.categories.length === 0)
      ? 'all'
      : opts.categories

  const available = WORD_BANK.filter((e) => !banned.has(e.w))
  const picked: string[] = []

  const primary = available.filter((e) => matchCategories(e, categories))
  takeFrom(primary, count, banned, picked)

  if (picked.length < count) {
    takeFrom(available, count, banned, picked)
  }

  return picked.slice(0, count)
}

export type PickWordsResult = {
  words: string[]
  /**
   * Не хватило новых слов относительно истории телефона —
   * добрали без очистки playedWords (сброс истории только кнопкой «домой»).
   */
  reusedHistory: boolean
}

/**
 * Выбор слов раунда с учётом долгой памяти телефона.
 * Не очищает playedWords сам — история сбрасывается только при уходе домой.
 */
export function pickWordsForRound(
  count: number,
  opts: PickWordsOpts,
  devicePlayed: string[],
): PickWordsResult {
  const partyExclude = opts.exclude ?? []
  const deviceSet = new Set(
    devicePlayed.map((w) => w.trim().toLowerCase()).filter(Boolean),
  )
  const exclude = [...deviceSet, ...partyExclude]

  const fresh = pickWords(count, { ...opts, exclude })
  if (fresh.length >= count) {
    return { words: fresh, reusedHistory: false }
  }

  // Банк ещё большой, но история телефона почти вся — повторы из прошлых партий,
  // внутри текущей партии usedWords по-прежнему исключаются.
  const words = pickWords(count, {
    ...opts,
    exclude: partyExclude,
  })
  return { words, reusedHistory: true }
}
