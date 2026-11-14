import { useRegisterSW } from 'virtual:pwa-register/react'

const CHECK_MS = 60_000

/** Silent PWA auto-update: no banner, activate + reload when a new SW is ready. */
export function UpdateBanner() {
  useRegisterSW({
    immediate: true,
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

  return null
}
