type Props = {
  onBack: () => void
  onPlay: () => void
}

export function RulesScreen({ onBack, onPlay }: Props) {
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
          <strong>Викторина</strong>: спрашивающие по очереди показывают рисунок.
          Художник вспомнил — очко ему. Забыл — очко спросившему.
        </li>
        <li>
          Дальше рисует следующий. Когда все побыли художниками — финал.
        </li>
      </ol>
      <p className="hint">
        Пауза и «назад» всегда под рукой. Если обновить страницу во время
        диктанта — вернёшься к экрану готовности того же художника.
      </p>
      <button type="button" className="btn primary wide" onClick={onPlay}>
        Создать партию
      </button>
    </section>
  )
}
