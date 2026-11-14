import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/unbounded/700.css'
import '@fontsource/unbounded/cyrillic-700.css'
import '@fontsource/manrope/500.css'
import '@fontsource/manrope/700.css'
import '@fontsource/manrope/cyrillic-500.css'
import '@fontsource/manrope/cyrillic-700.css'
import App from './App'
import './index.css'

// Убрать cache-bust от pull-to-refresh, чтобы URL не копил ?_r=
try {
  const url = new URL(window.location.href)
  if (url.searchParams.has('_r')) {
    url.searchParams.delete('_r')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }
} catch {
  // ignore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
