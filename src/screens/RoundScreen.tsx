import { useEffect, useRef, useState } from 'react'
import { CanvasDraw } from '../components/CanvasDraw'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ruCardinal } from '../game/ruNumbers'
import {
  ensureReady,
  GAP_MS,
  prefetchWords,
  randomGap,
  speakWord,
  stopSpeaking,
  wait,
  waitInterruptible,
} from '../game/tts'
import type { DrawMode, Slot, Speed } from '../game/types'

/** Короткая пауза между номером и словом */
const NUMBER_WORD_GAP_MS = 120

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
  const statusRef = useRef<'speak' | 'gap'>('speak')
  /** Речь слота оборвали паузой — после снятия повторяем номер+слово */
  const speechAbortRef = useRef(false)
  onCompleteRef.current = onComplete
  pausedRef.current = paused

  const upcomingKey = upcomingWords.join('\n')

  useEffect(() => {
    const words = upcomingKey ? upcomingKey.split('\n') : []
    // Пары: следующий номер + слово, потом ещё дальше
    const pairs: string[] = []
    for (let i = 0; i < words.length; i++) {
      pairs.push(ruCardinal(index + 2 + i), words[i]!)
    }
    void prefetchWords(pairs)
  }, [upcomingKey, index])

  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) return
      pausedRef.current = true
      setPaused(true)
      if (statusRef.current === 'speak') {
        speechAbortRef.current = true
        stopSpeaking()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    draftUrl.current = undefined
    finishedRef.current = false
    speechAbortRef.current = false
    statusRef.current = 'speak'
    setStatus('speak')
    setTtsError(false)
    let cancelled = false

    const done = () => cancelled || finishedRef.current

    const waitWhilePaused = async () => {
      while (pausedRef.current) {
        if (done()) return
        await wait(80)
      }
    }

    const speakAborted = () =>
      done() || speechAbortRef.current || pausedRef.current

    const run = async () => {
      // Повторяем озвучку слота, пока пауза не оборвёт речь
      for (;;) {
        speechAbortRef.current = false
        await waitWhilePaused()
        if (done()) return

        statusRef.current = 'speak'
        setStatus('speak')
        const numberText = ruCardinal(index + 1)
        await ensureReady([numberText, slot.word], {
          isCancelled: speakAborted,
        })
        if (done()) return
        if (speechAbortRef.current || pausedRef.current) {
          await waitWhilePaused()
          if (done()) return
          continue
        }
        // Следующий слот греем в фоне, пока говорим текущий
        if (upcomingWords[0]) {
          void prefetchWords([
            ruCardinal(index + 2),
            upcomingWords[0],
          ])
        }
        const say = async (text: string) => {
          try {
            await speakWord(text, speed, { isCancelled: speakAborted })
          } catch {
            if (speakAborted()) throw new Error('aborted')
            await wait(150)
            if (speakAborted()) throw new Error('aborted')
            await speakWord(text, speed, { isCancelled: speakAborted })
          }
        }
        try {
          await say(numberText)
          if (done()) return
          if (speechAbortRef.current || pausedRef.current) {
            await waitWhilePaused()
            if (done()) return
            continue
          }

          const mid = await waitInterruptible(NUMBER_WORD_GAP_MS, {
            isPaused: () => pausedRef.current,
            isCancelled: () => done() || speechAbortRef.current,
          })
          if (done() || mid === 'cancelled') return
          if (speechAbortRef.current) {
            await waitWhilePaused()
            if (done()) return
            continue
          }

          await say(slot.word)
          if (done()) return
          if (speechAbortRef.current || pausedRef.current) {
            await waitWhilePaused()
            if (done()) return
            continue
          }
          break
        } catch {
          if (!done() && !speakAborted()) setTtsError(true)
          if (speechAbortRef.current || pausedRef.current) {
            await waitWhilePaused()
            if (done()) return
            continue
          }
          break
        }
      }

      if (done()) return

      await waitWhilePaused()
      if (done()) return

      statusRef.current = 'gap'
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
      if (next && statusRef.current === 'speak') {
        speechAbortRef.current = true
        stopSpeaking()
      }
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

  const gapPct = Math.max(
    0,
    Math.min(100, (gapLeft / Math.max(gapBudget, 1)) * 100),
  )
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
          <p className="hint stage-hint">Голос не ответил — проверь звук</p>
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
