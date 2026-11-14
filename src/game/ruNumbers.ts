const ONES = [
  '',
  'один',
  'два',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
] as const

const TEENS: Record<number, string> = {
  10: 'десять',
  11: 'одиннадцать',
  12: 'двенадцать',
  13: 'тринадцать',
  14: 'четырнадцать',
  15: 'пятнадцать',
  16: 'шестнадцать',
  17: 'семнадцать',
  18: 'восемнадцать',
  19: 'девятнадцать',
}

const TENS: Record<number, string> = {
  20: 'двадцать',
  30: 'тридцать',
  40: 'сорок',
}

/** Номер слота 1…40 словами для диктора */
export function ruCardinal(n: number): string {
  if (n < 1) return String(n)
  if (n < 10) return ONES[n]!
  if (n < 20) return TEENS[n]!
  if (n === 20 || n === 30 || n === 40) return TENS[n]!
  if (n < 40) {
    const ten = Math.floor(n / 10) * 10
    const one = n % 10
    return `${TENS[ten]} ${ONES[one]}`
  }
  return String(n)
}

export function ruCardinalsUpTo(max: number): string[] {
  const out: string[] = []
  for (let i = 1; i <= Math.min(max, 40); i++) out.push(ruCardinal(i))
  return out
}

/** Порядок прогрева: один, слово1, два, слово2, … */
export function dictationPrefetchOrder(words: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    out.push(ruCardinal(i + 1), words[i]!)
  }
  return out
}
