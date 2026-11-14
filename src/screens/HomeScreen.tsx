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
      <div className="home-visual" aria-hidden>
        <svg viewBox="0 0 360 220" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="360" height="220" fill="#fffdf8" />
          {/* marker scribble — рисунок за столом */}
          <path
            d="M48 168c28-42 54-70 86-78 28-7 48 8 62 34 12 22 34 40 62 36"
            stroke="#1f5eff"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M92 52c18 8 34 28 40 52"
            stroke="#182033"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="250" cy="64" r="28" stroke="#182033" strokeWidth="3.5" />
          <path
            d="M236 64h28M250 50v28"
            stroke="#1f5eff"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M70 190h220"
            stroke="#182033"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.35"
          />
          <text
            x="28"
            y="36"
            fill="#0f2f6d"
            fontFamily="Unbounded, sans-serif"
            fontSize="14"
            fontWeight="700"
          >
            лист 1
          </text>
        </svg>
      </div>

      <div className="home-copy">
        <p className="eyebrow">игра для компании</p>
        <h1 className="brand">
          Худо
          <span>Быстро</span>
        </h1>
        <p className="lede">
          Диктор сыплет слова — ты рисуешь. Потом стол вспоминает, что было на
          листах.
        </p>
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
