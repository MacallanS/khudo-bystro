import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ScorePeek } from '../components/ScorePeek'
import { quizPlan } from '../game/reducer'
import { beepCount, beepGo, beepReady, resumeSfx } from '../game/sfx'
import { armNarrator, wait, type NarratorEngine } from '../game/tts'
import type { GameSettings, Player, WordCategory } from '../game/types'
import { categoryLabel } from '../game/words'

type Phase = 'preparing' | 'ready' | 'error' | 'counting'

type Props = {
  artist: Player
  players: Player[]
  roundLabel: string
  wordCount: number
  speed: string
  categories: GameSettings['categories']
  artistsDone: number
  onPrepare: (onProgress: (pct: number) => void) => Promise<NarratorEngine>
  onBegin: () => Promise<void>
  onBack: () => void
}

const SPEED_LABEL: Record<string, string> = {
  slow: 'медленно',
  normal: 'норма',
  fast: 'быстро',
  chaos: 'хаос',
}

function categoriesBrief(categories: GameSettings['categories']): string {
  if (categories === 'all' || !categories.length) return 'все категории'
  if (categories.length <= 3) {
    return categories.map((c: WordCategory) => categoryLabel(c)).join(', ')
  }
  return `${categories.length} категории`
}

export function ReadyScreen({
  artist,
  players,
  roundLabel,
  wordCount,
  speed,
  categories,
  artistsDone,
  onPrepare,
  onBegin,
  onBack,
}: Props) {
  const [phase, setPhase] = useState<Phase>('preparing')
  const [progress, setProgress] = useState(0)
  const [count, setCount] = useState<number | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const startedRef = useRef(false)
  const cancelledRef = useRef(false)
  const prepareGenRef = useRef(0)

  const runPrepare = useCallback(async () => {
    const gen = ++prepareGenRef.current
    setPhase('preparing')
    setProgress(0)
    setError(null)
    setCount(null)
    startedRef.current = false
    try {
      await onPrepare((pct) => {
        if (prepareGenRef.current === gen && !cancelledRef.current) {
          setProgress(pct)
        }
      })
      if (prepareGenRef.current !== gen || cancelledRef.current) return
      setPhase('ready')
      setProgress(100)
      setError(null)
      // Бип не должен ронять уже готовый прогрев (особенно без жеста на PWA)
      try {
        await resumeSfx()
        beepReady()
      } catch {
        // ignore
      }
    } catch (e) {
      if (prepareGenRef.current !== gen || cancelledRef.current) return
      const detail =
        e instanceof Error && e.message.trim() ? e.message.trim() : ''
      setError(
        detail
          ? `Не удалось загрузить диктора. ${detail}`
          : 'Не удалось загрузить диктора. Проверь звук.',
      )
      setPhase('error')
      setProgress(0)
    }
  }, [onPrepare])

  useEffect(() => {
    cancelledRef.current = false
    void runPrepare()
    return () => {
      cancelledRef.current = true
      prepareGenRef.current += 1
    }
  }, [runPrepare, artist.id, retryTick])

  const requestBack = () => {
    if (phase === 'counting') return
    if (artistsDone > 0) setConfirmLeave(true)
    else onBack()
  }

  const handleBegin = () => {
    if (phase !== 'ready' || error || startedRef.current) return
    startedRef.current = true
    setPhase('counting')
    void (async () => {
      await resumeSfx()
      // Жест пользователя: разблокируем Audio + speechSynthesis до countdown
      await armNarrator()
      for (const n of [3, 2, 1]) {
        if (cancelledRef.current) return
        setCount(n)
        beepCount(n)
        await wait(900)
      }
      if (cancelledRef.current) return
      setCount(0)
      beepGo()
      await wait(350)
      if (cancelledRef.current) return
      await onBegin()
    })()
  }

  const order = players.map((p, i) => ({
    ...p,
    done: i < artistsDone && p.id !== artist.id,
    current: p.id === artist.id,
  }))
  const quiz = quizPlan(players.length, wordCount)
  const roundsLabel = (() => {
    const n = quiz.rounds
    const mod10 = n % 10
    const mod100 = n % 100
    if (mod10 === 1 && mod100 !== 11) return `${n} круг`
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return `${n} круга`
    }
    return `${n} кругов`
  })()

  return (
    <section className="screen ready">
      <button
        type="button"
        className="back-link"
        onClick={requestBack}
        disabled={phase === 'counting'}
      >
        ← К команде
      </button>

      <p className="eyebrow">{roundLabel}</p>

      <div className="turn-card" role="status">
        <p className="turn-card-label">Сейчас рисует</p>
        <p className="turn-card-name">{artist.name}</p>
      </div>

      <p className="lede">
        {wordCount} слов · {SPEED_LABEL[speed] || speed} ·{' '}
        {categoriesBrief(categories)}
      </p>

      <div className="turn-queue">
        <h3>Очередь художников</h3>
        <ol className="artist-queue">
          {order.map((p, i) => (
            <li
              key={p.id}
              className={
                p.current ? 'current' : p.done ? 'done' : 'waiting'
              }
            >
              <span className="aq-index">{i + 1}</span>
              <span className="aq-name">{p.name}</span>
              <span className="aq-badge">
                {p.done ? 'уже был' : p.current ? 'сейчас' : 'дальше'}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {artistsDone > 0 && <ScorePeek players={players} compact />}

      <ul className="rules-mini">
        <li>Только запись — слова не пишутся</li>
        <li>
          Викторина: {roundsLabel} · {quiz.target} вопросов из {wordCount}
        </li>
        <li>Верно — очко художнику, забыл — спросившему</li>
      </ul>

      {phase === 'preparing' && (
        <div className="tts-load">
          <p>
            {progress < 35
              ? `Готовим диктора… ${progress}%`
              : `Греем слова раунда… ${progress}%`}
          </p>
          <div className="draw-bar">
            <span style={{ width: `${Math.max(progress, 5)}%` }} />
          </div>
        </div>
      )}

      {phase === 'error' && error && (
        <>
          <p className="hint">{error}</p>
          <button
            type="button"
            className="btn primary wide"
            onClick={() => setRetryTick((n) => n + 1)}
          >
            Повторить
          </button>
        </>
      )}

      {phase === 'counting' && count != null && (
        <div className="countdown-stage" aria-live="assertive">
          <p className="word-label">
            {count === 0 ? 'Поехали' : 'На старт'}
          </p>
          <p className="countdown-num">{count === 0 ? '●' : count}</p>
        </div>
      )}

      {phase === 'ready' && !error && (
        <button
          type="button"
          className="btn primary wide"
          onClick={handleBegin}
        >
          Начать
        </button>
      )}

      <ConfirmDialog
        open={confirmLeave}
        title="Выйти к команде?"
        body="Текущий счёт партии сбросится. Имена игроков останутся."
        confirmLabel="К команде"
        danger
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false)
          onBack()
        }}
      />
    </section>
  )
}
