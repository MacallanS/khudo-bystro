import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ScorePeek } from '../components/ScorePeek'
import type { Player } from '../game/types'

type Props = {
  artist: Player
  players: Player[]
  roundLabel: string
  wordCount: number
  drawMode: string
  speed: string
  artistsDone: number
  onStart: (onProgress: (pct: number) => void) => Promise<void>
  onBack: () => void
}

const SPEED_LABEL: Record<string, string> = {
  slow: 'медленно',
  normal: 'норма',
  chaos: 'хаос',
}

export function ReadyScreen({
  artist,
  players,
  roundLabel,
  wordCount,
  drawMode,
  speed,
  artistsDone,
  onStart,
  onBack,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const handleStart = () => {
    if (loading) return
    setLoading(true)
    setProgress(0)
    void onStart((pct) => setProgress(pct)).finally(() => {
      setLoading(false)
    })
  }

  const requestBack = () => {
    if (artistsDone > 0) setConfirmLeave(true)
    else onBack()
  }

  const order = players.map((p, i) => ({
    ...p,
    done: i < artistsDone && p.id !== artist.id,
    current: p.id === artist.id,
  }))

  return (
    <section className="screen ready">
      <button type="button" className="back-link" onClick={requestBack}>
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
        <li>Верно вспомнил — очко художнику</li>
        <li>Забыл — очко спросившему</li>
      </ul>

      <p className="hint">
        Диктор: Silero (если <code>npm run tts</code>) или Piper Irina в браузере.
      </p>

      {loading && (
        <div className="tts-load">
          <p>Готовим диктора… {progress}%</p>
          <div className="draw-bar">
            <span style={{ width: `${Math.max(progress, 5)}%` }} />
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn primary wide pulse"
        onClick={handleStart}
        disabled={loading}
      >
        {loading ? 'Готовим диктора…' : 'Старт диктанта'}
      </button>

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
