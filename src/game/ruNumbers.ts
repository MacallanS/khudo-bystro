const CARDINALS: Record<number, string> = {
  1: 'один',
  2: 'два',
  3: 'три',
  4: 'четыре',
  5: 'пять',
  6: 'шесть',
  7: 'семь',
  8: 'восемь',
  9: 'девять',
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
  20: 'двадцать',
  21: 'двадцать один',
  22: 'двадцать два',
  23: 'двадцать три',
  24: 'двадцать четыре',
  25: 'двадцать пять',
}

/** Номер слота 1…25 словами для диктора */
export function ruCardinal(n: number): string {
  return CARDINALS[n] ?? String(n)
}

export function ruCardinalsUpTo(max: number): string[] {
  const out: string[] = []
  for (let i = 1; i <= Math.min(max, 25); i++) out.push(CARDINALS[i]!)
  return out
}
