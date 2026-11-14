import type {
  GameAction,
  GameSettings,
  GameState,
  Player,
  Slot,
  Speed,
  WordCategory,
  WordCount,
} from './types'

export const STORAGE_KEY = 'khudo-bystro-party-v1'
export const MAX_PLAYERS = 8

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

const DEFAULT_SETTINGS: GameSettings = {
  drawMode: 'paper',
  speed: 'chaos',
  wordCount: 25,
  categories: 'all',
}

const SPEEDS: Speed[] = ['slow', 'normal', 'fast', 'chaos']
const WORD_COUNTS: WordCount[] = [10, 15, 25, 40]
const CATEGORY_SET = new Set<string>([
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
])

function sanitizeSettings(raw: GameState['settings'] | undefined): GameSettings {
  const speed = SPEEDS.includes(raw?.speed as Speed)
    ? (raw!.speed as Speed)
    : DEFAULT_SETTINGS.speed
  const wordCount = WORD_COUNTS.includes(raw?.wordCount as WordCount)
    ? (raw!.wordCount as WordCount)
    : DEFAULT_SETTINGS.wordCount

  let categories: GameSettings['categories'] = 'all'
  if (Array.isArray(raw?.categories)) {
    const cleaned = raw.categories.filter((c): c is WordCategory =>
      CATEGORY_SET.has(c),
    )
    categories = cleaned.length ? cleaned : 'all'
  } else if (raw?.categories === 'all') {
    categories = 'all'
  }

  return {
    drawMode: raw?.drawMode === 'phone' ? 'phone' : 'paper',
    speed,
    wordCount,
    categories,
  }
}

/** Больше игроков → меньше кругов (4→3, 6→2), вопросов не меньше 8. */
export function quizPlan(
  playerCount: number,
  wordCount: number,
): { askers: number; rounds: number; target: number } {
  const askers = Math.max(1, playerCount - 1)
  const words = Math.max(1, wordCount)
  let rounds = Math.max(2, 6 - askers)
  let target = askers * rounds
  if (target < 8) {
    rounds = Math.ceil(8 / askers)
    target = askers * rounds
  }
  target = Math.min(words, target)
  rounds = Math.max(1, Math.ceil(target / askers))
  return { askers, rounds, target }
}

export function createInitialState(): GameState {
  return {
    phase: 'home',
    players: [
      { id: uid(), name: '', score: 0 },
      { id: uid(), name: '', score: 0 },
    ],
    settings: { ...DEFAULT_SETTINGS },
    artistIndex: 0,
    artistsDone: 0,
    slots: [],
    currentSlotIndex: 0,
    askerTurn: 0,
    quizAskTarget: 0,
    quizAsksDone: 0,
    selectedSlotIndex: null,
    revealWord: null,
    lastRoundSummary: null,
  }
}

export function askersFor(state: GameState): Player[] {
  const artist = state.players[state.artistIndex]
  return state.players.filter((p) => p.id !== artist?.id)
}

export function currentAsker(state: GameState): Player | null {
  const askers = askersFor(state)
  if (!askers.length) return null
  return askers[state.askerTurn % askers.length]
}

export function unansweredCount(state: GameState): number {
  return state.slots.filter((s) => !s.answered).length
}

export function canResumeParty(state: GameState | null | undefined): boolean {
  if (!state) return false
  if (state.phase === 'home' || state.phase === 'rules') return false
  if (!Array.isArray(state.players) || state.players.length < 2) return false
  return state.players.every((p) => Boolean(p?.name?.trim()))
}

/** Чинит сохранённую партию, чтобы нельзя было застрять. */
export function sanitizeParty(raw: GameState): GameState {
  const base = createInitialState()
  if (!raw || !Array.isArray(raw.players) || raw.players.length < 2) {
    return base
  }

  const players = raw.players
    .slice(0, MAX_PLAYERS)
    .map((p) => ({
      id: p?.id || uid(),
      name: String(p?.name ?? '').trim(),
      score: Math.max(0, Number(p?.score) || 0),
    }))
    .filter((p) => p.name)

  if (players.length < 2) return base

  const settings = sanitizeSettings(raw.settings)

  let phase = raw.phase
  if (
    phase !== 'lobby' &&
    phase !== 'ready' &&
    phase !== 'round' &&
    phase !== 'quiz' &&
    phase !== 'score' &&
    phase !== 'finished'
  ) {
    phase = 'lobby'
  }

  let artistIndex = Math.min(
    Math.max(0, Number(raw.artistIndex) || 0),
    players.length - 1,
  )
  let artistsDone = Math.min(
    Math.max(0, Number(raw.artistsDone) || 0),
    players.length,
  )

  let slots: Slot[] = Array.isArray(raw.slots)
    ? raw.slots.map((s, i) => ({
        index: i,
        word: String(s?.word ?? ''),
        drawingDataUrl: s?.drawingDataUrl,
        answered: Boolean(s?.answered),
        correct: s?.correct,
        askerId: s?.askerId,
      }))
    : []

  // Не восстанавливаем середину диктанта — голос/таймер не переживают reload
  if (phase === 'round') {
    phase = 'ready'
    slots = []
  }

  if (phase === 'quiz' && (!slots.length || slots.every((s) => !s.word))) {
    phase = 'ready'
    slots = []
  }

  if (phase === 'score' || phase === 'finished') {
    if (artistsDone >= players.length) phase = 'finished'
  }

  const plan = quizPlan(players.length, settings.wordCount)
  const answered = slots.filter((s) => s.answered).length
  const quizAskTarget =
    slots.length > 0 ? Math.min(plan.target, slots.length) : plan.target
  const quizAsksDone = Math.min(quizAskTarget, answered)

  if (phase === 'quiz' && quizAskTarget > 0 && quizAsksDone >= quizAskTarget) {
    phase = 'score'
  }

  return {
    phase,
    players,
    settings,
    artistIndex,
    artistsDone,
    slots,
    currentSlotIndex: 0,
    askerTurn: Math.max(0, Number(raw.askerTurn) || 0),
    quizAskTarget,
    quizAsksDone,
    selectedSlotIndex: null,
    revealWord: null,
    lastRoundSummary: raw.lastRoundSummary ?? null,
  }
}

function completeSlot(
  state: GameState,
  dataUrl?: string,
): GameState {
  const slots = state.slots.map((s, i) =>
    i === state.currentSlotIndex
      ? { ...s, drawingDataUrl: dataUrl ?? s.drawingDataUrl }
      : s,
  )
  const next = state.currentSlotIndex + 1
  if (next >= slots.length) {
    const plan = quizPlan(state.players.length, state.settings.wordCount)
    return {
      ...state,
      phase: 'quiz',
      slots,
      currentSlotIndex: slots.length,
      askerTurn: 0,
      quizAskTarget: Math.min(plan.target, slots.length),
      quizAsksDone: 0,
      selectedSlotIndex: null,
      revealWord: null,
    }
  }
  return {
    ...state,
    slots,
    currentSlotIndex: next,
    revealWord: null,
  }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'GO_HOME':
      return { ...createInitialState(), phase: 'home' }

    case 'GO_RULES':
      return { ...state, phase: 'rules' }

    case 'GO_LOBBY':
      return {
        ...state,
        phase: 'lobby',
        slots: [],
        currentSlotIndex: 0,
        selectedSlotIndex: null,
        revealWord: null,
        lastRoundSummary: null,
        // сброс прогресса партии при возврате к созданию команды
        artistIndex: 0,
        artistsDone: 0,
        players: state.players.map((p) => ({ ...p, score: 0 })),
        askerTurn: 0,
        quizAskTarget: 0,
        quizAsksDone: 0,
      }

    case 'SET_PLAYERS': {
      const capped = action.names.slice(0, MAX_PLAYERS)
      const players: Player[] = capped.map((name, i) => {
        const prev = state.players[i]
        return {
          id: prev?.id ?? uid(),
          name,
          score: prev?.score ?? 0,
        }
      })
      return { ...state, players }
    }

    case 'SET_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.settings },
      }

    case 'START_PARTY': {
      if (state.players.length < 2) return state
      if (state.players.some((p) => !p.name.trim())) return state
      return {
        ...state,
        phase: 'ready',
        artistIndex: 0,
        artistsDone: 0,
        players: state.players.map((p) => ({
          ...p,
          name: p.name.trim(),
          score: 0,
        })),
        slots: [],
        currentSlotIndex: 0,
        askerTurn: 0,
        quizAskTarget: 0,
        quizAsksDone: 0,
        selectedSlotIndex: null,
        revealWord: null,
        lastRoundSummary: null,
      }
    }

    case 'BEGIN_ROUND': {
      if (!action.words.length) return state
      const slots: Slot[] = action.words.map((word, index) => ({
        index,
        word,
        answered: false,
      }))
      const plan = quizPlan(state.players.length, slots.length)
      return {
        ...state,
        phase: 'round',
        slots,
        currentSlotIndex: 0,
        askerTurn: 0,
        quizAskTarget: plan.target,
        quizAsksDone: 0,
        selectedSlotIndex: null,
        revealWord: null,
        lastRoundSummary: null,
      }
    }

    case 'ABORT_ROUND':
      return {
        ...state,
        phase: 'ready',
        slots: [],
        currentSlotIndex: 0,
        askerTurn: 0,
        quizAskTarget: 0,
        quizAsksDone: 0,
        selectedSlotIndex: null,
        revealWord: null,
        lastRoundSummary: null,
      }

    case 'SAVE_DRAWING': {
      const slots = state.slots.map((s, i) =>
        i === state.currentSlotIndex
          ? { ...s, drawingDataUrl: action.dataUrl }
          : s,
      )
      return { ...state, slots }
    }

    case 'COMPLETE_SLOT':
    case 'SKIP_SLOT':
      return completeSlot(state, action.dataUrl)

    case 'FINISH_DRAWING': {
      if (!state.slots.length) {
        return { ...state, phase: 'ready' }
      }
      const plan = quizPlan(state.players.length, state.slots.length)
      return {
        ...state,
        phase: 'quiz',
        askerTurn: 0,
        quizAskTarget: Math.min(plan.target, state.slots.length),
        quizAsksDone: 0,
        selectedSlotIndex: null,
        revealWord: null,
      }
    }

    case 'SELECT_SLOT':
      if (state.slots[action.index]?.answered) return state
      return {
        ...state,
        selectedSlotIndex: action.index,
        revealWord: null,
      }

    case 'ANSWER': {
      if (state.selectedSlotIndex == null) return state
      const asker = currentAsker(state)
      if (!asker) return state
      const artist = state.players[state.artistIndex]
      const slotIndex = state.selectedSlotIndex

      const slots = state.slots.map((s, i) =>
        i === slotIndex
          ? {
              ...s,
              answered: true,
              correct: action.correct,
              askerId: asker.id,
            }
          : s,
      )

      const players = state.players.map((p) => {
        if (action.correct && p.id === artist.id) {
          return { ...p, score: p.score + 1 }
        }
        if (!action.correct && p.id === asker.id) {
          return { ...p, score: p.score + 1 }
        }
        return p
      })

      const unanswered = slots.filter((s) => !s.answered).length
      const askers = players.filter((p) => p.id !== artist.id)
      const nextAskerTurn = (state.askerTurn + 1) % Math.max(askers.length, 1)
      const quizAsksDone = state.quizAsksDone + 1
      const plan = quizPlan(players.length, slots.length)
      const quizAskTarget = Math.min(
        state.quizAskTarget || plan.target,
        slots.length,
      )
      const quizDone = quizAsksDone >= quizAskTarget || unanswered === 0

      if (quizDone) {
        const answeredSlots = slots.filter((s) => s.answered)
        const correct = answeredSlots.filter((s) => s.correct).length
        return {
          ...state,
          phase: 'score',
          players,
          slots,
          quizAskTarget,
          quizAsksDone,
          selectedSlotIndex: null,
          revealWord: null,
          askerTurn: nextAskerTurn,
          lastRoundSummary: {
            correct,
            missed: answeredSlots.length - correct,
          },
          artistsDone: state.artistsDone + 1,
        }
      }

      return {
        ...state,
        players,
        slots,
        quizAskTarget,
        quizAsksDone,
        selectedSlotIndex: null,
        revealWord: null,
        askerTurn: nextAskerTurn,
      }
    }

    case 'CLEAR_REVEAL':
      return { ...state, revealWord: null }

    case 'NEXT_ARTIST': {
      if (state.artistsDone >= state.players.length) {
        return { ...state, phase: 'finished' }
      }
      const nextArtist = state.artistIndex + 1
      if (nextArtist >= state.players.length) {
        return { ...state, phase: 'finished' }
      }
      return {
        ...state,
        phase: 'ready',
        artistIndex: nextArtist,
        slots: [],
        currentSlotIndex: 0,
        askerTurn: 0,
        quizAskTarget: 0,
        quizAsksDone: 0,
        selectedSlotIndex: null,
        revealWord: null,
        lastRoundSummary: null,
      }
    }

    case 'END_PARTY':
      return {
        ...state,
        phase: 'finished',
        slots: [],
        quizAskTarget: 0,
        quizAsksDone: 0,
        selectedSlotIndex: null,
        revealWord: null,
      }

    case 'REMATCH':
      return {
        ...state,
        phase: 'ready',
        artistIndex: 0,
        artistsDone: 0,
        players: state.players.map((p) => ({ ...p, score: 0 })),
        slots: [],
        currentSlotIndex: 0,
        askerTurn: 0,
        quizAskTarget: 0,
        quizAsksDone: 0,
        selectedSlotIndex: null,
        revealWord: null,
        lastRoundSummary: null,
      }

    case 'HYDRATE':
      return sanitizeParty(action.state)

    default:
      return state
  }
}
