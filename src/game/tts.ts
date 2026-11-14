import * as piper from '@mintplex-labs/piper-tts-web'
import type { Speed } from './types'

/**
 * Пауза ПОСЛЕ слова, пока рисуешь.
 */
export const GAP_MS: Record<Speed, number> = {
  slow: 3200,
  normal: 2000,
  fast: 1200,
  chaos: 1400, // ориентир для UI; в раунде берётся randomGap()
}

/** Случайная пауза в «Хаосе»: от 1 с до ~1,8 с */
export function randomGap(): number {
  const min = 1000
  const max = 1800
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** Речь всегда одна и та же — скорость режима только через GAP */
const PLAYBACK_RATE: Record<Speed, number> = {
  slow: 1.0,
  normal: 1.0,
  fast: 1.0,
  chaos: 1.0,
}

const PIPER_VOICE = 'ru_RU-irina-medium' as const
const SILERO_PROBE_MS = 900
const PIPER_READY_MS = 45_000

export type NarratorEngine = 'silero' | 'piper' | 'google' | 'native'
export type NarratorStatus = 'idle' | 'loading' | 'ready' | 'error'

let currentAudio: HTMLAudioElement | null = null
let endCurrentPlay: (() => void) | null = null
let speakGen = 0
let unlocked = false
let piperReady = false
let piperProgress = 0
let activeEngine: NarratorEngine | null = null
let narratorStatus: NarratorStatus = 'idle'
let preparePromise: Promise<NarratorEngine> | null = null
let speakChain: Promise<unknown> = Promise.resolve()
let prefetchChain: Promise<unknown> = Promise.resolve()
const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

export type SpeakOpts = {
  isCancelled?: () => boolean
}

function isStale(gen: number, opts?: SpeakOpts): boolean {
  return gen !== speakGen || !!opts?.isCancelled?.()
}

function cancelSystemVoice(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
}

/** Озвучка не ждёт prefetch — номер «один» не стоит в хвосте прогрева. */
function enqueueSpeak<T>(task: () => Promise<T>): Promise<T> {
  const run = speakChain.then(task, task)
  speakChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** Prefetch только когда speak-очередь свободна. */
function enqueuePrefetch<T>(task: () => Promise<T>): Promise<T> {
  const run = prefetchChain.then(
    async () => {
      await speakChain
      return task()
    },
    async () => {
      await speakChain
      return task()
    },
  )
  prefetchChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** Чистое русское слово для синтеза */
export function normalizeRuWord(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^а-яё\-\s]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stopCurrent(): void {
  const end = endCurrentPlay
  endCurrentPlay = null
  if (currentAudio) {
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
  end?.()
}

function localTtsUrl(word: string): string {
  return `/api/tts?q=${encodeURIComponent(word)}&voice=eugene&v=6`
}

async function fetchToObjectUrl(
  url: string,
  signal?: AbortSignal,
): Promise<{ src: string; engine: string }> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`tts ${res.status}`)
  const engine = res.headers.get('X-TTS-Engine') || 'proxy'
  const blob = await res.blob()
  if (!blob.size) throw new Error('tts empty')
  return { src: URL.createObjectURL(blob), engine }
}

async function ensurePiper(onProgress?: (pct: number) => void): Promise<void> {
  if (piperReady) {
    onProgress?.(100)
    return
  }
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
  onProgress?.(100)
}

async function synthesizePiper(word: string): Promise<string> {
  await ensurePiper()
  const blob = await piper.predict({
    text: word,
    voiceId: PIPER_VOICE,
  })
  return URL.createObjectURL(blob)
}

async function probeSilero(): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), SILERO_PROBE_MS)
  try {
    const { src, engine } = await fetchToObjectUrl(
      localTtsUrl('кот'),
      ctrl.signal,
    )
    if (engine !== 'silero') {
      URL.revokeObjectURL(src)
      return null
    }
    cache.set('кот', src)
    return src
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

async function resolveWithEngine(
  word: string,
  engine: NarratorEngine,
): Promise<string> {
  const key = word.toLowerCase()
  const hit = cache.get(key)
  if (hit) return hit

  if (engine === 'silero') {
    const { src, engine: got } = await fetchToObjectUrl(localTtsUrl(word))
    if (got !== 'silero') {
      URL.revokeObjectURL(src)
      throw new Error('not silero')
    }
    cache.set(key, src)
    trimCache()
    return src
  }

  if (engine === 'piper') {
    const src = await synthesizePiper(word)
    cache.set(key, src)
    trimCache()
    return src
  }

  // google через локальный proxy (dev); иначе URL часто 403 в Audio
  try {
    const { src } = await fetchToObjectUrl(localTtsUrl(word))
    cache.set(key, src)
    trimCache()
    return src
  } catch {
    throw new Error('google tts unavailable')
  }
}

async function resolveAudioSrc(
  word: string,
  priority: 'speak' | 'prefetch' = 'speak',
): Promise<string> {
  const normalized = normalizeRuWord(word) || word.trim().toLowerCase()
  const hit = cache.get(normalized)
  if (hit) return hit
  const pending = inflight.get(normalized)
  if (pending) return pending

  const enqueue = priority === 'speak' ? enqueueSpeak : enqueuePrefetch
  const job = enqueue(() => synthesizeQueued(normalized))
  inflight.set(normalized, job)
  try {
    return await job
  } finally {
    if (inflight.get(normalized) === job) inflight.delete(normalized)
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer = 0
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('timeout')), ms)
      }),
    ])
  } finally {
    window.clearTimeout(timer)
  }
}

async function synthesizeQueued(normalized: string): Promise<string> {
  const cached = cache.get(normalized)
  if (cached) return cached
  const engine = activeEngine ?? 'native'
  if (engine === 'native') {
    throw new Error('native has no audio src')
  }
  try {
    return await resolveWithEngine(normalized, engine)
  } catch {
    if (engine === 'silero') {
      try {
        await withTimeout(ensurePiper(), PIPER_READY_MS)
        activeEngine = 'piper'
        return await resolveWithEngine(normalized, 'piper')
      } catch {
        activeEngine = 'native'
        throw new Error('tts failed')
      }
    }
    if (engine === 'piper' || engine === 'google') {
      activeEngine = 'native'
      throw new Error('tts failed')
    }
    throw new Error('tts failed')
  }
}

function trimCache(): void {
  if (cache.size <= 200) return
  const first = cache.keys().next().value
  if (!first) return
  const old = cache.get(first)
  if (old?.startsWith('blob:')) URL.revokeObjectURL(old)
  cache.delete(first)
}

function playSrc(src: string, speed: Speed, gen: number): Promise<void> {
  return new Promise((resolve, reject) => {
    stopCurrent()
    cancelSystemVoice()
    if (gen !== speakGen) {
      resolve()
      return
    }

    const audio = new Audio()
    currentAudio = audio
    audio.preload = 'auto'
    audio.playbackRate = PLAYBACK_RATE[speed]
    audio.src = src

    let settled = false
    const settle = (err?: unknown) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      if (endCurrentPlay === release) endCurrentPlay = null
      if (currentAudio === audio) currentAudio = null
      if (err && gen === speakGen) reject(err)
      else resolve()
    }
    const release = () => settle()
    endCurrentPlay = release

    const timer = window.setTimeout(() => {
      try {
        audio.onended = null
        audio.onerror = null
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
      } catch {
        // ignore
      }
      settle()
    }, 12000)

    audio.onended = () => settle()
    audio.onerror = () => settle(new Error('audio error'))
    void audio.play().catch((err) => settle(err))
  })
}

async function speakNative(
  word: string,
  speed: Speed,
  gen: number,
): Promise<void> {
  if (!window.speechSynthesis) return
  if (gen !== speakGen) return
  window.speechSynthesis.cancel()
  await wait(40)
  if (gen !== speakGen) return
  await new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve()
    }
    const utter = new SpeechSynthesisUtterance(word)
    utter.lang = 'ru-RU'
    utter.rate = PLAYBACK_RATE[speed]
    const voices = window.speechSynthesis.getVoices()
    const ru = voices.find((v) => v.lang.toLowerCase().startsWith('ru'))
    if (ru) utter.voice = ru
    utter.onend = finish
    utter.onerror = finish
    const timer = window.setTimeout(() => {
      window.speechSynthesis?.cancel()
      finish()
    }, 8000)
    window.speechSynthesis.speak(utter)
  })
}

export async function warmUpVoices(): Promise<void> {
  if (typeof window === 'undefined') return
  window.speechSynthesis?.getVoices()
}

export function getPiperDownloadProgress(): number {
  return piperProgress
}

export function getActiveEngine(): NarratorEngine | null {
  return activeEngine
}

export function getNarratorStatus(): NarratorStatus {
  return narratorStatus
}

async function silentUnlock(): Promise<void> {
  try {
    const silent = new Audio(
      'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAbD5cq3bAAAAAAAAAAAAAAAAAAAA/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV',
    )
    silent.volume = 0.01
    currentAudio = silent
    await silent.play()
    silent.pause()
    if (currentAudio === silent) currentAudio = null
  } catch {
    // ignore
  }
}

/** Разблокировка Audio / speechSynthesis по жесту пользователя (клик «Начать»). */
export async function armNarrator(): Promise<void> {
  if (typeof window === 'undefined') return
  await silentUnlock()
  unlocked = true
  try {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(' ')
    utter.volume = 0
    utter.rate = 2
    utter.lang = 'ru-RU'
    window.speechSynthesis.speak(utter)
    window.speechSynthesis.cancel()
  } catch {
    // ignore
  }
}

/**
 * Прогрев без слышимой речи.
 * Silero (локальный /api/tts) → Piper (браузер) → native (speechSynthesis).
 */
export async function prepareNarrator(
  onProgress?: (pct: number) => void,
): Promise<NarratorEngine> {
  if (typeof window === 'undefined') return 'native'
  if (activeEngine && narratorStatus === 'ready') {
    onProgress?.(100)
    return activeEngine
  }
  if (preparePromise) return preparePromise

  narratorStatus = 'loading'
  preparePromise = (async () => {
    await silentUnlock()
    unlocked = true
    onProgress?.(10)

    const sileroOk = await probeSilero()
    if (sileroOk) {
      activeEngine = 'silero'
      onProgress?.(100)
      narratorStatus = 'ready'
      return 'silero'
    }

    onProgress?.(15)
    try {
      await withTimeout(ensurePiper(onProgress), PIPER_READY_MS)
      const src = await withTimeout(synthesizePiper('кот'), 12_000)
      cache.set('кот', src)
      activeEngine = 'piper'
      narratorStatus = 'ready'
      onProgress?.(100)
      return 'piper'
    } catch {
      // Google Translate TTS с github.io почти всегда 403 — системный RU-голос надёжнее
      activeEngine = 'native'
      narratorStatus = 'ready'
      onProgress?.(100)
      return 'native'
    }
  })()

  try {
    return await preparePromise
  } catch (e) {
    narratorStatus = 'error'
    preparePromise = null
    throw e
  }
}

/** @deprecated use prepareNarrator — без audible прогрева */
export async function unlockSpeech(
  onProgress?: (pct: number) => void,
): Promise<void> {
  await prepareNarrator(onProgress)
}

export async function speakWord(
  word: string,
  speed: Speed,
  opts?: SpeakOpts,
): Promise<void> {
  if (typeof window === 'undefined') return
  const gen = speakGen
  if (isStale(gen, opts)) return
  stopCurrent()
  cancelSystemVoice()
  const text = normalizeRuWord(word) || word.trim()
  if (!text || isStale(gen, opts)) return

  try {
    if (!activeEngine) await prepareNarrator()
    if (isStale(gen, opts)) return

    if (activeEngine === 'native') {
      await speakNative(text, speed, gen)
      return
    }

    const src = await resolveAudioSrc(text, 'speak')
    if (isStale(gen, opts)) return
    await playSrc(src, speed, gen)
  } catch {
    if (isStale(gen, opts)) return
    try {
      await speakNative(text, speed, gen)
    } catch {
      // ignore
    }
  }
}

export async function prefetchWords(words: string[]): Promise<void> {
  if (!unlocked && !activeEngine) return
  if (activeEngine === 'native') return
  for (const w of words) {
    try {
      await resolveAudioSrc(w, 'prefetch')
    } catch {
      break
    }
  }
}

export function stopSpeaking(): void {
  speakGen += 1
  stopCurrent()
  cancelSystemVoice()
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
