import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  currentAsker,
  gameReducer,
  quizPlan,
} from './reducer'
import type { GameState, Player, Slot } from './types'

function playersOf(...names: string[]): Player[] {
  return names.map((name, i) => ({
    id: `p${i}`,
    name,
    score: 0,
  }))
}

function slotsOf(n: number): Slot[] {
  return Array.from({ length: n }, (_, index) => ({
    index,
    word: `слово${index + 1}`,
    answered: false,
  }))
}

function quizState(
  names: string[],
  slotCount: number,
  overrides: Partial<GameState> = {},
): GameState {
  const players = playersOf(...names)
  const slots = slotsOf(slotCount)
  const plan = quizPlan(players.length, slots.length)
  return {
    ...createInitialState(),
    phase: 'quiz',
    players,
    artistIndex: 0,
    artistsDone: 0,
    slots,
    currentSlotIndex: slots.length,
    askerTurn: 0,
    quizAskTarget: Math.min(plan.target, slots.length),
    quizAsksDone: 0,
    selectedSlotIndex: null,
    ...overrides,
  }
}

function answer(
  state: GameState,
  slotIndex: number,
  correct: boolean,
): GameState {
  let next = gameReducer(state, { type: 'SELECT_SLOT', index: slotIndex })
  next = gameReducer(next, { type: 'ANSWER', correct })
  return next
}

describe('quizPlan ~74%', () => {
  it('3 игрока, 25 слов → 19 вопросов / 10 кругов', () => {
    expect(quizPlan(3, 25)).toEqual({ askers: 2, target: 19, rounds: 10 })
  })

  it('3 игрока, 40 слов → 30 вопросов / 15 кругов', () => {
    expect(quizPlan(3, 40)).toEqual({ askers: 2, target: 30, rounds: 15 })
  })

  it('2 игрока, 30 слов → 22 вопроса / 22 круга', () => {
    expect(quizPlan(2, 30)).toEqual({ askers: 1, target: 22, rounds: 22 })
  })

  it('3 игрока, 35 слов → 26 вопросов / 13 кругов', () => {
    expect(quizPlan(3, 35)).toEqual({ askers: 2, target: 26, rounds: 13 })
  })
})

describe('quiz scoring', () => {
  it('верно → художник, забыл → спрашивающий (2 игрока)', () => {
    let state = quizState(['Аня', 'Боря'], 10)
    const artistId = state.players[0].id
    const askerId = state.players[1].id

    for (let i = 0; i < 3; i++) {
      state = answer(state, i, true)
    }
    expect(state.players.find((p) => p.id === artistId)?.score).toBe(3)
    expect(state.players.find((p) => p.id === askerId)?.score).toBe(0)

    for (let i = 3; i < 5; i++) {
      state = answer(state, i, false)
    }
    expect(state.players.find((p) => p.id === artistId)?.score).toBe(3)
    expect(state.players.find((p) => p.id === askerId)?.score).toBe(2)
  })

  it('ротация спрашивающих при 3 игроках', () => {
    let state = quizState(['Аня', 'Боря', 'Вика'], 12)
    const artistId = state.players[0].id
    const bId = state.players[1].id
    const vId = state.players[2].id

    // askerTurn 0 → Боря
    expect(currentAsker(state)?.id).toBe(bId)
    state = answer(state, 0, false)
    expect(state.players.find((p) => p.id === bId)?.score).toBe(1)
    expect(state.players.find((p) => p.id === vId)?.score).toBe(0)

    // askerTurn 1 → Вика
    expect(currentAsker(state)?.id).toBe(vId)
    state = answer(state, 1, false)
    expect(state.players.find((p) => p.id === vId)?.score).toBe(1)

    // askerTurn 2 → снова Боря; верно → художник
    expect(currentAsker(state)?.id).toBe(bId)
    state = answer(state, 2, true)
    expect(state.players.find((p) => p.id === artistId)?.score).toBe(1)
    expect(state.players.find((p) => p.id === bId)?.score).toBe(1)
  })

  it('повторный ANSWER по тому же слоту не меняет счёт', () => {
    let state = quizState(['Аня', 'Боря'], 10)
    state = answer(state, 0, true)
    const afterFirst = state.players.map((p) => p.score)

    // снова выбрать тот же слот и ответить
    state = gameReducer(state, { type: 'SELECT_SLOT', index: 0 })
    // слот уже answered — SELECT может не выбрать, форсируем selected
    state = { ...state, selectedSlotIndex: 0 }
    state = gameReducer(state, { type: 'ANSWER', correct: true })

    expect(state.players.map((p) => p.score)).toEqual(afterFirst)
    expect(state.quizAsksDone).toBe(1)
  })

  it('после quizAskTarget ответов → score и artistsDone + 1', () => {
    const slotCount = 10
    let state = quizState(['Аня', 'Боря'], slotCount)
    const target = state.quizAskTarget
    expect(target).toBeGreaterThan(0)

    for (let i = 0; i < target; i++) {
      state = answer(state, i, i % 2 === 0)
    }

    expect(state.phase).toBe('score')
    expect(state.artistsDone).toBe(1)
    expect(state.quizAsksDone).toBe(target)
    expect(state.lastRoundSummary).not.toBeNull()
    const summary = state.lastRoundSummary!
    expect(summary.correct + summary.missed).toBe(target)
  })
})

describe('usedWords across party', () => {
  it('BEGIN_ROUND копит слова; второй раунд не пересекается с первым', () => {
    let state = createInitialState()
    state = {
      ...state,
      phase: 'ready',
      players: playersOf('Аня', 'Боря'),
    }

    const first = ['кот', 'собака', 'рыба']
    state = gameReducer(state, { type: 'BEGIN_ROUND', words: first })
    expect(state.usedWords).toEqual(first)

    state = gameReducer(state, { type: 'NEXT_ARTIST' })
    expect(state.slots).toEqual([])
    expect(state.usedWords).toEqual(first)

    const second = ['мышь', 'лошадь', 'корова']
    state = gameReducer(state, { type: 'BEGIN_ROUND', words: second })
    expect(state.usedWords).toEqual([...first, ...second])
    expect(new Set(state.usedWords).size).toBe(first.length + second.length)
  })

  it('REMATCH и START_PARTY очищают usedWords', () => {
    let state = createInitialState()
    state = {
      ...state,
      phase: 'ready',
      players: playersOf('Аня', 'Боря'),
      usedWords: ['кот', 'собака'],
    }

    state = gameReducer(state, { type: 'REMATCH' })
    expect(state.usedWords).toEqual([])

    state = gameReducer(state, {
      type: 'BEGIN_ROUND',
      words: ['рыба', 'птица'],
    })
    expect(state.usedWords).toEqual(['рыба', 'птица'])

    state = gameReducer(state, { type: 'GO_LOBBY' })
    expect(state.usedWords).toEqual([])
  })
})
