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
import { dictationPrefetchOrder } from './game/ruNumbers'
import {
  appendPlayedWords,
  clearPlayedWords,
  getPlayedWords,
} from './game/playedWords'
import { pickWordsForRound } from './game/words'
import {
  armNarrator,
  prepareNarrator,
  prefetchAndDecode,
  releaseNarratorAudio,
  stopPlayback,
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

function loadInitialState(): GameState {
  const raw = loadParty()
  if (raw && canResumeParty(raw)) return sanitizeParty(raw)
  return createInitialState()
}

export default function App() {
  // После reload / PWA-обновления сразу в партию, не на пустую главную
  const [state, dispatch] = useReducer(gameReducer, undefined, loadInitialState)
  const [resumeCandidate, setResumeCandidate] = useState<GameState | null>(() => {
    const raw = loadParty()
    if (!raw || !canResumeParty(raw)) return null
    return sanitizeParty(raw)
  })
  const pendingWordsRef = useRef<string[]>([])
  const [bankNotice, setBankNotice] = useState<string | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const selectRoundWords = useCallback(() => {
    const { words, reusedHistory } = pickWordsForRound(
      state.settings.wordCount,
      {
        exclude: [...state.usedWords, ...state.slots.map((s) => s.word)],
        categories: state.settings.categories,
      },
      getPlayedWords(),
    )
    if (reusedHistory) {
      setBankNotice('Новых слов мало — могут повториться из прошлых игр')
      window.setTimeout(() => setBankNotice(null), 4000)
    }
    return words
  }, [
    state.settings.wordCount,
    state.settings.categories,
    state.usedWords,
    state.slots,
  ])

  useEffect(() => {
    warmUpVoices()
    return initInstallCapture()
  }, [])

  useEffect(() => {
    if (state.phase === 'home' || state.phase === 'rules') return
    saveParty(state)
    if (canResumeParty(state)) setResumeCandidate(sanitizeParty(state))
  }, [state])

  // Перед закрытием/reload — сразу сбросить state в storage (не ждать React effect)
  useEffect(() => {
    const flush = () => {
      const s = stateRef.current
      if (s.phase === 'home' || s.phase === 'rules') return
      saveParty(s)
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [])

  const goHomeFresh = () => {
    clearParty()
    clearPlayedWords()
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
      const words = selectRoundWords()
      pendingWordsRef.current = words
      // Двигатель ~0–35%, затем fetch+decode всех пар раунда 35–100%.
      const engine = await prepareNarrator((pct) =>
        onProgress(Math.round(pct * 0.35)),
      )
      if (engine === 'silero' || engine === 'piper') {
        const all = dictationPrefetchOrder(words)
        await prefetchAndDecode(all, (done, total) => {
          const t = Math.max(1, total)
          onProgress(35 + Math.round((done / t) * 65))
        })
      } else {
        onProgress(100)
      }
      return engine
    },
    [selectRoundWords],
  )

  const beginRound = useCallback(async () => {
    // Не bump speakGen — иначе на телефоне «теряется» следующее слово после countdown
    stopPlayback()
    await armNarrator()
    const words = pendingWordsRef.current
    if (!words.length) {
      pendingWordsRef.current = selectRoundWords()
    }
    await requestWakeLock()
    const roundWords = pendingWordsRef.current
    appendPlayedWords(roundWords)
    dispatch({ type: 'BEGIN_ROUND', words: roundWords })
  }, [selectRoundWords])

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
      {bankNotice && (
        <p className="bank-notice" role="status">
          {bankNotice}
        </p>
      )}

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
          onComplete={(dataUrl) => {
            // Последний слот → викторина: отпустить keep-alive
            if (state.currentSlotIndex >= state.slots.length - 1) {
              releaseNarratorAudio()
            }
            dispatch({ type: 'COMPLETE_SLOT', dataUrl })
          }}
          onBack={() => {
            releaseNarratorAudio()
            dispatch({ type: 'ABORT_ROUND' })
          }}
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
          onNext={() => dispatch({ type: 'NEXT_ARTIST' })}
          onHome={goHomeFresh}
          onRematch={() => dispatch({ type: 'REMATCH' })}
          onLobby={() => dispatch({ type: 'GO_LOBBY' })}
        />
      )}
    </div>
  )
}
