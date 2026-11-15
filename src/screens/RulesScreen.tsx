import { useState } from 'react'
import { SheetTemplate } from '../components/SheetTemplate'
import { downloadSheetDoc } from '../game/sheetLayout'
import type { WordCount } from '../game/types'

type Props = {
  onBack: () => void
  onPlay: () => void
}

const WORD_COUNTS: WordCount[] = [10, 15, 25, 30, 35, 40]

export function RulesScreen({ onBack, onPlay }: Props) {
  const [sheetCount, setSheetCount] = useState<WordCount>(25)

  return (
    <section className="screen rules">
      <button type="button" className="back-link" onClick={onBack}>
        ← Назад
      </button>
      <h2>Как играть</h2>
      <ol className="rules-list">
        <li>
          <strong>Команда</strong> — от 2 человек, один телефон на всех.
        </li>
        <li>
          <strong>Художник</strong> берёт телефон. Диктор говорит слова подряд —
          текст на экране не показывается.
        </li>
        <li>
          Рисуй на <strong>листах</strong> (номер = слово) или на экране.
          Таймер сам переключает дальше.
        </li>
        <li>
          <strong>Викторина</strong>: не все рисунки — несколько кругов
          спрашивающих (4 → 3 круга, 6 → 2; вопросов не меньше ~8).
          Верно — очко художнику, забыл — спросившему.
        </li>
        <li>
          Дальше рисует следующий. Когда все побыли художниками — финал.
        </li>
      </ol>
      <p className="hint">
        Пауза и «назад» всегда под рукой. Если обновить страницу во время
        диктанта — вернёшься к экрану готовности того же художника.
      </p>

      <div className="rules-sheets">
        <h3>Шаблоны листов</h3>
        <p className="hint">
          Скачай в Word и распечатай — рисуй в ячейках, номер = слово. Не нужно
          разлиновывать.
        </p>
        <div className="seg seg-wrap">
          {WORD_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              className={sheetCount === n ? 'seg-btn on' : 'seg-btn'}
              onClick={() => setSheetCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <SheetTemplate count={sheetCount} />
        <button
          type="button"
          className="btn ghost wide"
          onClick={() => downloadSheetDoc(sheetCount)}
        >
          Скачать в Word
        </button>
      </div>

      <button type="button" className="btn primary wide" onClick={onPlay}>
        Создать партию
      </button>
    </section>
  )
}
