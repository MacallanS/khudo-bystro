type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

export function initInstallCapture(): () => void {
  const onBip = (e: Event) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  }
  window.addEventListener('beforeinstallprompt', onBip)
  return () => window.removeEventListener('beforeinstallprompt', onBip)
}

export function canInstall(): boolean {
  return deferred != null
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // @ts-expect-error iOS Safari
    window.navigator.standalone === true
  )
}

export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const choice = await deferred.userChoice
  deferred = null
  listeners.forEach((l) => l())
  return choice.outcome === 'accepted'
}
