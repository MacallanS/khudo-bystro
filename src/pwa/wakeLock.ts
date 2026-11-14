let wakeLock: WakeLockSentinel | null = null

export async function requestWakeLock(): Promise<void> {
  try {
    if (!('wakeLock' in navigator)) return
    wakeLock = await navigator.wakeLock.request('screen')
    wakeLock.addEventListener('release', () => {
      wakeLock = null
    })
  } catch {
    // unsupported / denied
  }
}

export async function releaseWakeLock(): Promise<void> {
  try {
    await wakeLock?.release()
  } catch {
    // ignore
  } finally {
    wakeLock = null
  }
}

export function bindWakeLockOnVisible(): () => void {
  const onVis = () => {
    if (document.visibilityState === 'visible') {
      void requestWakeLock()
    }
  }
  document.addEventListener('visibilitychange', onVis)
  return () => document.removeEventListener('visibilitychange', onVis)
}
