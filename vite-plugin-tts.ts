import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

const SILERO = 'http://127.0.0.1:9899/tts'
const DEFAULT_VOICE = 'aidar'

async function fetchUpstream(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      Accept: '*/*',
    },
  })
}

async function handleTts(
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) {
  if (!req.url?.startsWith('/api/tts')) return next()
  try {
    const url = new URL(req.url, 'http://localhost')
    const q = (url.searchParams.get('q') || '').trim()
    const voice = (url.searchParams.get('voice') || DEFAULT_VOICE).trim()
    if (!q || q.length > 80) {
      res.statusCode = 400
      res.end('bad q')
      return
    }

    // 1) Silero v5 — живой open-source диктор
    try {
      const sileroUrl =
        `${SILERO}?q=${encodeURIComponent(q)}&voice=${encodeURIComponent(voice)}`
      const r = await fetchUpstream(sileroUrl)
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 200) {
          res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/wav')
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('X-TTS-Engine', 'silero')
          res.statusCode = 200
          res.end(buf)
          return
        }
      }
    } catch {
      // silero down → fallback
    }

    // 2) Google Translate TTS — запасной
    const google =
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ru` +
      `&q=${encodeURIComponent(q)}`
    const r = await fetchUpstream(google)
    if (!r.ok) {
      res.statusCode = 502
      res.end(
        `tts unavailable (silero offline + google ${r.status}). Run: npm run tts`,
      )
      return
    }

    const buf = Buffer.from(await r.arrayBuffer())
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('X-TTS-Engine', 'google')
    res.statusCode = 200
    res.end(buf)
  } catch (e) {
    res.statusCode = 500
    res.end(String(e))
  }
}

function attach(server: ViteDevServer | PreviewServer) {
  server.middlewares.use((req, res, next) => {
    void handleTts(req, res, next)
  })
}

/** /api/tts → Silero (локально) → Google fallback */
export function ttsProxyPlugin(): Plugin {
  return {
    name: 'khudo-tts-proxy',
    configureServer(server) {
      attach(server)
    },
    configurePreviewServer(server) {
      attach(server)
    },
  }
}
