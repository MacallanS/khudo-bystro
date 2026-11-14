import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ScorePeek } from '../components/ScorePeek'
import { quizPlan } from '../game/reducer'
import { beepCount, beepGo, beepReady, resumeSfx } from '../game/sfx'
import type { NarratorEngine } from '../game/tts'
import { wait } from '../game/tts'
import type { Player } from '../game/types'

type Phase = 'preparing' | 'ready' | 'counting'

type Props = {
  artist: Player
  players: Player[]
  roundLabel: string
  wordCount: number
  drawMode: string
  speed: string
  artistsDone: number
  onPrepare: (onProgress: (pct: number) => void) => Promise<NarratorEngine>
  onBegin: () => Promise<void>
  onBack: () => void
}

const SPEED_LABEL: Record<string, string> = {
  slow: 'медленно',
  normal: 'норма',
  chaos: 'хаос',
}

const ENGINE_LABEL: Record<NarratorEngine, string> = {
  silero: 'Silero · aidar',
  piper: 'Piper Irina (запасной)',
  google: 'Google (запасной)',
}

export function ReadyScreen({
  artist,
  players,
  roundLabel,
  wordCount,
  drawMode,
  speed,
  artistsDone,
  onPrepare,
  onBegin,
  onBack,
}: Props) {
  const [phase, setPhase] = useState<Phase>('preparing')
  const [progress, setProgress] = useState(0)
  const [engine, setEngine] = useState<NarratorEngine | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const startedRef = useRef(false)
  const cancelledRef = useRef(false)

  useEffect(() => {
    cancelledRef.current = false
    startedRef.current = false
    setPhase('preparing')
    setProgress(0)
    setError(null)
    setCount(null)

    void (async () => {
      try {
        const eng = await onPrepare((pct) => {
          if (!cancelledRef.current) setProgress(pct)
        })
        if (cancelledRef.current) return
        setEngine(eng)
        setPhase('ready')
        setProgress(100)
        await resumeSfx()
        beepReady()
      } catch {
        if (cancelledRef.current) return
        setError('Не удалось загрузить диктора. Проверь звук и npm run tts.')
        setPhase('ready')
        setEngine('google')
      }
    })()

    return () => {
      cancelledRef.current = true
    }
  }, [onPrepare, artist.id])

  const requestBack = () => {
    if (phase === 'counting') return
    if (artistsDone > 0) setConfirmLeave(true)
    else onBack()
  }

  const handleBegin = () => {
    if (phase !== 'ready' || startedRef.current) return
    startedRef.current = true
    setPhase('counting')
    void (async () => {
      await resumeSfx()
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

      <div className="pass-phone" role="status">
        Передай телефон → <strong>{artist.name}</strong>
      </div>

      <p className="eyebrow">{roundLabel}</p>
      <h2>
        Художник:
        <span className="accent"> {artist.name}</span>
      </h2>
      <p className="lede">
        {wordCount} слов · {drawMode === 'paper' ? 'листы' : 'экран'} ·{' '}
        {SPEED_LABEL[speed] || speed}. Текст не показывается — только звук.
      </p>

      <ul className="artist-queue">
        {order.map((p) => (
          <li
            key={p.id}
            className={
              p.current ? 'current' : p.done ? 'done' : undefined
            }
          >
            {p.done ? '✓' : p.current ? '→' : '·'} {p.name}
          </li>
        ))}
      </ul>

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
          <p>Готовим диктора… {progress}%</p>
          <div className="draw-bar">
            <span style={{ width: `${Math.max(progress, 5)}%` }} />
          </div>
        </div>
      )}

      {phase === 'ready' && engine && (
        <p className="hint">
          Диктор готов: <strong>{ENGINE_LABEL[engine]}</strong>
          {engine !== 'silero' && (
            <>
              {' '}
              — для чёткого русского запусти <code>npm run tts</code>
            </>
          )}
        </p>
      )}

      {error && <p className="hint">{error}</p>}

      {phase === 'counting' && count != null && (
        <div className="countdown-stage" aria-live="assertive">
          <p className="word-label">
            {count === 0 ? 'Поехали' : 'На старт'}
          </p>
          <p className="countdown-num">{count === 0 ? '●' : count}</p>
        </div>
      )}

      {phase === 'ready' && (
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
