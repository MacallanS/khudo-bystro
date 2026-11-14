import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ScorePeek } from '../components/ScorePeek'
import type { DrawMode, Player, Slot } from '../game/types'

type Props = {
  slots: Slot[]
  drawMode: DrawMode
  artist: Player
  asker: Player
  players: Player[]
  askerCount: number
  quizRounds: number
  quizAsksDone: number
  quizAskTarget: number
  selectedSlotIndex: number | null
  onSelect: (index: number) => void
  onAnswer: (correct: boolean) => void
  onLeave: () => void
}

export function QuizScreen({
  slots,
  drawMode,
  artist,
  asker,
  players,
  askerCount,
  quizRounds,
  quizAsksDone,
  quizAskTarget,
  selectedSlotIndex,
  onSelect,
  onAnswer,
  onLeave,
}: Props) {
  const selected = selectedSlotIndex != null ? slots[selectedSlotIndex] : null
  const asksLeft = Math.max(0, quizAskTarget - quizAsksDone)
  const currentRound = Math.min(
    quizRounds,
    Math.floor(quizAsksDone / Math.max(askerCount, 1)) + 1,
  )
  const [confirmLeave, setConfirmLeave] = useState(false)

  return (
    <section className="screen quiz">
      <button
        type="button"
        className="back-link"
        onClick={() => setConfirmLeave(true)}
      >
        ← Выйти
      </button>

      <p className="eyebrow">
        Викторина · круг {currentRound}/{quizRounds} · осталось {asksLeft}
      </p>
      <h2>
        Спрашивает <span className="accent">{asker.name}</span>
      </h2>
      <p className="hint">
        Покажи рисунок художнику <strong>{artist.name}</strong> и попроси назвать
        слово.
      </p>

      <ScorePeek players={players} compact />

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
            onClick={() => onSelect(slot.index)}
          >
            {slot.answered ? (
              <>
                {drawMode === 'phone' && slot.drawingDataUrl ? (
                  <img
                    src={slot.drawingDataUrl}
                    alt={`Рисунок ${slot.index + 1}`}
                  />
                ) : null}
                <span className="slot-word">{slot.word}</span>
                <span className={`mark ${slot.correct ? 'ok' : 'bad'}`}>
                  {slot.correct ? '✓' : '×'}
                </span>
              </>
            ) : drawMode === 'phone' && slot.drawingDataUrl ? (
              <img src={slot.drawingDataUrl} alt={`Рисунок ${slot.index + 1}`} />
            ) : (
              <span className="slot-num">{slot.index + 1}</span>
            )}
          </button>
        ))}
      </div>

      {!selected && (
        <p className="hint center-hint">Выбери рисунок / лист</p>
      )}

      {selected && !selected.answered && (
        <div className="answer-bar">
          <p className="answer-slot">Рисунок {selected.index + 1}</p>
          <p className="answer-word">{selected.word}</p>
          <p>{artist.name} назвал правильно?</p>
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
