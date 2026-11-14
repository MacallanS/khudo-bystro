/** Короткие звуковые индикаторы через Web Audio (без файлов). */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

export async function resumeSfx(): Promise<void> {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') {
    try {
      await c.resume()
    } catch {
      // ignore
    }
  }
}

function tone(
  freq: number,
  durationSec: number,
  opts?: { type?: OscillatorType; gain?: number; slideTo?: number },
): void {
  const c = getCtx()
  if (!c) return
  const now = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = opts?.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, now)
  if (opts?.slideTo != null) {
    osc.frequency.linearRampToValueAtTime(opts.slideTo, now + durationSec)
  }
  const g = opts?.gain ?? 0.12
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(g, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(now)
  osc.stop(now + durationSec + 0.02)
}

/** Диктор готов */
export function beepReady(): void {
  tone(880, 0.12, { gain: 0.1 })
  window.setTimeout(() => tone(1175, 0.14, { gain: 0.1 }), 90)
}

/** Цифра countdown: 3 / 2 / 1 */
export function beepCount(n: number): void {
  const freq = n >= 3 ? 440 : n === 2 ? 523 : 659
  tone(freq, 0.16, { type: 'triangle', gain: 0.14 })
}

/** Старт диктанта */
export function beepGo(): void {
  tone(523, 0.22, { type: 'triangle', gain: 0.16, slideTo: 784 })
}
