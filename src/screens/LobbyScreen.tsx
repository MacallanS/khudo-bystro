import { MAX_PLAYERS } from '../game/reducer'
import type {
  DrawMode,
  GameSettings,
  Speed,
  WordCategory,
  WordCount,
} from '../game/types'
import { categoryLabel, listCategories } from '../game/words'

type Props = {
  names: string[]
  settings: GameSettings
  onNames: (names: string[]) => void
  onSettings: (s: Partial<GameSettings>) => void
  onStart: () => void
  onBack: () => void
}

const SPEED_OPTIONS: [Speed, string][] = [
  ['slow', 'Медленно'],
  ['normal', 'Норма'],
  ['fast', 'Быстро'],
  ['chaos', 'Хаос'],
]

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

  const selectedCats: WordCategory[] =
    settings.categories === 'all' ? [] : settings.categories
  const allSelected = settings.categories === 'all'

  const toggleCategory = (cat: WordCategory) => {
    if (allSelected) {
      onSettings({ categories: [cat] })
      return
    }
    const next = selectedCats.includes(cat)
      ? selectedCats.filter((c) => c !== cat)
      : [...selectedCats, cat]
    onSettings({ categories: next.length ? next : 'all' })
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
        <div className="seg seg-2">
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
        <h3>Категории</h3>
        <div className="cat-chips">
          <button
            type="button"
            className={allSelected ? 'chip on' : 'chip'}
            onClick={() => onSettings({ categories: 'all' })}
          >
            Все
          </button>
          {listCategories().map((cat) => {
            const on = !allSelected && selectedCats.includes(cat)
            return (
              <button
                key={cat}
                type="button"
                className={on ? 'chip on' : 'chip'}
                onClick={() => toggleCategory(cat)}
              >
                {categoryLabel(cat)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="card-block">
        <h3>Слов за раунд</h3>
        <div className="seg seg-4">
          {([10, 15, 25, 40] as WordCount[]).map((n) => (
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
        <div className="seg seg-4">
          {SPEED_OPTIONS.map(([value, label]) => (
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
        {settings.speed === 'chaos' && (
          <p className="seg-hint">Пауза каждый раз разная, от 1 с</p>
        )}
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
