import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialState, gameReducer } from './reducer'
import {
  appendPlayedWords,
  clearPlayedWords,
  getPlayedWords,
  normalizeWord,
} from './playedWords'

const KEY = 'khudo-bystro-played-words-v1'

function installStorage() {
  const map = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    clear: () => map.clear(),
  })
}

describe('playedWords', () => {
  installStorage()

  afterEach(() => {
    clearPlayedWords()
    vi.unstubAllGlobals()
    installStorage()
  })

  it('нормализует и хранит уникальные слова', () => {
    expect(normalizeWord('  КОТ ')).toBe('кот')
    appendPlayedWords(['кот', 'КОТ', 'собака'])
    expect(getPlayedWords()).toEqual(['кот', 'собака'])
  })

  it('clearPlayedWords очищает localStorage', () => {
    appendPlayedWords(['рыба'])
    clearPlayedWords()
    expect(getPlayedWords()).toEqual([])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('REMATCH очищает usedWords в партии, но не память телефона', () => {
    appendPlayedWords(['кот'])
    const state = gameReducer(
      {
        ...createInitialState(),
        phase: 'ready',
        usedWords: ['кот'],
      },
      { type: 'REMATCH' },
    )
    expect(state.usedWords).toEqual([])
    expect(getPlayedWords()).toEqual(['кот'])
  })
})