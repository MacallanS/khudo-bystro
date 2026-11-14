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
/** На мобильном github.io 900 ms часто не хватает → ложный fallback на native. */
const SILERO_PROBE_MS = 6_000
const SILERO_FETCH_MS = 10_000
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
/** Не скатываемся на системный голос из‑за одного битого файла — движок «липкий». */
let stickyEngine = false

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

/** Ключ файла = normalizeRuWord + пробелы → `_` (как в tts-server/bake.py). */
function bakedSlug(word: string): string {
  const key = normalizeRuWord(word) || word.trim().toLowerCase()
  return key.replace(/\s+/g, '_')
}

function bakedTtsUrl(word: string): string {
  const slug = bakedSlug(word)
  const base = import.meta.env.BASE_URL || '/'
  return `${base}tts/eugene/${encodeURIComponent(slug)}.wav`
}

async function fetchToObjectUrl(
  url: string,
  signal?: AbortSignal,
  engineHint?: string,
): Promise<{ src: string; engine: string }> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`tts ${res.status}`)
  const engine =
    res.headers.get('X-TTS-Engine') || engineHint || 'proxy'
  const blob = await res.blob()
  if (!blob.size) throw new Error('tts empty')
  // SPA fallback sometimes returns HTML for missing files
  const type = (res.headers.get('content-type') || blob.type || '').toLowerCase()
  if (type.includes('text/html')) throw new Error('tts html')
  return { src: URL.createObjectURL(blob), engine }
}

async function fetchWithTimeout(
  url: string,
  ms: number,
  engineHint?: string,
): Promise<{ src: string; engine: string }> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetchToObjectUrl(url, ctrl.signal, engineHint)
  } finally {
    window.clearTimeout(timer)
  }
}

async function fetchSileroAudio(
  word: string,
  signal?: AbortSignal,
): Promise<{ src: string; engine: string }> {
  const baked = bakedTtsUrl(word)
  try {
    if (signal) return await fetchToObjectUrl(baked, signal, 'silero')
    return await fetchWithTimeout(baked, SILERO_FETCH_MS, 'silero')
  } catch (first) {
    // Повтор: мобильный CDN иногда рвёт первый запрос.
    try {
      if (signal?.aborted) throw first
      return await fetchWithTimeout(baked, SILERO_FETCH_MS, 'silero')
    } catch {
      // Локальный /api/tts только в dev — на Pages его нет, не тратим время.
      if (import.meta.env.PROD) throw first
      const { src, engine } = await fetchToObjectUrl(localTtsUrl(word), signal)
      if (engine !== 'silero' && engine !== 'proxy') {
        URL.revokeObjectURL(src)
        throw new Error('not silero')
      }
      return { src, engine: 'silero' }
    }
  }
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

async function probeBakedSilero(): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), SILERO_PROBE_MS)
    try {
      const { src } = await fetchToObjectUrl(
        bakedTtsUrl('кот'),
        ctrl.signal,
        'silero',
      )
      cache.set('кот', src)
      return src
    } catch {
      await wait(200 + attempt * 300)
    } finally {
      window.clearTimeout(timer)
    }
  }
  return null
}

async function probeSilero(): Promise<string | null> {
  const baked = await probeBakedSilero()
  if (baked) return baked
  if (import.meta.env.PROD) return null

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
    const { src } = await fetchSileroAudio(word)
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
    // Повтор тем же движком — не скачиваем Piper и не прыгаем на native посреди раунда.
    try {
      return await resolveWithEngine(normalized, engine)
    } catch {
      // Piper только если уже прогрет (иначе минуты тишины на мобильном).
      if (engine === 'silero' && piperReady && !stickyEngine) {
        try {
          return await resolveWithEngine(normalized, 'piper')
        } catch {
          throw new Error('tts failed')
        }
      }
      throw new Error('tts failed')
    }
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
      // Таймаут без ошибки: слово «проглотили», раунд не рвём native-кашей
      settle()
    }, 12000)

    audio.onended = () => settle()
    audio.onerror = () => settle(new Error('audio error'))
    void audio.play().catch(async (err) => {
      // Автоплей после свёртки вкладки — ещё одна разблокировка
      try {
        await silentUnlock()
        if (gen !== speakGen) {
          settle()
          return
        }
        await audio.play()
      } catch {
        settle(err)
      }
    })
  })
}

function pickRuVoice(): SpeechSynthesisVoice | null {
  if (!window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith('ru')) ||
    voices.find((v) => /russian|русск/i.test(v.name)) ||
    null
  )
}

export function hasRuVoice(): boolean {
  return !!pickRuVoice()
}

async function waitForVoices(ms = 1500): Promise<void> {
  if (!window.speechSynthesis) return
  if (window.speechSynthesis.getVoices().length) return
  await new Promise<void>((resolve) => {
    const done = () => {
      window.clearTimeout(timer)
      window.speechSynthesis?.removeEventListener('voiceschanged', onChange)
      resolve()
    }
    const onChange = () => done()
    const timer = window.setTimeout(done, ms)
    window.speechSynthesis.addEventListener('voiceschanged', onChange)
    // kick Chrome
    window.speechSynthesis.getVoices()
  })
}

/**
 * Системный TTS — запасной вариант. Без RU-голоса не вызываем:
 * иначе Android/Chrome читает кириллицу «бредом» или глохнет после 1-го слова.
 */
async function speakNative(
  word: string,
  speed: Speed,
  gen: number,
): Promise<void> {
  if (!window.speechSynthesis) throw new Error('no speechSynthesis')
  if (gen !== speakGen) return
  await waitForVoices()
  const ru = pickRuVoice()
  if (!ru) throw new Error('no ru voice')

  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    window.speechSynthesis.cancel()
    // Chrome: сразу после cancel следующее speak часто пустое
    await wait(120)
  }
  if (gen !== speakGen) return

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      window.clearInterval(keepAlive)
      if (err) reject(err)
      else resolve()
    }
    const utter = new SpeechSynthesisUtterance(word)
    utter.lang = ru.lang || 'ru-RU'
    utter.voice = ru
    utter.rate = PLAYBACK_RATE[speed]
    utter.onend = () => finish()
    utter.onerror = () => finish(new Error('native speak error'))
    // Chrome иногда «засыпает» на длинных очередях
    const keepAlive = window.setInterval(() => {
      if (!window.speechSynthesis?.speaking) return
      try {
        window.speechSynthesis.pause()
        window.speechSynthesis.resume()
      } catch {
        // ignore
      }
    }, 8_000)
    const timer = window.setTimeout(() => {
      window.speechSynthesis?.cancel()
      finish(new Error('native timeout'))
    }, 8_000)
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
    await waitForVoices()
    onProgress?.(10)

    const sileroOk = await probeSilero()
    if (sileroOk) {
      activeEngine = 'silero'
      stickyEngine = true
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
      stickyEngine = true
      piperReady = true
      narratorStatus = 'ready'
      onProgress?.(100)
      return 'piper'
    } catch {
      // Без русского системного голоса native = тишина/каша — лучше явная ошибка на Ready.
      await waitForVoices()
      if (!hasRuVoice()) {
        throw new Error('no reliable narrator')
      }
      activeEngine = 'native'
      stickyEngine = true
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
    stickyEngine = false
    activeEngine = null
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
  // Не трогаем speechSynthesis, если играем wav — cancel() в Chrome ломает следующий native.
  if (activeEngine === 'native') cancelSystemVoice()
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
  } catch (err) {
    if (isStale(gen, opts)) return
    // Fallback на native только с RU-голосом — иначе «бред» хуже явной ошибки.
    if (hasRuVoice()) {
      try {
        await speakNative(text, speed, gen)
        return
      } catch {
        // fall through
      }
    }
    throw err instanceof Error ? err : new Error('speak failed')
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
  let remaining = Math.max(0, ms)
  opts.onTick?.(remaining)
  while (remaining > 0) {
    if (opts.isCancelled()) return 'cancelled'
    if (opts.isPaused()) {
      // Пауза замораживает таймер — время не сгорает
      await wait(80)
      continue
    }
    const slice = Math.min(80, remaining)
    await wait(slice)
    remaining -= slice
    opts.onTick?.(Math.max(0, remaining))
  }
  opts.onTick?.(0)
  return opts.isCancelled() ? 'cancelled' : 'done'
}

export { wait }
