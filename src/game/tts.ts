import * as piper from '@mintplex-labs/piper-tts-web'
import { getAudioContext, resumeSfx } from './sfx'
import type { Speed } from './types'

/**
 * Пауза ПОСЛЕ слова, пока рисуешь.
 */
export const GAP_MS: Record<Speed, number> = {
  slow: 2800,
  normal: 1700,
  fast: 1000,
  chaos: 1150, // ориентир для UI; в раунде берётся randomGap()
}

/** Случайная пауза в «Хаосе»: 0,8–1,5 с */
export function randomGap(): number {
  const min = 800
  const max = 1500
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
/** Короче на мобиле: 404/зависание SW не должны жечь 20 с на слово */
const SILERO_FETCH_MS = 5_000
const PIPER_READY_MS = 45_000

export type NarratorEngine = 'silero' | 'piper' | 'google' | 'native'
export type NarratorStatus = 'idle' | 'loading' | 'ready' | 'error'

let currentAudio: HTMLAudioElement | null = null
let currentSource: AudioBufferSourceNode | null = null
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
/** blob: URL — запасной HTMLAudio */
const cache = new Map<string, string>()
/** Сырые wav-байты для decode */
const arrayCache = new Map<string, ArrayBuffer>()
/** Декодированные буферы — основной путь на телефоне */
const bufferCache = new Map<string, AudioBuffer>()
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
  if (currentSource) {
    try {
      currentSource.onended = null
      currentSource.stop()
    } catch {
      // already stopped
    }
    try {
      currentSource.disconnect()
    } catch {
      // ignore
    }
    currentSource = null
  }
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
): Promise<{ src: string; engine: string; data: ArrayBuffer }> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`tts ${res.status}`)
  const engine =
    res.headers.get('X-TTS-Engine') || engineHint || 'proxy'
  const type = (res.headers.get('content-type') || '').toLowerCase()
  if (type.includes('text/html')) throw new Error('tts html')
  const data = await res.arrayBuffer()
  if (!data.byteLength) throw new Error('tts empty')
  // SPA fallback: HTML page masquerading as 200
  const head = new Uint8Array(data.slice(0, 16))
  const asText = String.fromCharCode(...head)
  if (/^\s*</.test(asText) || asText.includes('<!')) throw new Error('tts html')
  const blob = new Blob([data], { type: type || 'audio/wav' })
  return { src: URL.createObjectURL(blob), engine, data }
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
): Promise<{ src: string; engine: string; data: ArrayBuffer }> {
  const baked = bakedTtsUrl(word)
  try {
    if (signal) return await fetchToObjectUrl(baked, signal, 'silero')
    return await fetchWithTimeout(baked, SILERO_FETCH_MS, 'silero')
  } catch (first) {
    try {
      if (signal?.aborted) throw first
      return await fetchWithTimeout(baked, Math.min(SILERO_FETCH_MS, 3_000), 'silero')
    } catch {
      if (import.meta.env.PROD) throw first
      const got = await fetchToObjectUrl(localTtsUrl(word), signal)
      if (got.engine !== 'silero' && got.engine !== 'proxy') {
        URL.revokeObjectURL(got.src)
        throw new Error('not silero')
      }
      return { src: got.src, engine: 'silero', data: got.data }
    }
  }
}

async function decodeToBuffer(
  key: string,
  data: ArrayBuffer,
): Promise<AudioBuffer> {
  const hit = bufferCache.get(key)
  if (hit) return hit
  const ctx = getAudioContext()
  if (!ctx) throw new Error('no AudioContext')
  const copy = data.slice(0)
  const buf = await ctx.decodeAudioData(copy)
  bufferCache.set(key, buf)
  return buf
}

async function storeFetchedAudio(
  key: string,
  src: string,
  data: ArrayBuffer,
): Promise<string> {
  cache.set(key, src)
  arrayCache.set(key, data.slice(0))
  try {
    await decodeToBuffer(key, data)
  } catch {
    // decode позже в ensureDecoded / speak
  }
  trimCache()
  return src
}

async function ensureDecoded(key: string): Promise<AudioBuffer | null> {
  const hit = bufferCache.get(key)
  if (hit) return hit
  const data = arrayCache.get(key)
  if (data) {
    try {
      return await decodeToBuffer(key, data)
    } catch {
      return null
    }
  }
  const src = cache.get(key)
  if (!src) return null
  try {
    const res = await fetch(src)
    const ab = await res.arrayBuffer()
    arrayCache.set(key, ab.slice(0))
    return await decodeToBuffer(key, ab)
  } catch {
    return null
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

async function synthesizePiper(
  word: string,
): Promise<{ src: string; data: ArrayBuffer }> {
  await ensurePiper()
  const blob = await piper.predict({
    text: word,
    voiceId: PIPER_VOICE,
  })
  const data = await blob.arrayBuffer()
  return { src: URL.createObjectURL(blob), data }
}

async function probeBakedSilero(): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), SILERO_PROBE_MS)
    try {
      const got = await fetchToObjectUrl(
        bakedTtsUrl('кот'),
        ctrl.signal,
        'silero',
      )
      await storeFetchedAudio('кот', got.src, got.data)
      return got.src
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
    const got = await fetchToObjectUrl(localTtsUrl('кот'), ctrl.signal)
    if (got.engine !== 'silero') {
      URL.revokeObjectURL(got.src)
      return null
    }
    await storeFetchedAudio('кот', got.src, got.data)
    return got.src
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
  if (hit) {
    if (!bufferCache.has(key)) void ensureDecoded(key)
    return hit
  }

  if (engine === 'silero') {
    const got = await fetchSileroAudio(word)
    return storeFetchedAudio(key, got.src, got.data)
  }

  if (engine === 'piper') {
    const got = await synthesizePiper(word)
    return storeFetchedAudio(key, got.src, got.data)
  }

  try {
    const got = await fetchToObjectUrl(localTtsUrl(word))
    return storeFetchedAudio(key, got.src, got.data)
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
  // Раунд 40 слов × 2 (номер+слово) + запас — не выкидывать wav посреди диктанта
  while (cache.size > 400) {
    const first = cache.keys().next().value
    if (!first) break
    const old = cache.get(first)
    if (old?.startsWith('blob:')) URL.revokeObjectURL(old)
    cache.delete(first)
    arrayCache.delete(first)
    bufferCache.delete(first)
  }
}

/** Основной путь: Web Audio BufferSource — переживает countdown на телефоне. */
function playBuffer(
  buf: AudioBuffer,
  speed: Speed,
  gen: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    stopCurrent()
    if (gen !== speakGen) {
      resolve()
      return
    }
    const ctx = getAudioContext()
    if (!ctx) {
      reject(new Error('no AudioContext'))
      return
    }

    void (async () => {
      try {
        if (ctx.state === 'suspended') await ctx.resume()
      } catch {
        // ignore
      }
      if (gen !== speakGen) {
        resolve()
        return
      }

      const source = ctx.createBufferSource()
      const gain = ctx.createGain()
      source.buffer = buf
      source.playbackRate.value = PLAYBACK_RATE[speed]
      gain.gain.value = 1
      source.connect(gain)
      gain.connect(ctx.destination)
      currentSource = source

      let settled = false
      const settle = (err?: unknown) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        if (endCurrentPlay === release) endCurrentPlay = null
        if (currentSource === source) currentSource = null
        try {
          source.disconnect()
          gain.disconnect()
        } catch {
          // ignore
        }
        if (err && gen === speakGen) reject(err)
        else resolve()
      }
      const release = () => settle()
      endCurrentPlay = release

      const timer = window.setTimeout(() => settle(), 12_000)
      source.onended = () => settle()
      try {
        source.start(0)
      } catch (err) {
        settle(err)
      }
    })()
  })
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
      settle()
    }, 12000)

    audio.onended = () => settle()
    audio.onerror = () => settle(new Error('audio error'))
    void audio.play().catch(async (err) => {
      try {
        await resumeSfx()
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

/** Разблокировка Web Audio по жесту (клик «Начать») — HTMLAudio не нужен. */
export async function armNarrator(): Promise<void> {
  if (typeof window === 'undefined') return
  unlocked = true
  await resumeSfx()
  const ctx = getAudioContext()
  if (ctx) {
    try {
      // Тихий тик — context остаётся running после countdown
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      src.start(0)
    } catch {
      // ignore
    }
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
    // Context можно создать заранее; resume — на жесте «Начать»
    getAudioContext()
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
      const got = await withTimeout(synthesizePiper('кот'), 12_000)
      await storeFetchedAudio('кот', got.src, got.data)
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

    await resolveAudioSrc(text, 'speak')
    if (isStale(gen, opts)) return
    const buf = await ensureDecoded(text)
    if (isStale(gen, opts)) return
    if (buf) {
      await playBuffer(buf, speed, gen)
      return
    }
    const src = cache.get(text)
    if (!src) throw new Error('no audio')
    await playSrc(src, speed, gen)
  } catch (err) {
    if (isStale(gen, opts)) return
    if (
      stickyEngine &&
      (activeEngine === 'silero' || activeEngine === 'piper')
    ) {
      throw err instanceof Error ? err : new Error('speak failed')
    }
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

/** Fetch + decode всех фраз раунда до старта (мобильный Web Audio). */
export async function prefetchAndDecode(
  words: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (!unlocked && !activeEngine) return
  if (activeEngine === 'native') return
  getAudioContext()
  const total = words.length
  for (let i = 0; i < words.length; i++) {
    const raw = words[i]!
    const text = normalizeRuWord(raw) || raw.trim().toLowerCase()
    try {
      if (text) {
        await resolveAudioSrc(text, 'prefetch')
        await ensureDecoded(text)
      }
    } catch {
      // одно слово не валит весь прогрев
    }
    onProgress?.(i + 1, total)
  }
}

export async function prefetchWords(
  words: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  return prefetchAndDecode(words, onProgress)
}

/**
 * Дождаться AudioBuffer в кэше — без тишины перед озвучкой слота.
 */
export async function ensureReady(
  texts: string[],
  opts?: SpeakOpts,
): Promise<void> {
  if (typeof window === 'undefined') return
  if (!activeEngine) {
    try {
      await prepareNarrator()
    } catch {
      return
    }
  }
  if (activeEngine === 'native') return
  const gen = speakGen
  for (const raw of texts) {
    if (isStale(gen, opts)) return
    const text = normalizeRuWord(raw) || raw.trim()
    if (!text) continue
    try {
      if (!cache.has(text)) await resolveAudioSrc(text, 'speak')
      await ensureDecoded(text)
    } catch {
      // слово скажет speakWord / fallback
    }
  }
}

export function stopSpeaking(): void {
  speakGen += 1
  stopCurrent()
  cancelSystemVoice()
}

export function pauseSpeaking(): void {
  // Web Audio: пауза = стоп текущего source (повтор слота делает RoundScreen)
  stopCurrent()
  if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) {
    window.speechSynthesis.pause()
  }
}

export function resumeSpeaking(): void {
  void resumeSfx()
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
