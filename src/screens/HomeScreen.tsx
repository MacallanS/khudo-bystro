type Props = {
  onPlay: () => void
  onRules: () => void
  onContinue?: () => void
  continueLabel?: string
}

const logoSrc = `${import.meta.env.BASE_URL}logo-home.png`

export function HomeScreen({
  onPlay,
  onRules,
  onContinue,
  continueLabel,
}: Props) {
  return (
    <section className="screen home">
      <div className="home-visual" aria-hidden>
        <p className="home-visual-label">лист 1</p>
        <img
          className="home-logo"
          src={logoSrc}
          alt=""
          width={1024}
          height={1024}
          decoding="async"
        />
      </div>

      <div className="home-copy">
        <p className="eyebrow">игра для компании</p>
        <h1 className="brand">
          Худо
          <span>Быстро</span>
        </h1>
        <div className="cta-stack">
          {onContinue && (
            <button
              type="button"
              className="btn primary wide"
              onClick={onContinue}
            >
              {continueLabel || 'Продолжить партию'}
            </button>
          )}
          <button
            type="button"
            className={onContinue ? 'btn ghost wide' : 'btn primary wide'}
            onClick={onPlay}
          >
            {onContinue ? 'Новая партия' : 'Играть'}
          </button>
          <button type="button" className="btn ghost wide" onClick={onRules}>
            Правила
          </button>
        </div>
      </div>
    </section>
  )
}
