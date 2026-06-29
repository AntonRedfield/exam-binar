// ─── IndexedDB Local Autosave for Survey Answers ──────────────────────────────
// Saves survey progress locally every ~25 seconds as a safety net.
// If the user accidentally closes the tab before Supabase syncs, answers are
// recovered from IndexedDB on next visit.

const DB_NAME = 'binar_survey_autosave'
const DB_VERSION = 1
const STORE_NAME = 'survey_drafts'

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Build a unique key per user+exam */
function makeKey(userId, examId) {
  return `${userId}__${examId}`
}

/**
 * Save survey answers to IndexedDB.
 * @param {string} userId
 * @param {string} examId
 * @param {object} answers - the current answers map
 */
export async function saveLocal(userId, examId, answers) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({
      key: makeKey(userId, examId),
      userId,
      examId,
      answers,
      savedAt: Date.now(),
    })
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    // IndexedDB may be unavailable (e.g. private browsing in some browsers).
    // Fail silently — the Supabase autosave is the primary mechanism.
    console.warn('[LocalAutosave] save failed:', err)
  }
}

/**
 * Load previously saved answers from IndexedDB.
 * Returns null if nothing is stored.
 */
export async function loadLocal(userId, examId) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(makeKey(userId, examId))
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    console.warn('[LocalAutosave] load failed:', err)
    return null
  }
}

/**
 * Delete the local draft (call after successful submit).
 */
export async function clearLocal(userId, examId) {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(makeKey(userId, examId))
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('[LocalAutosave] clear failed:', err)
  }
}
