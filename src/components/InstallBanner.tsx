import { useEffect, useState } from 'react'
import {
  canInstall,
  isIos,
  isStandalone,
  promptInstall,
  subscribeInstall,
} from '../pwa/install'

export function InstallBanner() {
  const [ready, setReady] = useState(canInstall())
  const [dismissed, setDismissed] = useState(() =>
    sessionStorage.getItem('khudo-install-dismiss') === '1',
  )
  const ios = isIos()
  const standalone = isStandalone()

  useEffect(() => subscribeInstall(() => setReady(canInstall())), [])

  if (standalone || dismissed) return null
  if (!ready && !ios) return null

  return (
    <div className="install-banner">
      <div>
        <strong>На домашний экран</strong>
        <p>
          {ios
            ? 'Поделиться → «На экран Домой» — игра без браузерной рамки и офлайн.'
            : 'Поставь PWA: быстрее старт, офлайн за столом.'}
        </p>
      </div>
      <div className="install-actions">
        {ready && (
          <button
            type="button"
            className="btn small"
            onClick={() => void promptInstall()}
          >
            Установить
          </button>
        )}
        <button
          type="button"
          className="btn ghost small"
          onClick={() => {
            sessionStorage.setItem('khudo-install-dismiss', '1')
            setDismissed(true)
          }}
        >
          Позже
        </button>
      </div>
    </div>
  )
}
