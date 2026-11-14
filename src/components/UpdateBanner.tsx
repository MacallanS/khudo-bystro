import { useRegisterSW } from 'virtual:pwa-register/react'

const CHECK_MS = 120_000
const RELOAD_GUARD_KEY = 'khudo-sw-reload-at'

/**
 * Тихое автообновление PWA.
 * Не дергаем update() на каждый focus — вместе с pull-to-refresh это давало
 * бесконечные reload на телефоне.
 */
export function UpdateBanner() {
  useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const check = () => {
        // Не чаще раза в несколько секунд — защита от update-шторма
        const now = Date.now()
        const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0)
        if (now - last < 8_000) return
        void registration.update().catch(() => {})
      }

      window.setInterval(check, CHECK_MS)
    },
    onNeedRefresh() {
      const now = Date.now()
      const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0)
      if (now - last < 8_000) return
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(now))
    },
  })

  return null
}
