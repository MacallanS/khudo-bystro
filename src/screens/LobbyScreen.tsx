import { MAX_PLAYERS } from '../game/reducer'
import type { DrawMode, GameSettings, Speed, WordCount } from '../game/types'

type Props = {
  names: string[]
  settings: GameSettings
  onNames: (names: string[]) => void
  onSettings: (s: Partial<GameSettings>) => void
  onStart: () => void
  onBack: () => void
}

export function LobbyScreen({
  names,
  settings,
  onNames,
  onSettings,
  onStart,
  onBack,
}: Props) {
  const updateName = (i: number, value: string) => {
    const next = [...names]
    next[i] = value
    onNames(next)
  }

  const addPlayer = () => {
    if (names.length >= MAX_PLAYERS) return
    onNames([...names, ''])
  }
  const removePlayer = (i: number) => {
    if (names.length <= 2) return
    onNames(names.filter((_, idx) => idx !== i))
  }

  const ready =
    names.length >= 2 && names.every((n) => n.trim().length > 0)

  return (
    <section className="screen lobby">
      <button type="button" className="back-link" onClick={onBack}>
        ← Назад
      </button>
      <h2>Создать партию</h2>
      <p className="hint">
        От 2 до {MAX_PLAYERS} игроков. Один телефон — передаёте по кругу.
        Порядок имён = порядок художников.
      </p>

      <div className="card-block">
        <h3>Игроки</h3>
        <ul className="player-list">
          {names.map((name, i) => (
            <li key={i}>
              <input
                value={name}
                placeholder={`Игрок ${i + 1}`}
                onChange={(e) => updateName(i, e.target.value)}
                autoComplete="off"
                enterKeyHint="done"
              />
              {names.length > 2 && (
                <button
                  type="button"
                  className="btn ghost icon"
                  aria-label="Удалить"
                  onClick={() => removePlayer(i)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {names.length < MAX_PLAYERS && (
          <button type="button" className="btn ghost" onClick={addPlayer}>
            + Ещё игрок
          </button>
        )}
      </div>

      <div className="card-block">
        <h3>Режим рисования</h3>
        <div className="seg">
          {([
            ['phone', 'На телефоне'],
            ['paper', 'На листах'],
          ] as [DrawMode, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={settings.drawMode === value ? 'seg-btn on' : 'seg-btn'}
              onClick={() => onSettings({ drawMode: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card-block">
        <h3>Слов за раунд</h3>
        <div className="seg">
          {([10, 15, 25] as WordCount[]).map((n) => (
            <button
              key={n}
              type="button"
              className={settings.wordCount === n ? 'seg-btn on' : 'seg-btn'}
              onClick={() => onSettings({ wordCount: n })}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="card-block">
        <h3>Скорость диктанта</h3>
        <div className="seg">
          {([
            ['slow', 'Медленно'],
            ['normal', 'Норма'],
            ['chaos', 'Хаос'],
          ] as [Speed, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={settings.speed === value ? 'seg-btn on' : 'seg-btn'}
              onClick={() => onSettings({ speed: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="btn primary wide"
        disabled={!ready}
        onClick={onStart}
      >
        Начать
      </button>
    </section>
  )
}
