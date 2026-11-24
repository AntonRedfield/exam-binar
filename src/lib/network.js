/* global __BUILD_TIME__ */
/**
 * Resilient networking for slow, high-latency and unstable connections.
 *
 * Every Supabase request (auth, database, storage, realtime HTTP) goes through
 * `createResilientFetch`, which adds:
 *  - a per-request timeout, so a dead connection fails quickly instead of
 *    hanging until the browser gives up (which shows up as "code 0");
 *  - automatic retries with backoff + jitter, ONLY for requests that are safe
 *    to send twice (reads, updates, upserts, password login, whitelisted RPCs).
 *    Plain inserts, uploads and token refreshes are never repeated here:
 *    refresh tokens are single-use, and duplicate inserts would corrupt data;
 *  - a short wait for the device to come back online before sending;
 *  - a tiny connection state that the UI can show (offline / retrying).
 */

// RPCs that only read or set data to the same value, so repeating them is harmless.
const SAFE_RPCS = new Set(['prepare_student_login'])

// Gateway / proxy errors that are transient. 500 is NOT here: it is usually a
// real database error that would fail the same way again.
const RETRYABLE_STATUS = new Set([502, 503, 504, 520, 521, 522, 523, 524])

// ─── Connection state ───────────────────────────────────────────────────────

const state = {
  online: true,
  retrying: 0,
  failing: false,
  lastFailureAt: 0,
  lastSuccessAt: 0,
}
const listeners = new Set()
let emitQueued = false

function emit() {
  if (emitQueued) return
  emitQueued = true
  Promise.resolve().then(() => {
    emitQueued = false
    const snapshot = getNetworkState()
    listeners.forEach(fn => {
      try { fn(snapshot) } catch { /* listener errors must not break networking */ }
    })
  })
}

function setState(patch) {
  let changed = false
  for (const key of Object.keys(patch)) {
    if (state[key] !== patch[key]) {
      state[key] = patch[key]
      changed = true
    }
  }
  if (changed) emit()
}

export function getNetworkState() {
  return { ...state }
}

/** Subscribe to connection state changes. Returns an unsubscribe function. */
export function subscribeNetwork(fn) {
  listeners.add(fn)
  try { fn(getNetworkState()) } catch { /* ignore */ }
  return () => listeners.delete(fn)
}

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

if (typeof window !== 'undefined') {
  state.online = !isOffline()
  window.addEventListener('online', () => setState({ online: true }))
  window.addEventListener('offline', () => setState({ online: false }))
}

function markSuccess() {
  state.lastSuccessAt = Date.now()
  if (state.failing) setState({ failing: false })
}

function markFailure() {
  state.lastFailureAt = Date.now()
  if (!state.failing) setState({ failing: true })
  else emit()
}

function markRetrying(delta) {
  setState({ retrying: Math.max(0, state.retrying + delta) })
}

/** Resolve when the device reports it is online again (or after maxMs). */
export function waitForOnline(maxMs = 15000) {
  if (!isOffline() || typeof window === 'undefined') return Promise.resolve(true)
  return new Promise(resolve => {
    let finished = false
    const finish = (ok) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      window.removeEventListener('online', onOnline)
      resolve(ok)
    }
    const onOnline = () => finish(true)
    const timer = setTimeout(() => finish(!isOffline()), maxMs)
    window.addEventListener('online', onOnline)
  })
}

// ─── Error helpers ──────────────────────────────────────────────────────────

/**
 * True when an error means "the server could not be reached" rather than
 * "the server answered with an error". Works for thrown errors, Supabase auth
 * errors (status 0) and PostgREST error objects ("TypeError: Failed to fetch").
 */
export function isNetworkError(err) {
  if (!err) return false
  if (err.name === 'AuthRetryableFetchError' || err.isTimeout) return true
  if (err.status === 0) return true
  const msg = String(err.message || err.details || err || '').toLowerCase()
  return msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('network error') ||
    msg.includes('fetch failed') ||
    msg.includes('internet_disconnected') ||
    msg.includes('(timeout')
}

const BUILD_TIME = typeof __BUILD_TIME__ === 'number' ? __BUILD_TIME__ : 0

/**
 * A device clock set far in the past makes every HTTPS request fail (the
 * server certificate looks "not yet valid"), which the app sees as code 0.
 * The build date is a safe lower bound for the real date.
 */
export function getClockProblem() {
  if (!BUILD_TIME) return null
  const now = Date.now()
  if (now < BUILD_TIME - 2 * 24 * 60 * 60 * 1000) {
    return { kind: 'behind', deviceTime: new Date(now) }
  }
  return null
}

// ─── Request policy ─────────────────────────────────────────────────────────

function headerValue(headers, name) {
  if (!headers) return ''
  const wanted = name.toLowerCase()
  try {
    if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.get(name) || ''
    if (Array.isArray(headers)) {
      const pair = headers.find(([key]) => String(key).toLowerCase() === wanted)
      return pair ? String(pair[1]) : ''
    }
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === wanted) return String(headers[key])
    }
  } catch { /* ignore */ }
  return ''
}

function policy(timeoutMs, retries, budgetMs) {
  return {
    timeoutMs,
    retries,
    budgetMs,
    // How long to wait for the device to come back online before sending
    offlineWaitMs: retries > 0 ? 20000 : 8000,
  }
}

/**
 * Decide timeout and retry count for one request.
 * Exported for tests.
 */
export function getRequestPolicy(url, method = 'GET', headers = {}) {
  const u = String(url)
  const m = String(method).toUpperCase()
  const isRead = m === 'GET' || m === 'HEAD'

  // File uploads can be large and slow: never time out or repeat them.
  if (u.includes('/storage/v1/')) return isRead ? policy(30000, 2, 60000) : policy(0, 0, 0)

  if (u.includes('/auth/v1/token')) {
    // Refresh tokens are single-use (only ~10 s reuse tolerance): never replay.
    // supabase-js already retries refreshes itself in a safe way.
    if (u.includes('grant_type=refresh_token')) return policy(45000, 0, 45000)
    // Password login: each attempt just creates a session, so repeating is safe.
    return policy(25000, 3, 75000)
  }
  if (u.includes('/auth/v1/')) return policy(25000, isRead ? 2 : 0, 60000)

  if (u.includes('/rest/v1/rpc/')) {
    const fn = (u.split('/rest/v1/rpc/')[1] || '').split(/[?#]/)[0]
    return policy(25000, SAFE_RPCS.has(fn) ? 3 : 0, 75000)
  }

  if (u.includes('/rest/v1/')) {
    if (isRead) return policy(20000, 3, 60000)
    if (m === 'PATCH' || m === 'PUT' || m === 'DELETE') return policy(30000, 2, 75000)
    if (m === 'POST') {
      const prefer = headerValue(headers, 'Prefer').toLowerCase()
      const isUpsert = prefer.includes('resolution=merge-duplicates') || prefer.includes('resolution=ignore-duplicates')
      return policy(30000, isUpsert ? 2 : 0, 75000)
    }
  }

  // Realtime HTTP broadcast, edge functions, anything else: one try, with a timeout.
  return policy(30000, 0, 30000)
}

function backoffDelay(attempt) {
  const base = Math.min(6000, 700 * Math.pow(2, attempt))
  return base + Math.floor(Math.random() * 500) // jitter spreads out many students on one network
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function timeoutError(ms) {
  const err = new TypeError(`Failed to fetch (timeout ${Math.round(ms / 1000)}s)`)
  err.isTimeout = true
  return err
}

// ─── Resilient fetch ────────────────────────────────────────────────────────

export function createResilientFetch(baseFetch) {
  const doFetch = baseFetch || ((...args) => fetch(...args))

  return async function resilientFetch(input, init = {}) {
    // Request objects can't be replayed safely; they are not used by supabase-js here.
    if (typeof Request !== 'undefined' && input instanceof Request) return doFetch(input, init)

    const options = init || {}
    const method = String(options.method || 'GET').toUpperCase()
    const rule = getRequestPolicy(input, method, options.headers)
    const callerSignal = options.signal || null
    const startedAt = Date.now()
    let attempt = 0

    for (;;) {
      if (callerSignal && callerSignal.aborted) return doFetch(input, options) // surfaces the caller's AbortError

      if (isOffline()) {
        markRetrying(1)
        try { await waitForOnline(rule.offlineWaitMs) } finally { markRetrying(-1) }
      }

      const elapsed = Date.now() - startedAt
      const timeoutMs = rule.timeoutMs > 0
        ? Math.max(5000, Math.min(rule.timeoutMs, rule.budgetMs - elapsed))
        : 0

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
      let timer = null
      let timedOut = false
      const onCallerAbort = () => controller && controller.abort()
      if (controller && callerSignal) callerSignal.addEventListener('abort', onCallerAbort, { once: true })
      if (controller && timeoutMs > 0) {
        timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
      }

      let retryNow = false
      try {
        const response = await doFetch(input, controller ? { ...options, signal: controller.signal } : options)
        const canRetry = attempt < rule.retries &&
          Date.now() - startedAt + backoffDelay(attempt) < rule.budgetMs
        if (RETRYABLE_STATUS.has(response.status) && canRetry) {
          markFailure()
          retryNow = true
        } else {
          markSuccess()
          return response
        }
      } catch (err) {
        if (callerSignal && callerSignal.aborted) throw err
        const failure = timedOut ? timeoutError(timeoutMs) : err
        markFailure()
        const canRetry = attempt < rule.retries &&
          Date.now() - startedAt + backoffDelay(attempt) < rule.budgetMs
        if (!canRetry) throw failure
        retryNow = true
      } finally {
        if (timer) clearTimeout(timer)
        if (controller && callerSignal) callerSignal.removeEventListener('abort', onCallerAbort)
      }

      if (retryNow) {
        const wait = backoffDelay(attempt)
        attempt++
        markRetrying(1)
        try { await sleep(wait) } finally { markRetrying(-1) }
      }
    }
  }
}
