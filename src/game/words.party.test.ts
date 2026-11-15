import { describe, expect, it } from 'vitest'
import { pickWords } from './words'
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
})
