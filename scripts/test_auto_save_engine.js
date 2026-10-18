/**
 * Test Suite: Ultra-Lightweight Cross-Platform Exam Auto-Save Engine
 * 
 * Verifies:
 * 1. Zero localStorage.setItem calls in active answer-saving flow
 * 2. Atomic delta storage record size (<120 bytes)
 * 3. In-flight edit race condition protection (timestamp collision check)
 * 4. Offline recovery and batch delta flush
 * 5. Legacy localStorage migration
 */

import { ExamAtomicEngine } from '../src/lib/examStorage.js'

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${message}`)
    failed++
  }
}

// Mock browser global environment for Node
class MockStorage {
  constructor() {
    this.store = {}
    this.setItemCalls = []
  }
  getItem(k) { return this.store[k] || null }
  setItem(k, v) {
    this.setItemCalls.push({ k, v })
    this.store[k] = v
  }
  removeItem(k) { delete this.store[k] }
  clear() { this.store = {} }
}

globalThis.window = {
  localStorage: new MockStorage(),
  requestIdleCallback: (cb) => setTimeout(cb, 10),
  cancelIdleCallback: (id) => clearTimeout(id),
  addEventListener: () => {},
  removeEventListener: () => {}
}
globalThis.document = {
  visibilityState: 'visible',
  addEventListener: () => {},
  removeEventListener: () => {}
}
try {
  Object.defineProperty(globalThis.navigator, 'storage', {
    value: { persist: async () => true },
    configurable: true,
    writable: true
  })
} catch (e) {}

// Mock IndexedDB
class MockIDBStore {
  constructor() {
    this.items = new Map()
  }
  put(item) {
    this.items.set(String(item.q), { ...item })
  }
  get(q) {
    return this.items.get(String(q))
  }
  getAll() {
    return Array.from(this.items.values())
  }
  clear() {
    this.items.clear()
  }
}

const mockIDBStore = new MockIDBStore()

globalThis.indexedDB = {
  open: (name, version) => {
    const req = {
      result: {
        objectStoreNames: { contains: () => true },
        createObjectStore: () => {},
        transaction: () => ({
          objectStore: () => ({
            put: (item) => mockIDBStore.put(item),
            get: (q) => {
              const r = { result: mockIDBStore.get(q) }
              setTimeout(() => { if (r.onsuccess) r.onsuccess() }, 1)
              return r
            },
            getAll: () => {
              const r = { result: mockIDBStore.getAll() }
              setTimeout(() => { if (r.onsuccess) r.onsuccess() }, 1)
              return r
            },
            clear: () => mockIDBStore.clear()
          }),
          set oncomplete(fn) { setTimeout(fn, 1) },
          set onerror(fn) {}
        })
      },
      set onsuccess(fn) { setTimeout(() => fn({ target: { result: this.result } }), 1) },
      set onerror(fn) {}
    }
    return req
  }
}

async function runTests() {
  console.log('--- TEST 1: Universal Atomic Data Contract & Byte Size ---')
  const engine1 = new ExamAtomicEngine('exam-101', 'user-001')
  await engine1.init({})

  engine1.saveAnswer(1, 'B', false)
  const answers = engine1.getAnswersMap()
  assert(answers['1'] === 'B', 'Answer 1 saved in RAM cache correctly')

  const record = engine1.ramCache.get('1')
  assert(record.q === '1', 'record.q matches question number')
  assert(record.v === 'B', 'record.v matches answer value')
  assert(typeof record.t === 'number' && record.t > 0, 'record.t is millisecond timestamp')
  assert(record.s === 0, 'record.s is 0 (dirty flag)')

  const serializedSize = JSON.stringify(record).length
  assert(serializedSize < 120, `Record serialized size is ${serializedSize} bytes (< 120 bytes target)`)

  console.log('\n--- TEST 2: Zero localStorage.setItem Calls in Answer Flow ---')
  window.localStorage.setItemCalls = []
  engine1.saveAnswer(2, 'C', false)
  engine1.saveAnswer(3, 'Penjelasan essay singkat...', true)
  assert(window.localStorage.setItemCalls.length === 0, 'Zero localStorage.setItem calls made during answer saving')

  console.log('\n--- TEST 3: In-flight Race Condition & Optimistic Concurrency ---')
  const engine3 = new ExamAtomicEngine('exam-103', 'user-003')
  await engine3.init({})

  // User selects "A"
  engine3.saveAnswer(1, 'A', false)
  const recAtT1 = engine3.ramCache.get('1')
  const t1 = recAtT1.t

  // Network sync begins sending "A"
  let networkDoneResolve
  const networkPromise = new Promise(r => { networkDoneResolve = r })

  const syncPromise = engine3.syncDirty(async (batch) => {
    // While network is in flight, user changes answer to "D"!
    await new Promise(r => setTimeout(r, 20))
    engine3.saveAnswer(1, 'D', false)
    networkDoneResolve()
  })

  await networkPromise
  await syncPromise

  const currentRec = engine3.ramCache.get('1')
  assert(currentRec.v === 'D', 'Current answer value in RAM is "D"')
  assert(currentRec.s === 0, 'In-flight edit "D" correctly remained DIRTY (s: 0) because user edited during network request!')
  assert(engine3.dirtyKeys.has('1'), 'Question 1 correctly remained in dirtyKeys for subsequent sync')

  // Next sync cycle syncs "D"
  let secondBatchSynced = null
  engine3.onSyncCallback = async (batch) => {
    secondBatchSynced = batch
  }
  await engine3.syncDirty()
  assert(secondBatchSynced && secondBatchSynced[0].v === 'D', 'Next sync cycle synced the newer answer "D"')
  assert(engine3.ramCache.get('1').s === 1, 'Question 1 now marked as synced (s: 1)')
  assert(!engine3.dirtyKeys.has('1'), 'dirtyKeys now empty')

  console.log('\n--- TEST 4: Offline Recovery & Batch Delta Flush ---')
  mockIDBStore.clear()
  const engineOffline = new ExamAtomicEngine('exam-104', 'user-004')
  await engineOffline.init({})

  // Student answers 5 questions offline
  for (let i = 1; i <= 5; i++) {
    engineOffline.saveAnswer(i, `Option_${i}`, false)
  }
  engineOffline.flushPendingDiskWrites()

  // Simulate closing browser / refreshing page
  engineOffline.destroy()

  // New session opens
  const restoredEngine = new ExamAtomicEngine('exam-104', 'user-004')
  // Server session initially had nothing
  const restoredAnswers = await restoredEngine.init({})

  assert(Object.keys(restoredAnswers).length === 5, 'All 5 offline answers successfully restored from disk on app reload')
  assert(restoredAnswers['1'] === 'Option_1', 'Answer 1 correctly restored')
  assert(restoredAnswers['5'] === 'Option_5', 'Answer 5 correctly restored')
  assert(restoredEngine.getDirtyCount() === 5, 'All 5 restored answers correctly identified as dirty')

  // When network comes back online
  let flushedBatch = null
  restoredEngine.onSyncCallback = async (batch) => {
    flushedBatch = batch
  }
  await restoredEngine.syncDirty()

  assert(flushedBatch && flushedBatch.length === 5, 'Restored dirty answers flushed in a single batch of 5 records')
  assert(restoredEngine.getDirtyCount() === 0, 'All dirty records marked synced after batch delta flush')

  console.log('\n--- TEST 5: Legacy localStorage Seamless Migration ---')
  const legacyKey = 'binar_exam_answers_exam-legacy'
  window.localStorage.setItem(legacyKey, JSON.stringify({
    '1': 'A',
    '2': 'B',
    '3': 'C'
  }))

  const engineMigrate = new ExamAtomicEngine('exam-legacy', 'user-005')
  const migratedAnswers = await engineMigrate.init({})

  assert(migratedAnswers['1'] === 'A', 'Migrated question 1 value "A"')
  assert(migratedAnswers['2'] === 'B', 'Migrated question 2 value "B"')
  assert(migratedAnswers['3'] === 'C', 'Migrated question 3 value "C"')
  assert(window.localStorage.getItem(legacyKey) === null, 'Legacy localStorage key deleted after migration')
  assert(engineMigrate.getDirtyCount() === 3, 'Migrated answers flagged as dirty for server sync')

  console.log(`\n========================================`)
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`)
  console.log(`========================================`)

  if (failed > 0) process.exit(1)
  process.exit(0)
}

runTests().catch(err => {
  console.error('Test execution error:', err)
  process.exit(1)
})
