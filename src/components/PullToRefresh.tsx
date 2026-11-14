import { useEffect, useRef, useState, type CSSProperties } from 'react'

const THRESHOLD = 72
const MAX_PULL = 120
const RELOAD_GUARD_KEY = 'khudo-ptr-reload-at'

function atScrollTop(): boolean {
  return (window.scrollY || document.documentElement.scrollTop || 0) <= 0
}

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      '.canvas-wrap, .draw-canvas, [data-no-ptr], input, textarea, select',
    ),
  )
}

/** Жёсткий reload без ожидания SW.update() — на мобиле update() часто зависает. */
function reloadApp(): void {
  const now = Date.now()
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0)
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(now))

  // Сохранить партию до ухода
  try {
    window.dispatchEvent(new Event('pagehide'))
  } catch {
    // ignore
  }

  // Фоном пнуть SW, но не ждать — иначе спиннер бесконечный
  if (now - last > 4000) {
    try {
      void navigator.serviceWorker?.getRegistration().then((reg) => {
        void reg?.update().catch(() => undefined)
      })
    } catch {
      // ignore
    }
  }

  // cache-bust на случай залипшего SW-документа
  const url = new URL(window.location.href)
  url.searchParams.set('_r', String(now))
  window.location.replace(url.toString())
}

/** Pull-down refresh — только анимация, без подписей. */
export function PullToRefresh() {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const tracking = useRef(false)
  const pullRef = useRef(0)
  const firedRef = useRef(false)

  useEffect(() => {
    pullRef.current = pull
  }, [pull])

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (refreshing || firedRef.current) return
      if (!atScrollTop()) return
      if (shouldIgnoreTarget(e.target)) return
      if (e.touches.length !== 1) return
      tracking.current = true
      startY.current = e.touches[0].clientY
    }

    const onMove = (e: TouchEvent) => {
      if (!tracking.current || refreshing || firedRef.current) return
      if (!atScrollTop()) {
        tracking.current = false
        setPull(0)
        return
      }
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) {
        setPull(0)
        return
      }
      if (e.cancelable) e.preventDefault()
      setPull(Math.min(MAX_PULL, dy * 0.55))
    }

    const onEnd = () => {
      if (!tracking.current) return
      tracking.current = false
      const amount = pullRef.current
      if (amount < THRESHOLD || refreshing || firedRef.current) {
        setPull(0)
        return
      }
      firedRef.current = true
      setPull(THRESHOLD)
      setRefreshing(true)
      // Микротаск — чтобы спиннер успел отрисоваться, потом сразу reload
      window.setTimeout(() => reloadApp(), 80)
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)

    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [refreshing])

  const visible = pull > 4 || refreshing
  const progress = Math.min(1, pull / THRESHOLD)
  const rotate = refreshing ? undefined : progress * 270

  return (
    <div
      className={`ptr-indicator ${visible ? 'is-visible' : ''} ${
        refreshing ? 'is-refreshing' : ''
      }`}
      style={
        {
          '--ptr-y': `${Math.max(pull * 0.55, refreshing ? 28 : 0)}px`,
          '--ptr-scale': refreshing ? 1 : Math.max(0.35, progress),
          '--ptr-rotate': refreshing ? '0deg' : `${rotate}deg`,
          '--ptr-progress': String(progress),
        } as CSSProperties
      }
      aria-hidden
    >
      <span className={`ptr-spinner ${refreshing ? 'is-spin' : ''}`} />
    </div>
  )
}
