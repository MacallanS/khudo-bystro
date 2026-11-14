import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const CHECK_MS = 60_000

export function UpdateBanner() {
  const [dismissed, setDismissed] = useState(false)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const check = () => {
        void registration.update().catch(() => {})
      }

      window.setInterval(check, CHECK_MS)
      const onVisible = () => {
        if (document.visibilityState === 'visible') check()
      }
      document.addEventListener('visibilitychange', onVisible)
      window.addEventListener('focus', check)
    },
  })

  useEffect(() => {
    if (needRefresh) setDismissed(false)
  }, [needRefresh])

  if (!needRefresh || dismissed) return null

  return (
    <div className="install-banner">
      <div>
        <strong>Доступна новая версия</strong>
        <p>Обнови, чтобы получить свежие правила и фиксы. Игра перезагрузится.</p>
      </div>
      <div className="install-actions">
        <button
          type="button"
          className="btn small"
          onClick={() => void updateServiceWorker(true)}
        >
          Обновить
        </button>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => {
            setDismissed(true)
            setNeedRefresh(false)
          }}
        >
          Позже
        </button>
      </div>
    </div>
  )
}
