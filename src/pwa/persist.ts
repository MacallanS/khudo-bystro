import type { GameState } from '../game/types'
import { canResumeParty, STORAGE_KEY, sanitizeParty } from '../game/reducer'

export function saveParty(state: GameState): void {
  try {
    if (state.phase === 'home' || state.phase === 'rules') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // quota / private mode — ignore
  }
}

export function loadParty(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GameState
    if (!canResumeParty(parsed)) return null
    return sanitizeParty(parsed)
  } catch {
    return null
  }
}

export function clearParty(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
