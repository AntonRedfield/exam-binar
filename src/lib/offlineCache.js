/**
 * Small on-device backup of the data a student needs to keep working when the
 * connection drops or is very slow:
 *   - the home list (exams, session status, scores)
 *   - the exam currently being taken (exam settings, questions, session status)
 *
 * Stored in localStorage, per user, typically a few KB to a few hundred KB.
 * The student's ANSWERS are backed up separately (IndexedDB, examStorage.js)
 * and are never touched here.
 */

const PREFIX = 'binar_offline_v1:'
const MAX_ENTRY_CHARS = 1500000 // ~1.5 MB of text per entry

function storageKey(userId, name) {
  return `${PREFIX}${userId}:${name}`
}

function userKeys(userId) {
  const keys = []
  try {
    const prefix = `${PREFIX}${userId}:`
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) keys.push(k)
    }
  } catch { /* storage unavailable */ }
  return keys
}

/** Save `data` under `name` for this user. Returns true when stored. */
export function saveOffline(userId, name, data) {
  if (!userId || typeof localStorage === 'undefined') return false
  let text
  try {
    text = JSON.stringify({ savedAt: Date.now(), data })
  } catch {
    return false
  }
  if (text.length > MAX_ENTRY_CHARS) return false
  const key = storageKey(userId, name)
  try {
    localStorage.setItem(key, text)
    return true
  } catch {
    // Storage full: drop this user's other exam backups and try once more
    try {
      userKeys(userId).filter(k => k !== key && k.includes(':exam_')).forEach(k => localStorage.removeItem(k))
      localStorage.setItem(key, text)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Read a saved entry. Returns { savedAt, data } or null when missing,
 * unreadable or older than maxAgeMs.
 */
export function loadOffline(userId, name, maxAgeMs = 12 * 60 * 60 * 1000) {
  if (!userId || typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey(userId, name))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.savedAt !== 'number') return null
    if (maxAgeMs && Date.now() - parsed.savedAt > maxAgeMs) return null
    return parsed
  } catch {
    return null
  }
}

export function removeOffline(userId, name) {
  if (!userId) return
  try { localStorage.removeItem(storageKey(userId, name)) } catch { /* ignore */ }
}

/** Remove every backup of this user (called on logout, for shared devices). */
export function clearOfflineForUser(userId) {
  if (!userId) return
  userKeys(userId).forEach(k => {
    try { localStorage.removeItem(k) } catch { /* ignore */ }
  })
}

/** A session row without the heavy base64 selfie photo. */
export function slimSession(sess) {
  if (!sess || typeof sess !== 'object') return sess
  // eslint-disable-next-line no-unused-vars
  const { selfie_image, ...rest } = sess
  return rest
}
