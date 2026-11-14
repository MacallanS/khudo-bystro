import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ScorePeek } from '../components/ScorePeek'
import type { DrawMode, Player, Slot } from '../game/types'

type Props = {
  slots: Slot[]
  drawMode: DrawMode
  artist: Player
  asker: Player
  players: Player[]
  selectedSlotIndex: number | null
  revealWord: string | null
  onSelect: (index: number) => void
  onAnswer: (correct: boolean) => void
  onClearReveal: () => void
  onLeave: () => void
}

export function QuizScreen({
  slots,
  drawMode,
  artist,
  asker,
  players,
  selectedSlotIndex,
  revealWord,
  onSelect,
  onAnswer,
  onClearReveal,
  onLeave,
}: Props) {
  const remaining = slots.filter((s) => !s.answered).length
  const selected = selectedSlotIndex != null ? slots[selectedSlotIndex] : null
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [passFlash, setPassFlash] = useState(true)
  const prevAsker = useRef(asker.id)

  useEffect(() => {
    if (prevAsker.current !== asker.id) {
      prevAsker.current = asker.id
      setPassFlash(true)
    }
  }, [asker.id])

  return (
    <section className="screen quiz">
      <button
        type="button"
        className="back-link"
        onClick={() => setConfirmLeave(true)}
      >
        ← Выйти
      </button>

      {passFlash && (
        <div className="pass-phone" role="status">
          Телефон → спросивающий <strong>{asker.name}</strong>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setPassFlash(false)}
          >
            Ок
          </button>
        </div>
      )}

      <p className="eyebrow">Викторина · осталось {remaining}</p>
      <h2>
        Спрашивает <span className="accent">{asker.name}</span>
      </h2>
      <p className="hint">
        Покажи рисунок художнику <strong>{artist.name}</strong> и попроси назвать
        слово.
      </p>

      <ScorePeek players={players} compact />

      {revealWord && (
        <div className="reveal" role="status">
          Было: <strong>{revealWord}</strong>
          <button type="button" className="btn ghost small" onClick={onClearReveal}>
            Ок
          </button>
        </div>
      )}

      <div className="slot-grid">
        {slots.map((slot) => (
          <button
            key={slot.index}
            type="button"
            className={[
              'slot-tile',
              slot.answered ? 'done' : '',
              selectedSlotIndex === slot.index ? 'picked' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={slot.answered}
            onClick={() => {
              setPassFlash(false)
              onSelect(slot.index)
            }}
          >
            {drawMode === 'phone' && slot.drawingDataUrl ? (
              <img src={slot.drawingDataUrl} alt={`Рисунок ${slot.index + 1}`} />
            ) : (
              <span className="slot-num">{slot.index + 1}</span>
            )}
            {slot.answered && (
              <span className={`mark ${slot.correct ? 'ok' : 'bad'}`}>
                {slot.correct ? '✓' : '×'}
              </span>
            )}
          </button>
        ))}
      </div>

      {!selected && !revealWord && (
        <p className="hint center-hint">Выбери рисунок / лист</p>
      )}

      {selected && !selected.answered && (
        <div className="answer-bar">
          <p>
            Рисунок {selected.index + 1}. {artist.name} назвал правильно?
          </p>
          <div className="cta-row">
            <button
              type="button"
              className="btn primary"
              onClick={() => onAnswer(true)}
            >
              Верно → {artist.name}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => onAnswer(false)}
            >
              Забыл → {asker.name}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmLeave}
        title="Выйти из викторины?"
        body="Раунд оборвётся, счёт партии сбросится. Вернёшься к созданию команды."
        confirmLabel="Выйти"
        danger
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false)
          onLeave()
        }}
      />
    </section>
  )
}
