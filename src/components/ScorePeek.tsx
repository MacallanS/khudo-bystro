import type { Player } from '../game/types'

type Props = {
  players: Player[]
  compact?: boolean
}

export function ScorePeek({ players, compact }: Props) {
  const ranked = [...players].sort((a, b) => b.score - a.score)
  return (
    <ul className={`score-peek ${compact ? 'compact' : ''}`}>
      {ranked.map((p) => (
        <li key={p.id}>
          <span>{p.name}</span>
          <strong>{p.score}</strong>
        </li>
      ))}
    </ul>
  )
}
