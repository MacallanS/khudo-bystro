import { useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { Player } from '../game/types'

type Props = {
  players: Player[]
  summary: { correct: number; missed: number } | null
  finished: boolean
  onNext: () => void
  onHome: () => void
  onRematch: () => void
  onLobby: () => void
}

export function ScoreScreen({
  players,
  summary,
  finished,
  onNext,
  onHome,
  onRematch,
  onLobby,
}: Props) {
  const ranked = [...players].sort((a, b) => b.score - a.score)
  const [confirmLobby, setConfirmLobby] = useState(false)
  const top = ranked[0]?.score ?? 0
  const winners = ranked.filter((p) => p.score === top && top > 0)

  return (
    <section className="screen score">
      <button
        type="button"
        className="back-link"
        onClick={() => setConfirmLobby(true)}
      >
        ← К команде
      </button>

      <p className="eyebrow">{finished ? 'Финал' : 'Счёт раунда'}</p>
      <h2>
        {finished
          ? winners.length > 1
            ? 'Ничья за столом'
            : winners.length === 1
              ? `Победа: ${winners[0].name}`
              : 'Победители стола'
          : 'Промежуточный счёт'}
      </h2>

      {summary && (
        <p className="hint">
          В этом раунде вспомнил {summary.correct} из{' '}
          {summary.correct + summary.missed}
        </p>
      )}

      <ol className="scoreboard">
        {ranked.map((p, i) => (
          <li key={p.id} className={finished && p.score === top && top > 0 ? 'winner' : undefined}>
            <span className="rank">{i + 1}</span>
            <span className="name">{p.name}</span>
            <span className="pts">{p.score}</span>
          </li>
        ))}
      </ol>

      <div className="cta-stack">
        {finished ? (
          <>
            <button type="button" className="btn primary wide" onClick={onRematch}>
              Ещё раз тем же составом
            </button>
            <button type="button" className="btn ghost wide" onClick={onHome}>
              На главную
            </button>
            <button type="button" className="btn ghost wide" onClick={onLobby}>
              Другая команда
            </button>
          </>
        ) : (
          <button type="button" className="btn primary wide" onClick={onNext}>
            Следующий художник
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmLobby}
        title="К созданию команды?"
        body="Счёт текущей партии сбросится. Имена сохранятся."
        confirmLabel="К команде"
        danger
        onCancel={() => setConfirmLobby(false)}
        onConfirm={() => {
          setConfirmLobby(false)
          onLobby()
        }}
      />
    </section>
  )
}
