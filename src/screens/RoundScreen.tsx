import { useEffect, useRef, useState } from 'react'
import { CanvasDraw } from '../components/CanvasDraw'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ruCardinal } from '../game/ruNumbers'
import {
  GAP_MS,
  pauseSpeaking,
  prefetchWords,
  randomGap,
  resumeSpeaking,
  speakWord,
  stopSpeaking,
  wait,
  waitInterruptible,
} from '../game/tts'

/** Пауза между номером и словом — всегда одна, не зависит от скорости */
const NUMBER_WORD_GAP_MS = 280
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
  const [gapBudget, setGapBudget] = useState(GAP_MS[speed])
  const [ttsError, setTtsError] = useState(false)
  const [paused, setPaused] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const draftUrl = useRef<string | undefined>(slot.drawingDataUrl)
  const onCompleteRef = useRef(onComplete)
  const pausedRef = useRef(false)
  const finishedRef = useRef(false)
  onCompleteRef.current = onComplete
  pausedRef.current = paused

  const upcomingKey = upcomingWords.join('\n')

  useEffect(() => {
    const words = upcomingKey ? upcomingKey.split('\n') : []
    const nums = words.map((_, i) => ruCardinal(index + 2 + i))
    void prefetchWords([...nums, ...words])
  }, [upcomingKey, index])

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
        await speakWord(ruCardinal(index + 1), speed, { isCancelled: done })
        if (done()) return
        await wait(NUMBER_WORD_GAP_MS)
        if (done()) return
        await speakWord(slot.word, speed, { isCancelled: done })
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
      const budget = speed === 'chaos' ? randomGap() : GAP_MS[speed]
      setGapBudget(budget)
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
  }, [slot.index, slot.word, speed, drawMode, index])

  const togglePause = () => {
    setPaused((prev) => {
      const next = !prev
      pausedRef.current = next
      if (next) pauseSpeaking()
      else resumeSpeaking()
      return next
    })
  }

  const handleBack = () => {
    setConfirmLeave(true)
  }

  const confirmBack = () => {
    stopSpeaking()
    setConfirmLeave(false)
    onBack()
  }

  const gapPct = Math.max(0, Math.min(100, (gapLeft / Math.max(gapBudget, 1)) * 100))
  const listening = status === 'speak' && !paused
  const label = paused
    ? 'На паузе'
    : status === 'speak'
      ? 'Слушай номер и слово'
      : 'Рисуй · дальше само'
  const main =
    paused ? '||' : status === 'speak' ? '· · ·' : String(Math.ceil(gapLeft / 1000))

  return (
    <section className="screen round">
      <header className="round-top">
        <button type="button" className="back-link" onClick={handleBack}>
          ← Выйти
        </button>
      </header>

      <div className="round-status">
        <div>
          <p className="eyebrow">{artistName} · диктант</p>
          <p className="progress">
            {index + 1}
            <span> / {total}</span>
          </p>
        </div>
        <button
          type="button"
          className={`pause-toggle ${paused ? 'is-paused' : ''}`}
          onClick={togglePause}
        >
          {paused ? 'Продолжить' : 'Пауза'}
        </button>
      </div>

      <div
        className={`word-stage audio-only ${listening ? 'flash' : ''} ${
          paused ? 'is-paused' : ''
        }`}
      >
        {ttsError && (
          <p className="hint stage-hint">
            Голос не ответил — проверь звук
          </p>
        )}
        <p className="word-label">{label}</p>
        <p
          className={`word stage-main ${
            status === 'speak' && !paused ? 'listen-pulse' : ''
          } ${status === 'gap' && !paused ? 'draw-timer' : ''}`}
        >
          {main}
        </p>
        <div
          className={`draw-bar ${status === 'gap' && !paused ? '' : 'draw-bar-hidden'}`}
          aria-hidden
        >
          <span style={{ width: `${status === 'gap' ? gapPct : 0}%` }} />
        </div>
      </div>

      {drawMode === 'phone' && (
        <CanvasDraw
          key={slot.index}
          disabled={paused}
          onChange={(url) => {
            draftUrl.current = url
          }}
        />
      )}

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
