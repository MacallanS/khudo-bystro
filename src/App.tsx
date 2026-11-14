import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { InstallBanner } from './components/InstallBanner'
import { PullToRefresh } from './components/PullToRefresh'
import { UpdateBanner } from './components/UpdateBanner'
import {
  askersFor,
  canResumeParty,
  createInitialState,
  currentAsker,
  gameReducer,
  quizPlan,
  sanitizeParty,
} from './game/reducer'
import { ruCardinalsUpTo } from './game/ruNumbers'
import { pickWords } from './game/words'
import {
  prepareNarrator,
  prefetchWords,
  stopSpeaking,
  warmUpVoices,
  type NarratorEngine,
} from './game/tts'
import { initInstallCapture } from './pwa/install'
import { clearParty, loadParty, saveParty } from './pwa/persist'
import {
  bindWakeLockOnVisible,
  releaseWakeLock,
  requestWakeLock,
} from './pwa/wakeLock'
import { HomeScreen } from './screens/HomeScreen'
import { LobbyScreen } from './screens/LobbyScreen'
import { QuizScreen } from './screens/QuizScreen'
import { ReadyScreen } from './screens/ReadyScreen'
import { RoundScreen } from './screens/RoundScreen'
import { RulesScreen } from './screens/RulesScreen'
import { ScoreScreen } from './screens/ScoreScreen'
import type { GameState } from './game/types'

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState)
  const [resumeCandidate, setResumeCandidate] = useState<GameState | null>(() => {
    const raw = loadParty()
    if (!raw || !canResumeParty(raw)) return null
    return sanitizeParty(raw)
  })
  const pendingWordsRef = useRef<string[]>([])

  useEffect(() => {
    warmUpVoices()
    return initInstallCapture()
  }, [])

  useEffect(() => {
    if (state.phase === 'home' || state.phase === 'rules') return
    saveParty(state)
    if (canResumeParty(state)) setResumeCandidate(sanitizeParty(state))
  }, [state])

  const goHomeFresh = () => {
    clearParty()
    setResumeCandidate(null)
    dispatch({ type: 'GO_HOME' })
  }

  useEffect(() => {
    const active = state.phase === 'round' || state.phase === 'quiz'
    if (!active) {
      void releaseWakeLock()
      return
    }
    void requestWakeLock()
    return bindWakeLockOnVisible()
  }, [state.phase])

  const artist = state.players[state.artistIndex]
  const asker = currentAsker(state)
  const quiz = useMemo(
    () => quizPlan(state.players.length, state.slots.length || state.settings.wordCount),
    [state.players.length, state.slots.length, state.settings.wordCount],
  )
  const names = useMemo(
    () => (state.players.length ? state.players.map((p) => p.name) : ['', '']),
    [state.players],
  )

  const prepareRound = useCallback(
    async (onProgress: (pct: number) => void): Promise<NarratorEngine> => {
      const used = state.slots.map((s) => s.word)
      const words = pickWords(state.settings.wordCount, {
        exclude: used,
        categories: state.settings.categories,
      })
      pendingWordsRef.current = words
      const engine = await prepareNarrator(onProgress)
      // Prefetch wav заранее: на Pages Silero — готовые файлы, лучше прогреть весь раунд.
      if (engine === 'silero' || engine === 'piper') {
        const all = [...ruCardinalsUpTo(words.length), ...words]
        const head = all.slice(0, 12)
        const rest = all.slice(12)
        await prefetchWords(head)
        void prefetchWords(rest)
      }
      return engine
    },
    [state.slots, state.settings.wordCount, state.settings.categories],
  )

  const beginRound = useCallback(async () => {
    stopSpeaking()
    const words = pendingWordsRef.current
    if (!words.length) {
      const used = state.slots.map((s) => s.word)
      pendingWordsRef.current = pickWords(state.settings.wordCount, {
        exclude: used,
        categories: state.settings.categories,
      })
    }
    await requestWakeLock()
    dispatch({ type: 'BEGIN_ROUND', words: pendingWordsRef.current })
  }, [state.slots, state.settings.wordCount, state.settings.categories])

  const partyFinished =
    state.phase === 'finished' ||
    (state.phase === 'score' && state.artistsDone >= state.players.length)

  const continueLabel = (() => {
    if (!resumeCandidate) return undefined
    if (resumeCandidate.phase === 'lobby') return 'Продолжить настройку'
    if (resumeCandidate.phase === 'quiz') return 'Продолжить викторину'
    if (resumeCandidate.phase === 'score' || resumeCandidate.phase === 'finished') {
      return 'К счёту партии'
    }
    const a = resumeCandidate.players[resumeCandidate.artistIndex]?.name
    return a ? `Продолжить · ${a}` : 'Продолжить партию'
  })()

  return (
    <div className="app-shell">
      <PullToRefresh />
      <UpdateBanner />
      <InstallBanner />

      {state.phase === 'home' && (
        <HomeScreen
          onPlay={() => {
            clearParty()
            setResumeCandidate(null)
            dispatch({ type: 'GO_LOBBY' })
          }}
          onRules={() => dispatch({ type: 'GO_RULES' })}
          onContinue={
            resumeCandidate
              ? () => dispatch({ type: 'HYDRATE', state: resumeCandidate })
              : undefined
          }
          continueLabel={continueLabel}
        />
      )}

      {state.phase === 'rules' && (
        <RulesScreen
          onBack={() => dispatch({ type: 'GO_HOME' })}
          onPlay={() => {
            clearParty()
            setResumeCandidate(null)
            dispatch({ type: 'GO_LOBBY' })
          }}
        />
      )}

      {state.phase === 'lobby' && (
        <LobbyScreen
          names={names}
          settings={state.settings}
          onNames={(n) => dispatch({ type: 'SET_PLAYERS', names: n })}
          onSettings={(s) => dispatch({ type: 'SET_SETTINGS', settings: s })}
          onStart={() => dispatch({ type: 'START_PARTY' })}
          onBack={goHomeFresh}
        />
      )}

      {state.phase === 'ready' && artist && (
        <ReadyScreen
          artist={artist}
          players={state.players}
          roundLabel={`Раунд ${state.artistsDone + 1} из ${state.players.length}`}
          wordCount={state.settings.wordCount}
          speed={state.settings.speed}
          categories={state.settings.categories}
          artistsDone={state.artistsDone}
          onPrepare={prepareRound}
          onBegin={beginRound}
          onBack={() => dispatch({ type: 'GO_LOBBY' })}
        />
      )}

      {state.phase === 'round' && artist && state.slots[state.currentSlotIndex] && (
        <RoundScreen
          slot={state.slots[state.currentSlotIndex]}
          index={state.currentSlotIndex}
          total={state.slots.length}
          drawMode={state.settings.drawMode}
          speed={state.settings.speed}
          artistName={artist.name}
          upcomingWords={state.slots
            .slice(state.currentSlotIndex + 1, state.currentSlotIndex + 6)
            .map((s) => s.word)}
          onComplete={(dataUrl) =>
            dispatch({ type: 'COMPLETE_SLOT', dataUrl })
          }
          onBack={() => dispatch({ type: 'ABORT_ROUND' })}
        />
      )}

      {state.phase === 'quiz' && artist && asker && (
        <QuizScreen
          slots={state.slots}
          drawMode={state.settings.drawMode}
          artist={artist}
          asker={asker}
          players={state.players}
          askerCount={askersFor(state).length || quiz.askers}
          quizRounds={quiz.rounds}
          quizAsksDone={state.quizAsksDone}
          quizAskTarget={state.quizAskTarget || quiz.target}
          selectedSlotIndex={state.selectedSlotIndex}
          onSelect={(index) => dispatch({ type: 'SELECT_SLOT', index })}
          onAnswer={(correct) => dispatch({ type: 'ANSWER', correct })}
          onLeave={() => dispatch({ type: 'GO_LOBBY' })}
        />
      )}

      {state.phase === 'quiz' && artist && !asker && (
        <section className="screen">
          <p className="hint">Нужно минимум 2 игрока.</p>
          <button
            type="button"
            className="btn primary"
            onClick={() => dispatch({ type: 'GO_LOBBY' })}
          >
            К команде
          </button>
        </section>
      )}

      {(state.phase === 'score' || state.phase === 'finished') && (
        <ScoreScreen
          players={state.players}
          summary={state.lastRoundSummary}
          finished={partyFinished}
          nextArtistName={
            !partyFinished
              ? state.players[state.artistIndex + 1]?.name
              : undefined
          }
          onNext={() => dispatch({ type: 'NEXT_ARTIST' })}
          onHome={goHomeFresh}
          onRematch={() => dispatch({ type: 'REMATCH' })}
          onLobby={() => dispatch({ type: 'GO_LOBBY' })}
        />
      )}
    </div>
  )
}
