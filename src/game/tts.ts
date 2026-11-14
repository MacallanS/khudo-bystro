import * as piper from '@mintplex-labs/piper-tts-web'
import type { Speed } from './types'

/**
 * Пауза ПОСЛЕ слова, пока рисуешь.
 */
export const GAP_MS: Record<Speed, number> = {
  slow: 3200,
  normal: 2000,
  chaos: 1100,
}

const PLAYBACK_RATE: Record<Speed, number> = {
  slow: 0.94,
  normal: 1.0,
  chaos: 1.12,
}

/** Piper Irina — самый «живой» RU-голос Piper (UTMOS выше Dmitri/Denis) */
const PIPER_VOICE = 'ru_RU-irina-medium' as const

let currentAudio: HTMLAudioElement | null = null
let unlocked = false
let piperReady = false
let piperProgress = 0
const cache = new Map<string, string>()

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function stopCurrent(): void {
  if (!currentAudio) return
  try {
    currentAudio.onended = null
    currentAudio.onerror = null
    currentAudio.pause()
    currentAudio.removeAttribute('src')
    currentAudio.load()
  } catch {
    // ignore
  }
  currentAudio = null
}

function localTtsUrl(word: string): string {
  return `/api/tts?q=${encodeURIComponent(word)}&voice=aidar`
}

function googleTtsUrl(word: string): string {
  return (
    `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ru` +
    `&q=${encodeURIComponent(word)}`
  )
}

async function fetchToObjectUrl(url: string): Promise<{ src: string; engine: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`tts ${res.status}`)
  const engine = res.headers.get('X-TTS-Engine') || 'proxy'
  const blob = await res.blob()
  if (!blob.size) throw new Error('tts empty')
  return { src: URL.createObjectURL(blob), engine }
}

async function ensurePiper(onProgress?: (pct: number) => void): Promise<void> {
  if (piperReady) return
  const stored = await piper.stored()
  if (!stored.includes(PIPER_VOICE)) {
    await piper.download(PIPER_VOICE, (p) => {
      if (p.total > 0) {
        piperProgress = Math.round((p.loaded * 100) / p.total)
        onProgress?.(piperProgress)
      }
    })
  }
  piperReady = true
  piperProgress = 100
}

async function synthesizePiper(word: string): Promise<string> {
  await ensurePiper()
  const blob = await piper.predict({
    text: word,
    voiceId: PIPER_VOICE,
  })
  return URL.createObjectURL(blob)
}

/**
 * Приоритет:
 * 1) Silero v5 (если `npm run tts` запущен) — лучший русский
 * 2) Piper WASM в браузере — отличный open-source нейроголос
 * 3) Google / native — запасной
 */
async function resolveAudioSrc(word: string): Promise<string> {
  const key = word.toLowerCase()
  const hit = cache.get(key)
  if (hit) return hit

  // Silero local server
  try {
    const { src, engine } = await fetchToObjectUrl(localTtsUrl(word))
    if (engine === 'silero') {
      cache.set(key, src)
      trimCache()
      return src
    }
    // google fallback from proxy — prefer Piper instead
    URL.revokeObjectURL(src)
  } catch {
    // silero/proxy down
  }

  // Piper in-browser
  try {
    const src = await synthesizePiper(word)
    cache.set(key, src)
    trimCache()
    return src
  } catch {
    // fall through
  }

  // last resort: google direct / proxy again
  try {
    const { src } = await fetchToObjectUrl(localTtsUrl(word))
    cache.set(key, src)
    trimCache()
    return src
  } catch {
    return googleTtsUrl(word)
  }
}

function trimCache(): void {
  if (cache.size <= 120) return
  const first = cache.keys().next().value
  if (!first) return
  const old = cache.get(first)
  if (old?.startsWith('blob:')) URL.revokeObjectURL(old)
  cache.delete(first)
}

function playSrc(src: string, speed: Speed): Promise<void> {
  return new Promise((resolve, reject) => {
    stopCurrent()
    const audio = new Audio()
    currentAudio = audio
    audio.preload = 'auto'
    audio.playbackRate = PLAYBACK_RATE[speed]
    audio.src = src

    let done = false
    const ok = () => {
      if (done) return
      done = true
      if (currentAudio === audio) currentAudio = null
      resolve()
    }
    const bad = (err?: unknown) => {
      if (done) return
      done = true
      if (currentAudio === audio) currentAudio = null
      reject(err ?? new Error('play failed'))
    }

    audio.onended = ok
    audio.onerror = () => bad(new Error('audio error'))
    void audio.play().catch(bad)
    window.setTimeout(ok, 8000)
  })
}

async function speakNative(word: string, speed: Speed): Promise<void> {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  await wait(40)
  await new Promise<void>((resolve) => {
    const utter = new SpeechSynthesisUtterance(word)
    utter.lang = 'ru-RU'
    utter.rate = PLAYBACK_RATE[speed]
    const voices = window.speechSynthesis.getVoices()
    const ru = voices.find((v) => v.lang.toLowerCase().startsWith('ru'))
    if (ru) utter.voice = ru
    utter.onend = () => resolve()
    utter.onerror = () => resolve()
    window.speechSynthesis.speak(utter)
    window.setTimeout(resolve, 4000)
  })
}

export async function warmUpVoices(): Promise<void> {
  if (typeof window === 'undefined') return
  window.speechSynthesis?.getVoices()
}

export function getPiperDownloadProgress(): number {
  return piperProgress
}

/** Вызывать из клика «Старт» — качает Piper-модель и разблокирует Audio */
export async function unlockSpeech(
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (typeof window === 'undefined') return

  try {
    const silent = new Audio(
      'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAbD5cq3bAAAAAAAAAAAAAAAAAAAA/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV',
    )
    silent.volume = 0.01
    await silent.play()
    silent.pause()
  } catch {
    // ignore
  }

  unlocked = true

  // прогрев: Piper (и Silero, если есть)
  try {
    await ensurePiper(onProgress)
  } catch {
    // continue
  }

  try {
    const src = await resolveAudioSrc('да')
    const a = new Audio(src)
    a.volume = 0.35
    await a.play()
    await new Promise<void>((r) => {
      a.onended = () => r()
      window.setTimeout(r, 2000)
    })
  } catch {
    // native later
  }
}

export async function speakWord(word: string, speed: Speed): Promise<void> {
  if (typeof window === 'undefined') return
  stopCurrent()

  try {
    const src = await resolveAudioSrc(word)
    await playSrc(src, speed)
  } catch {
    try {
      await playSrc(googleTtsUrl(word), speed)
    } catch {
      await speakNative(word, speed)
    }
  }
}

export async function prefetchWords(words: string[]): Promise<void> {
  if (!unlocked) return
  for (const w of words.slice(0, 6)) {
    try {
      await resolveAudioSrc(w)
    } catch {
      break
    }
  }
}

export function stopSpeaking(): void {
  stopCurrent()
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

export function pauseSpeaking(): void {
  try {
    currentAudio?.pause()
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) {
    window.speechSynthesis.pause()
  }
}

export function resumeSpeaking(): void {
  try {
    void currentAudio?.play()
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && window.speechSynthesis?.paused) {
    window.speechSynthesis.resume()
  }
}

export async function waitInterruptible(
  ms: number,
  opts: {
    isPaused: () => boolean
    isCancelled: () => boolean
    onTick?: (leftMs: number) => void
  },
): Promise<'done' | 'cancelled'> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (opts.isCancelled()) return 'cancelled'
    while (opts.isPaused()) {
      if (opts.isCancelled()) return 'cancelled'
      await wait(80)
    }
    if (opts.isCancelled()) return 'cancelled'
    const left = Math.max(0, end - Date.now())
    opts.onTick?.(left)
    await wait(Math.min(80, left || 80))
  }
  opts.onTick?.(0)
  return opts.isCancelled() ? 'cancelled' : 'done'
}

export { wait }
