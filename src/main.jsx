import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Automatically check and activate newest service worker build without stale cache
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true)
  },
  onRegisteredSW(swUrl, registration) {
    if (registration) {
      registration.update()
      setInterval(() => {
        registration.update()
      }, 60 * 1000)
    }
  }
})

// Auto reload once when the service worker controlling the page updates
let refreshing = false
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true
      window.location.reload()
    }
  })
}

// Strictly block browser auto-translation across modern web browsers
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('lang', 'id')
  document.documentElement.setAttribute('translate', 'no')
  document.documentElement.classList.add('notranslate')
  if (document.body) {
    document.body.setAttribute('translate', 'no')
    document.body.classList.add('notranslate')
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

