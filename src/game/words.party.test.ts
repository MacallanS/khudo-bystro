import { describe, expect, it } from 'vitest'
import { pickWords, pickWordsForRound, wordBankSize } from './words'
import { createInitialState, gameReducer } from './reducer'
import type { GameState, Player } from './types'

function playersOf(...names: string[]): Player[] {
  return names.map((name, i) => ({
    id: `p${i}`,
    name,
    score: 0,
  }))
}

describe('pickWords + usedWords party bag', () => {
  it('два раунда по 25 слов без пересечений', () => {
    let state: GameState = {
      ...createInitialState(),
      phase: 'ready',
      players: playersOf('Аня', 'Боря'),
      settings: {
        ...createInitialState().settings,
        wordCount: 25,
        categories: 'all',
      },
    }

    const first = pickWords(25, { exclude: state.usedWords, categories: 'all' })
    expect(first).toHaveLength(25)
    state = gameReducer(state, { type: 'BEGIN_ROUND', words: first })

    state = gameReducer(state, { type: 'NEXT_ARTIST' })
    const second = pickWords(25, {
      exclude: state.usedWords,
      categories: 'all',
    })
    expect(second).toHaveLength(25)

    const overlap = second.filter((w) => state.usedWords.includes(w))
    expect(overlap).toEqual([])
  })

  it('10 партий по 40 слов без повторов при полном банке', () => {
    const perParty = 40
    const parties = 10
    const need = perParty * parties
    expect(wordBankSize()).toBeGreaterThanOrEqual(need)

    const used: string[] = []
    for (let p = 0; p < parties; p++) {
      const batch = pickWords(perParty, { exclude: used, categories: 'all' })
      expect(batch).toHaveLength(perParty)
      const overlap = batch.filter((w) => used.includes(w))
      expect(overlap).toEqual([])
      used.push(...batch)
    }
    expect(new Set(used).size).toBe(need)
  })

  it('pickWordsForRound не повторяет devicePlayed и сбрасывает при исчерпании', () => {
    const device = ['кот', 'собака']
    const played: string[] = []
    const { words, bankReset } = pickWordsForRound(
      5,
      { categories: 'all' },
      device,
      () => played.push('__reset__'),
    )
    expect(bankReset).toBe(false)
    expect(words.some((w) => device.includes(w))).toBe(false)

    const tinyExclude = pickWords(wordBankSize(), {
      exclude: [],
      categories: 'all',
    })
    const almostAll = tinyExclude
    const { words: few, bankReset: reset } = pickWordsForRound(
      25,
      { categories: 'all' },
      almostAll,
      () => played.push('reset'),
    )
    expect(reset).toBe(true)
    expect(played).toContain('reset')
    expect(few.length).toBeGreaterThan(0)
  })
})