export type DrawMode = 'paper' | 'phone'
export type Speed = 'slow' | 'normal' | 'fast' | 'chaos'
export type WordCount = 10 | 15 | 25 | 40
export type WordCategory =
  | 'animals'
  | 'food'
  | 'home'
  | 'transport'
  | 'nature'
  | 'school'
  | 'tech'
  | 'sport'
  | 'clothes'
  | 'jobs'
  | 'body'
  | 'tools'
  | 'fantasy'
  | 'party'
  | 'kitchen'
  | 'city'
export type Phase =
  | 'home'
  | 'rules'
  | 'lobby'
  | 'ready'
  | 'round'
  | 'quiz'
  | 'score'
  | 'finished'

export interface Player {
  id: string
  name: string
  score: number
}

export interface Slot {
  index: number
  word: string
  drawingDataUrl?: string
  answered: boolean
  correct?: boolean
  askerId?: string
}

export interface GameSettings {
  drawMode: DrawMode
  speed: Speed
  wordCount: WordCount
  categories: 'all' | WordCategory[]
}

export interface GameState {
  phase: Phase
  players: Player[]
  settings: GameSettings
  artistIndex: number
  artistsDone: number
  slots: Slot[]
  currentSlotIndex: number
  askerTurn: number
  quizAskTarget: number
  quizAsksDone: number
  selectedSlotIndex: number | null
  revealWord: string | null
  lastRoundSummary: { correct: number; missed: number } | null
}

export type GameAction =
  | { type: 'GO_HOME' }
  | { type: 'GO_RULES' }
  | { type: 'GO_LOBBY' }
  | { type: 'SET_PLAYERS'; names: string[] }
  | { type: 'SET_SETTINGS'; settings: Partial<GameSettings> }
  | { type: 'START_PARTY' }
  | { type: 'BEGIN_ROUND'; words: string[] }
  | { type: 'ABORT_ROUND' }
  | { type: 'SKIP_SLOT'; dataUrl?: string }
  | { type: 'SAVE_DRAWING'; dataUrl?: string }
  | { type: 'COMPLETE_SLOT'; dataUrl?: string }
  | { type: 'FINISH_DRAWING' }
  | { type: 'SELECT_SLOT'; index: number }
  | { type: 'ANSWER'; correct: boolean }
  | { type: 'CLEAR_REVEAL' }
  | { type: 'NEXT_ARTIST' }
  | { type: 'END_PARTY' }
  | { type: 'REMATCH' }
  | { type: 'HYDRATE'; state: GameState }
