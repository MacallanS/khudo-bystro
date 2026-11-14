import { useEffect, useRef, useState } from 'react'
import { CanvasDraw } from '../components/CanvasDraw'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  GAP_MS,
  pauseSpeaking,
  prefetchWords,
  resumeSpeaking,
  speakWord,
  stopSpeaking,
  waitInterruptible,
} from '../game/tts'
import type { DrawMode, Slot, Speed } from '../game/types'

type Props = {
  slot: Slot
  index: number
  total: number
  drawMode: DrawMode
  speed: Speed
  artistName: string
  upcomingWords?: string[]
  onComplete: (dataUrl?: string) => void
  onBack: () => void
}

export function RoundScreen({
  slot,
  index,
  total,
  drawMode,
  speed,
  artistName,
  upcomingWords = [],
  onComplete,
  onBack,
}: Props) {
  const [status, setStatus] = useState<'speak' | 'gap'>('speak')
  const [gapLeft, setGapLeft] = useState(0)
  const [ttsError, setTtsError] = useState(false)
  const [paused, setPaused] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const draftUrl = useRef<string | undefined>(slot.drawingDataUrl)
  const onCompleteRef = useRef(onComplete)
  const pausedRef = useRef(false)
  const finishedRef = useRef(false)
  onCompleteRef.current = onComplete
  pausedRef.current = paused

  useEffect(() => {
    void prefetchWords(upcomingWords)
  }, [upcomingWords])

  // автопауза при уходе со вкладки / блокировке экрана
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        pausedRef.current = true
        setPaused(true)
        pauseSpeaking()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    draftUrl.current = undefined
    finishedRef.current = false
    setStatus('speak')
    setTtsError(false)
    let cancelled = false

    const done = () => cancelled || finishedRef.current

    const run = async () => {
      while (pausedRef.current) {
        if (done()) return
        await waitInterruptible(120, {
          isPaused: () => false,
          isCancelled: () => done(),
        })
      }
      if (done()) return

      setStatus('speak')
      try {
        await speakWord(slot.word, speed)
      } catch {
        if (!done()) setTtsError(true)
      }
      if (done()) return

      while (pausedRef.current) {
        if (done()) return
        await waitInterruptible(120, {
          isPaused: () => false,
          isCancelled: () => done(),
        })
      }
      if (done()) return

      setStatus('gap')
      const budget = GAP_MS[speed]
      setGapLeft(budget)

      const result = await waitInterruptible(budget, {
        isPaused: () => pausedRef.current,
        isCancelled: () => done(),
        onTick: (left) => setGapLeft(left),
      })
      if (result === 'cancelled' || done()) return

      finishedRef.current = true
      onCompleteRef.current(
        drawMode === 'phone' ? draftUrl.current : undefined,
      )
    }

    void run()

    return () => {
      cancelled = true
      stopSpeaking()
    }
  }, [slot.index, slot.word, speed, drawMode])

  const togglePause = () => {
    setPaused((prev) => {
      const next = !prev
      pausedRef.current = next
      if (next) pauseSpeaking()
      else resumeSpeaking()
      return next
    })
  }

  const finishNow = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    stopSpeaking()
    onComplete(drawMode === 'phone' ? draftUrl.current : undefined)
  }

  const handleBack = () => {
    setConfirmLeave(true)
  }

  const confirmBack = () => {
    stopSpeaking()
    setConfirmLeave(false)
    onBack()
  }

  const gapPct = Math.max(0, Math.min(100, (gapLeft / GAP_MS[speed]) * 100))
  const spinning = status === 'speak' && !paused

  return (
    <section className="screen round">
      <header className="round-top">
        <button type="button" className="back-link" onClick={handleBack}>
          ← Выйти
        </button>
        <button
          type="button"
          className={`btn ghost small ${paused ? 'on-pause' : ''}`}
          onClick={togglePause}
        >
          {paused ? '▶ Продолжить' : '⏸ Пауза'}
        </button>
      </header>

      <div>
        <p className="eyebrow">{artistName} · проигрыватель</p>
        <p className="progress">
          {index + 1} / {total}
          {paused ? ' · пауза' : ''}
        </p>
      </div>

      <div
        className={`word-stage audio-only record-deck ${
          spinning ? 'flash' : ''
        } ${paused ? 'is-paused' : ''}`}
      >
        <div className="vinyl" aria-hidden>
          <span className={spinning ? 'spin' : ''} />
        </div>
        {ttsError && (
          <p className="hint" style={{ marginBottom: 8 }}>
            Голос не ответил — нажми «Дальше» или проверь звук / <code>npm run tts</code>
          </p>
        )}
        {paused ? (
          <>
            <p className="word-label">На паузе</p>
            <p className="word listen-pulse">⏸</p>
          </>
        ) : status === 'speak' ? (
          <>
            <p className="word-label">Слушай — слово не пишется</p>
            <p className="word listen-pulse">● ● ●</p>
          </>
        ) : (
          <>
            <p className="word-label">Лист {index + 1} · дальше само</p>
            <p className="word draw-timer">{Math.ceil(gapLeft / 1000)}</p>
            <div className="draw-bar" aria-hidden>
              <span style={{ width: `${gapPct}%` }} />
            </div>
          </>
        )}
      </div>

      {drawMode === 'phone' ? (
        <CanvasDraw
          key={slot.index}
          disabled={paused}
          onChange={(url) => {
            draftUrl.current = url
          }}
        />
      ) : (
        <div className="paper-slot">
          <div className="paper-number">{index + 1}</div>
          <p>
            Лист {index + 1}
            {index + 1 < total
              ? ` → дальше ${index + 2}`
              : ' · последний'}
          </p>
        </div>
      )}

      <div className="player-controls">
        <button type="button" className="btn ghost" onClick={finishNow}>
          {index + 1 >= total ? 'К викторине' : 'Дальше →'}
        </button>
        <button type="button" className="btn primary" onClick={togglePause}>
          {paused ? 'Продолжить' : 'Пауза'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="Прервать диктант?"
        body="Прогресс этого раунда пропадёт. Вернёшься к экрану готовности."
        confirmLabel="Прервать"
        danger
        onCancel={() => setConfirmLeave(false)}
        onConfirm={confirmBack}
      />
    </section>
  )
}
