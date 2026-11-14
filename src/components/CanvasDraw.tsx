import { useEffect, useRef } from 'react'

type Props = {
  onChange: (dataUrl: string | undefined) => void
  disabled?: boolean
}

export function CanvasDraw({ onChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasMarks = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const paintBlank = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#fffdf8'
      ctx.fillRect(0, 0, w, h)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#182033'
      ctx.lineWidth = 3.5
    }

    const resize = () => {
      const rect = parent.getBoundingClientRect()
      const w = Math.max(Math.floor(rect.width), 1)
      const h = Math.max(Math.floor(rect.height), 1)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      paintBlank(ctx, w, h)
      hasMarks.current = false
      onChangeRef.current(undefined)
    }

    resize()
    const ro = new ResizeObserver(() => {
      if (hasMarks.current) return
      resize()
    })
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const emit = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    onChange(canvas.toDataURL('image/jpeg', 0.55))
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.setPointerCapture(e.pointerId)
    drawing.current = true
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, y)
    hasMarks.current = true
  }

  const onPointerUp = () => {
    if (!drawing.current) return
    drawing.current = false
    if (hasMarks.current) emit()
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#f7f1e8'
    ctx.fillRect(0, 0, rect.width, rect.height)
    hasMarks.current = false
    onChange(undefined)
  }

  return (
    <div className="canvas-wrap">
      <canvas
        ref={canvasRef}
        className="draw-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <button type="button" className="btn ghost canvas-clear" onClick={clear} disabled={disabled}>
        Стереть
      </button>
    </div>
  )
}
