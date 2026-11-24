import { lazy } from 'react'
import { isOffline, waitForOnline } from './network.js'

const RELOAD_MARK = 'binar_chunk_reload_at'

/**
 * React.lazy() that survives a weak connection.
 *
 * Each page is downloaded on first use. On a flaky link that download can fail
 * ("Failed to fetch dynamically imported module"), and right after a new
 * deployment an old page file may no longer exist. This retries the download
 * a few times (waiting for the connection if the device is offline), and as a
 * last resort reloads the app once to pick up the current version.
 */
export function lazyWithRetry(factory) {
  return lazy(async () => {
    let lastError
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const module = await factory()
        try { sessionStorage.removeItem(RELOAD_MARK) } catch { /* ignore */ }
        return module
      } catch (err) {
        lastError = err
        if (isOffline()) await waitForOnline(30000)
        else await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
      }
    }

    // Still failing while online: most likely a stale page after a deploy.
    // Reload once (not in a loop) to load the current files.
    try {
      const last = Number(sessionStorage.getItem(RELOAD_MARK) || 0)
      if (!isOffline() && Date.now() - last > 60000) {
        sessionStorage.setItem(RELOAD_MARK, String(Date.now()))
        window.location.reload()
        return new Promise(() => {}) // keep the loader visible while reloading
      }
    } catch { /* storage unavailable: fall through to the error screen */ }

    throw lastError
  })
}
