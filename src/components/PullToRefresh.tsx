import { useEffect, useRef, useState, type CSSProperties } from 'react'

const THRESHOLD = 72
const MAX_PULL = 120

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

async function reloadApp(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations()
    if (regs?.length) {
      await Promise.all(regs.map((r) => r.update().catch(() => undefined)))
    }
  } catch {
    // ignore
  }
  window.location.reload()
}

/** Pull-down refresh like mobile browser — works in standalone PWA. */
export function PullToRefresh() {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const tracking = useRef(false)
  const pullRef = useRef(0)

  useEffect(() => {
    pullRef.current = pull
  }, [pull])

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (refreshing) return
      if (!atScrollTop()) return
      if (shouldIgnoreTarget(e.target)) return
      if (e.touches.length !== 1) return
      tracking.current = true
      startY.current = e.touches[0].clientY
    }

    const onMove = (e: TouchEvent) => {
      if (!tracking.current || refreshing) return
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
      // Не даём странице «резиниться» во время жеста
      if (e.cancelable) e.preventDefault()
      const next = Math.min(MAX_PULL, dy * 0.55)
      setPull(next)
    }

    const onEnd = () => {
      if (!tracking.current) return
      tracking.current = false
      const amount = pullRef.current
      setPull(0)
      if (amount < THRESHOLD || refreshing) return
      setRefreshing(true)
      void reloadApp()
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

  const visible = pull > 8 || refreshing
  const ready = pull >= THRESHOLD
  const label = refreshing
    ? 'Обновляем…'
    : ready
      ? 'Отпусти — обновить'
      : 'Тяни вниз — обновить'

  return (
    <div
      className={`ptr-indicator ${visible ? 'is-visible' : ''} ${
        ready || refreshing ? 'is-ready' : ''
      }`}
      style={{ '--ptr-pull': `${pull}px` } as CSSProperties}
      aria-hidden={!visible}
    >
      <span className={`ptr-spinner ${refreshing ? 'is-spin' : ''}`} />
      <span className="ptr-label">{label}</span>
    </div>
  )
}
