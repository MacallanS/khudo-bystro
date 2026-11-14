type Props = {
  onPlay: () => void
  onRules: () => void
  onContinue?: () => void
  continueLabel?: string
}

export function HomeScreen({
  onPlay,
  onRules,
  onContinue,
  continueLabel,
}: Props) {
  return (
    <section className="screen home">
      <div className="home-glow" aria-hidden />
      <div className="home-scribble" aria-hidden />
      <p className="eyebrow">игра для компании</p>
      <h1 className="brand">
        Худо
        <span>Быстро</span>
      </h1>
      <p className="lede">
        Как в Тейбл Тайм «Художники»: проигрыватель сыплет слова — ты каракулишь.
        Потом компания ловит тебя на забывчивости.
      </p>
      <div className="cta-stack">
        {onContinue && (
          <button type="button" className="btn primary pulse wide" onClick={onContinue}>
            {continueLabel || 'Продолжить партию'}
          </button>
        )}
        <button
          type="button"
          className={onContinue ? 'btn ghost wide' : 'btn primary pulse wide'}
          onClick={onPlay}
        >
          {onContinue ? 'Новая партия' : 'Играть'}
        </button>
        <button type="button" className="btn ghost wide" onClick={onRules}>
          Правила
        </button>
      </div>
    </section>
  )
}
