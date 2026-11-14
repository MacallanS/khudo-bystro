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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
