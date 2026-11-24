import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// ─── Service worker (offline cache + updates) ───────────────────────────────
// - Registered only after the page has loaded, so installing the offline cache
//   never competes with the first screen and the login on a slow connection.
// - A new version is applied (page reload) only on "safe" pages. Never inside
//   an exam or survey: reloading the exam room marks the student as Returnee
//   and locks them out until a proctor gives a token.
const UPDATE_CHECK_MS = 30 * 60 * 1000
const isSafeToReload = () => !/\/(exam|survey)\//.test(window.location.pathname)

function startServiceWorker() {
  let updatePending = false
  let applying = false

  const updateSW = registerSW({
    onNeedRefresh() {
      updatePending = true
      applyUpdateWhenSafe()
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) return
      setInterval(() => {
        if (navigator.onLine === false || !isSafeToReload()) return
        registration.update().catch(() => {})
      }, UPDATE_CHECK_MS)
    },
  })

  function applyUpdateWhenSafe() {
    if (!updatePending || applying || !isSafeToReload()) return
    applying = true
    updateSW(true) // activates the new version, then reloads once
  }

  // In-app navigation fires no reliable event; a cheap local check is enough
  setInterval(applyUpdateWhenSafe, 15000)
  window.addEventListener('popstate', applyUpdateWhenSafe)
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const start = () => setTimeout(startServiceWorker, 3000)
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
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

