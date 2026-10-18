/**
 * Ultra-Lightweight Cross-Platform Exam Auto-Save & Sync Engine
 * 
 * Target Architecture:
 * - O(1) Atomic Delta Storage (<120 bytes per answer update)
 * - Zero JSON.stringify full-state serialization
 * - In-memory Map cache (<0.05ms UI read/write)
 * - Non-blocking disk scheduler (requestIdleCallback for MCQ, 600ms debounce/3000ms max ceiling for Essay)
 * - Cross-platform adapter: IndexedDB (PWA) / AndroidExamBridge / WindowsExamBridge
 * - Optimistic concurrency safe marking via client timestamps
 * - Automatic legacy localStorage migration and offline delta sync
 */

// ─── Storage Adapter (Cross-Platform) ─────────────────────────────────────────

class IndexedDBAdapter {
  constructor(examId) {
    this.dbName = `binar_exam_db_${examId}`
    this.storeName = 'answers'
    this.version = 1
    this.db = null
  }

  async init() {
    // Request persistent storage to prevent eviction on low-storage devices
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      try {
        await navigator.storage.persist()
      } catch (e) {
        // Silently continue if persist is rejected
      }
    }

    if (typeof indexedDB === 'undefined') {
      return null
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onupgradeneeded = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'q' })
        }
      }

      request.onsuccess = (e) => {
        this.db = e.target.result
        resolve(this.db)
      }

      request.onerror = (e) => {
        console.warn('[IndexedDBAdapter] open error:', e.target.error)
        resolve(null)
      }
    })
  }

  async putAnswer(record) {
    if (!this.db) await this.init()
    if (!this.db) return

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(this.storeName, 'readwrite')
        const store = tx.objectStore(this.storeName)
        // Passes plain JavaScript object directly via Structured Clone Algorithm (<120 bytes)
        store.put({
          q: String(record.q),
          v: record.v,
          t: record.t,
          s: record.s
        })
        tx.oncomplete = () => resolve(true)
        tx.onerror = () => resolve(false)
      } catch (err) {
        console.warn('[IndexedDBAdapter] putAnswer error:', err)
        resolve(false)
      }
    })
  }

  async getAllAnswers() {
    if (!this.db) await this.init()
    if (!this.db) return []

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(this.storeName, 'readonly')
        const store = tx.objectStore(this.storeName)
        const request = store.getAll()
        request.onsuccess = () => resolve(request.result || [])
        request.onerror = () => resolve([])
      } catch (err) {
        console.warn('[IndexedDBAdapter] getAllAnswers error:', err)
        resolve([])
      }
    })
  }

  async markSynced(qKeys, timestampMap) {
    if (!this.db || !qKeys || qKeys.length === 0) return

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(this.storeName, 'readwrite')
        const store = tx.objectStore(this.storeName)

        for (const q of qKeys) {
          const req = store.get(String(q))
          req.onsuccess = () => {
            const item = req.result
            if (item) {
              const batchTimestamp = timestampMap ? timestampMap[String(q)] : null
              // Only mark s: 1 if the record in store was not modified since batch was sent
              if (!batchTimestamp || item.t <= batchTimestamp) {
                item.s = 1
                store.put(item)
              }
            }
          }
        }

        tx.oncomplete = () => resolve(true)
        tx.onerror = () => resolve(false)
      } catch (err) {
        console.warn('[IndexedDBAdapter] markSynced error:', err)
        resolve(false)
      }
    })
  }

  async clearAll() {
    if (!this.db) await this.init()
    if (!this.db) return

    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(this.storeName, 'readwrite')
        const store = tx.objectStore(this.storeName)
        store.clear()
        tx.oncomplete = () => resolve(true)
        tx.onerror = () => resolve(false)
      } catch (e) {
        resolve(false)
      }
    })
  }
}

class AndroidBridgeAdapter {
  constructor() {
    this.bridge = typeof window !== 'undefined' ? window.AndroidExamBridge : null
  }

  async init() {
    return true
  }

  async putAnswer(record) {
    if (!this.bridge) return false
    try {
      const vStr = typeof record.v === 'string' ? record.v : JSON.stringify(record.v)
      this.bridge.saveAnswer(String(record.q), vStr, record.t)
      return true
    } catch (e) {
      console.warn('[AndroidBridgeAdapter] saveAnswer error:', e)
      return false
    }
  }

  async getAllAnswers() {
    if (!this.bridge) return []
    try {
      const json = this.bridge.getAllAnswersJson()
      if (!json) return []
      return JSON.parse(json)
    } catch (e) {
      console.warn('[AndroidBridgeAdapter] getAllAnswers error:', e)
      return []
    }
  }

  async markSynced(qKeys) {
    if (!this.bridge) return false
    try {
      this.bridge.markSynced(JSON.stringify(qKeys))
      return true
    } catch (e) {
      return false
    }
  }

  async clearAll() {
    if (!this.bridge || !this.bridge.clearAll) return
    try {
      this.bridge.clearAll()
    } catch (e) {}
  }
}

class WindowsBridgeAdapter {
  constructor() {
    this.bridge = typeof window !== 'undefined' ? window.WindowsExamBridge : null
  }

  async init() {
    return true
  }

  async putAnswer(record) {
    if (!this.bridge) return false
    try {
      const vStr = typeof record.v === 'string' ? record.v : JSON.stringify(record.v)
      this.bridge.saveAnswer(String(record.q), vStr, record.t)
      return true
    } catch (e) {
      return false
    }
  }

  async getAllAnswers() {
    if (!this.bridge) return []
    try {
      const json = this.bridge.getAllAnswersJson()
      return json ? JSON.parse(json) : []
    } catch (e) {
      return []
    }
  }

  async markSynced(qKeys) {
    if (!this.bridge) return false
    try {
      this.bridge.markSynced(JSON.stringify(qKeys))
      return true
    } catch (e) {
      return false
    }
  }

  async clearAll() {
    if (!this.bridge || !this.bridge.clearAll) return
    try {
      this.bridge.clearAll()
    } catch (e) {}
  }
}

/**
 * Creates the appropriate platform storage adapter
 */
export function createStorageAdapter(examId) {
  if (typeof window !== 'undefined' && window.AndroidExamBridge) {
    return new AndroidBridgeAdapter()
  }
  if (typeof window !== 'undefined' && window.WindowsExamBridge) {
    return new WindowsBridgeAdapter()
  }
  return new IndexedDBAdapter(examId)
}

// ─── Exam Atomic Sync Engine ──────────────────────────────────────────────────

export class ExamAtomicEngine {
  constructor(examId, userId) {
    this.examId = examId
    this.userId = userId
    this.adapter = createStorageAdapter(examId)

    // Layer A: In-Memory RAM Cache & Dirty Tracker
    this.ramCache = new Map() // Map<QuestionId, { q, v, t, s }>
    this.dirtyKeys = new Set() // Set<QuestionId>

    // Non-blocking Disk Write Scheduling
    this.essayTimers = new Map() // Map<QuestionId, { timer, maxTimer, record }>
    this.idleCallbacks = new Map() // Map<QuestionId, handle>

    // Network Sync Management
    this.isSyncing = false
    this.syncInterval = null
    this.onSyncCallback = null

    // Event listeners
    this._handleOnline = this._handleOnline.bind(this)
    this._handleVisibilityChange = this._handleVisibilityChange.bind(this)
  }

  /**
   * Initializes the engine:
   * 1. Connects to storage adapter
   * 2. Migrates legacy localStorage if found
   * 3. Loads local atomic answers from disk
   * 4. Merges with server answers (local dirty answers take precedence)
   * 5. Sets up listeners and 15s sync interval
   */
  async init(serverAnswers = {}, onSyncCallback = null) {
    this.onSyncCallback = onSyncCallback
    await this.adapter.init()

    // 1. Check & Migrate legacy localStorage
    this._migrateLegacyLocalStorage()

    // 2. Load answers from local atomic storage
    const localRecords = await this.adapter.getAllAnswers()
    for (const rec of localRecords) {
      if (rec && rec.q !== undefined) {
        const qKey = String(rec.q)
        this.ramCache.set(qKey, {
          q: qKey,
          v: rec.v,
          t: rec.t || Date.now(),
          s: rec.s ?? 0
        })
        if (rec.s === 0) {
          this.dirtyKeys.add(qKey)
        }
      }
    }

    // 3. Merge server answers (if local doesn't exist or is not dirty)
    if (serverAnswers && typeof serverAnswers === 'object') {
      for (const [qNum, val] of Object.entries(serverAnswers)) {
        const qKey = String(qNum)
        const existing = this.ramCache.get(qKey)
        if (!existing) {
          // Record only exists on server
          this.ramCache.set(qKey, {
            q: qKey,
            v: val,
            t: Date.now(),
            s: 1 // Already synced on server
          })
        }
      }
    }

    // 4. Attach resilience event listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this._handleOnline)
      document.addEventListener('visibilitychange', this._handleVisibilityChange)

      // Start 15s delta sync timer
      this.syncInterval = setInterval(() => {
        this.syncDirty()
      }, 15000)
    }

    // Return plain answers map for initial React state hydration
    return this.getAnswersMap()
  }

  /**
   * Check for legacy localStorage exam answers, migrate to atomic store, and delete legacy keys
   */
  _migrateLegacyLocalStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return

    const legacyKeys = [
      `binar_exam_answers_${this.examId}`,
      `exam_answers_${this.examId}`,
      `binar_exam_answers_${this.userId}_${this.examId}`,
      `exam_answers_${this.userId}_${this.examId}`
    ]

    for (const key of legacyKeys) {
      try {
        const raw = window.localStorage.getItem(key)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') {
            const now = Date.now()
            for (const [qNum, val] of Object.entries(parsed)) {
              const qKey = String(qNum)
              const record = { q: qKey, v: val, t: now, s: 0 }
              this.ramCache.set(qKey, record)
              this.dirtyKeys.add(qKey)
              this.adapter.putAnswer(record)
            }
          }
          window.localStorage.removeItem(key)
        }
      } catch (err) {
        console.warn('[ExamEngine] legacy migration warning:', err)
      }
    }
  }

  /**
   * Returns a plain answers dictionary { [qNum]: value }
   * Runs in O(N) where N is answered questions (instant in RAM)
   */
  getAnswersMap() {
    const map = {}
    for (const [q, record] of this.ramCache.entries()) {
      map[q] = record.v
    }
    return map
  }

  /**
   * Get single answer value
   */
  getAnswer(qNum) {
    const record = this.ramCache.get(String(qNum))
    return record ? record.v : undefined
  }

  /**
   * Save an answer atomically:
   * 1. Updates in-memory RAM cache instantly (<0.05ms)
   * 2. Marks as dirty (s: 0)
   * 3. Schedules non-blocking disk write
   */
  saveAnswer(qNum, value, isEssay = false) {
    const qKey = String(qNum)
    const now = Date.now()

    const record = {
      q: qKey,
      v: value,
      t: now,
      s: 0 // Mark dirty / unsynced
    }

    // Instant RAM Cache update
    this.ramCache.set(qKey, record)
    this.dirtyKeys.add(qKey)

    // Non-blocking disk write scheduling
    if (isEssay) {
      this._scheduleEssayDiskWrite(record)
    } else {
      this._scheduleObjectiveDiskWrite(record)
    }

    return this.getAnswersMap()
  }

  /**
   * Objective questions (MCQ, True/False, Matching, etc.):
   * Write via requestIdleCallback (fallback setTimeout 16ms)
   * UI paints first before I/O occurs
   */
  _scheduleObjectiveDiskWrite(record) {
    const qKey = record.q

    if (this.idleCallbacks.has(qKey)) {
      const existing = this.idleCallbacks.get(qKey)
      if (typeof window !== 'undefined') {
        if (window.cancelIdleCallback) {
          window.cancelIdleCallback(existing)
        } else {
          clearTimeout(existing)
        }
      }
      this.idleCallbacks.delete(qKey)
    }

    const doWrite = () => {
      this.idleCallbacks.delete(qKey)
      // Pass the latest record in ramCache for this question
      const current = this.ramCache.get(qKey)
      if (current) {
        this.adapter.putAnswer(current)
      }
    }

    if (typeof window !== 'undefined') {
      if (window.requestIdleCallback) {
        const handle = window.requestIdleCallback(doWrite, { timeout: 1000 })
        this.idleCallbacks.set(qKey, handle)
      } else {
        const handle = setTimeout(doWrite, 16)
        this.idleCallbacks.set(qKey, handle)
      }
    } else {
      doWrite()
    }
  }

  /**
   * Essay / Free-text questions:
   * Debounce local disk writes by 600ms per questionId, with max ceiling of 3000ms
   */
  _scheduleEssayDiskWrite(record) {
    const qKey = record.q
    const existing = this.essayTimers.get(qKey)

    const executeWrite = () => {
      const timerState = this.essayTimers.get(qKey)
      if (timerState) {
        clearTimeout(timerState.timer)
        clearTimeout(timerState.maxTimer)
        this.essayTimers.delete(qKey)
      }
      const current = this.ramCache.get(qKey)
      if (current) {
        this.adapter.putAnswer(current)
      }
    }

    if (!existing) {
      const timer = setTimeout(executeWrite, 600)
      const maxTimer = setTimeout(executeWrite, 3000)
      this.essayTimers.set(qKey, { timer, maxTimer, firstQueuedAt: Date.now() })
    } else {
      clearTimeout(existing.timer)
      existing.timer = setTimeout(executeWrite, 600)
    }
  }

  /**
   * Flush any pending essay writes to disk immediately
   */
  flushPendingDiskWrites() {
    for (const [qKey, timerState] of this.essayTimers.entries()) {
      clearTimeout(timerState.timer)
      clearTimeout(timerState.maxTimer)
      const current = this.ramCache.get(qKey)
      if (current) {
        this.adapter.putAnswer(current)
      }
    }
    this.essayTimers.clear()

    for (const [qKey, handle] of this.idleCallbacks.entries()) {
      if (typeof window !== 'undefined') {
        if (window.cancelIdleCallback) window.cancelIdleCallback(handle)
        else clearTimeout(handle)
      }
      const current = this.ramCache.get(qKey)
      if (current) {
        this.adapter.putAnswer(current)
      }
    }
    this.idleCallbacks.clear()
  }

  /**
   * Delta-Only Network Sync:
   * Syncs only unsynced questions (dirtyKeys) with optimistic timestamp verification
   */
  async syncDirty(customSyncCallback = null) {
    if (this.isSyncing || this.dirtyKeys.size === 0) return
    this.isSyncing = true

    // Snapshot current dirty batch
    const batch = []
    const timestampMap = {}
    for (const q of this.dirtyKeys) {
      const rec = this.ramCache.get(q)
      if (rec && rec.s === 0) {
        batch.push({ q: rec.q, v: rec.v, t: rec.t })
        timestampMap[rec.q] = rec.t
      }
    }

    if (batch.length === 0) {
      this.isSyncing = false
      return
    }

    try {
      const callback = customSyncCallback || this.onSyncCallback
      if (callback) {
        const answersMap = this.getAnswersMap()
        await callback(batch, answersMap)

        // Optimistic Concurrency Safe Marking:
        // Only mark s: 1 if the student hasn't typed/clicked a newer answer while request was in-flight
        const syncedKeys = []
        for (const item of batch) {
          const current = this.ramCache.get(item.q)
          if (current && current.t === item.t) {
            current.s = 1
            this.dirtyKeys.delete(item.q)
            syncedKeys.push(item.q)
          }
          // If current.t > item.t, student edited while network call was pending!
          // Leave in dirtyKeys with s: 0 so it syncs on next cycle.
        }

        if (syncedKeys.length > 0) {
          await this.adapter.markSynced(syncedKeys, timestampMap)
        }
      }
    } catch (err) {
      console.warn('[ExamEngine] network sync failed (will retry next cycle):', err)
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * Online event handler: sync immediately when network is restored
   */
  _handleOnline() {
    this.syncDirty()
  }

  /**
   * Visibility change handler: flush dirty answers when app/tab goes hidden
   */
  _handleVisibilityChange() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.flushPendingDiskWrites()
      this.syncDirty()
    }
  }

  /**
   * Total unsynced dirty count
   */
  getDirtyCount() {
    return this.dirtyKeys.size
  }

  /**
   * Clean up timers and listeners
   */
  destroy() {
    if (this.syncInterval) clearInterval(this.syncInterval)
    this.flushPendingDiskWrites()

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this._handleOnline)
      document.removeEventListener('visibilitychange', this._handleVisibilityChange)
    }
  }

  /**
   * Clear all stored answers (call upon final exam submission)
   */
  async clear() {
    this.destroy()
    this.ramCache.clear()
    this.dirtyKeys.clear()
    await this.adapter.clearAll()
  }
}
