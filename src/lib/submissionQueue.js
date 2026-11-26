/**
 * Durable exam submission outbox.
 *
 * A submission (final answers + grade) is written to the device FIRST, then
 * sent to the server and retried — with growing pauses, for as long as it
 * takes — until the server has confirmed BOTH:
 *   1. the exam session (final answers + status), and
 *   2. the result row (score + breakdown).
 * If the app is closed, the phone sleeps or the page reloads, the outbox is
 * picked up again the next time the app opens (see startSubmissionRunner).
 * Only after the server confirms is the submission removed from the device.
 *
 * Every step is safe to repeat: the session update writes the same values,
 * and the result uses a fixed id per session, so a retry after a lost
 * response updates the same row instead of creating a duplicate.
 */

import { supabase, isSupabaseConfigured } from './supabase.js'
import { isNetworkError, isOffline, waitForOnline } from './network.js'
import { roundScore } from './format.js'
import { getCurrentUser } from './auth.js'
import { ExamAtomicEngine, getLocalAnswerExamIds } from './examStorage.js'
import { gradeExam } from './grader.js'
import { keepGradedEssays } from './resultMerge.js'

const STORAGE_KEY = 'binar_pending_submissions_v1'
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
// A session whose end time moved later than this after the submission was
// made was reopened (extra time / restart): that old submission is dropped.
const REOPEN_TOLERANCE_MS = 60 * 1000

const memoryStore = new Map() // working copy; fallback when localStorage is unavailable
const inFlight = new Map() // key -> promise of the running send loop
const listeners = new Set()
let storageWritable = true // false after a failed write (e.g. storage full)

// ─── Storage ────────────────────────────────────────────────────────────────

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    const fresh = Array.isArray(list) ? list.filter(r => r && Date.now() - (r.createdAt || 0) < MAX_AGE_MS) : []
    // Storage is the source of truth (records sent or cancelled elsewhere
    // disappear here too). Only when writing failed do memory-only records
    // have to be kept alongside it.
    if (storageWritable) memoryStore.clear()
    for (const r of fresh) memoryStore.set(r.key, r)
    return [...memoryStore.values()]
  } catch {
    return [...memoryStore.values()]
  }
}

function writeAll() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...memoryStore.values()]))
    storageWritable = true
  } catch {
    // Storage unavailable/full: the in-memory copy still drives the retries
    storageWritable = false
  }
}

function emit() {
  const snapshot = [...memoryStore.values()]
  listeners.forEach(fn => {
    try { fn(snapshot) } catch { /* ignore listener errors */ }
  })
}

function getRecord(key) {
  readAll()
  return memoryStore.get(key) || null
}

function patchRecord(key, patch) {
  const rec = memoryStore.get(key)
  if (!rec) return
  memoryStore.set(key, { ...rec, ...patch })
  writeAll()
  emit()
}

function removeRecord(key) {
  readAll()
  memoryStore.delete(key)
  writeAll()
  emit()
}

export function submissionKey(userId, examId) {
  return `${userId}:${examId}`
}

/** Pending submissions of one user (all users when userId is omitted). */
export function getPendingSubmissions(userId) {
  const all = readAll()
  return userId ? all.filter(r => r.userId === userId) : all
}

export function hasPendingSubmission(userId, examId) {
  return Boolean(getRecord(submissionKey(userId, examId)))
}

/** Listen for changes to the outbox. Returns an unsubscribe function. */
export function subscribeSubmissions(fn) {
  listeners.add(fn)
  try { fn(readAll()) } catch { /* ignore */ }
  return () => listeners.delete(fn)
}

/**
 * Store a submission on the device. Call this BEFORE trying to send it.
 * Returns the outbox key.
 */
export function enqueueSubmission(sub) {
  readAll()
  const key = submissionKey(sub.userId, sub.examId)
  memoryStore.set(key, {
    key,
    userId: sub.userId,
    examId: sub.examId,
    sessionId: sub.sessionId || null,
    sessionEnd: sub.sessionEnd || null,
    answers: sub.answers || {},
    violationCount: Number(sub.violationCount) || 0,
    currentQuestion: Number(sub.currentQuestion) || 1,
    // 'submitted' | 'time_up' | null (null = keep the server's status)
    status: sub.status || null,
    grading: {
      autoScore: roundScore(sub.grading?.autoScore || 0),
      maxAutoScore: roundScore(sub.grading?.maxAutoScore || 0),
      breakdown: sub.grading?.breakdown || [],
    },
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  })
  writeAll()
  emit()
  return key
}

/** Drop a submission that is no longer wanted (e.g. the proctor gave extra time). */
export function cancelSubmission(key) {
  removeRecord(key)
}

// ─── Sending ────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function retryDelay(attempt) {
  // 2 s, 4 s, 8 s, 15 s, then every 30 s (with a little jitter)
  const steps = [2000, 4000, 8000, 15000]
  const base = attempt <= steps.length ? steps[attempt - 1] : 30000
  return base + Math.floor(Math.random() * 1000)
}

function isDuplicateKey(err) {
  return err?.code === '23505' || /duplicate key/i.test(err?.message || '')
}

/** Human-readable reason for the progress screen. */
function describeError(err) {
  if (isOffline()) return 'Tidak ada koneksi internet'
  if (isNetworkError(err)) return 'Koneksi lambat / terputus'
  const msg = String(err?.message || err || '')
  if (/jwt|token|auth|401|42501|permission|akses ditolak/i.test(msg)) {
    return 'Sesi login bermasalah — jika berlanjut, login ulang (jawaban tetap aman di perangkat)'
  }
  return 'Server sibuk'
}

/**
 * Step 1: save final answers (+ status) on the exam session.
 * Returns 'ok', or 'abandon' when the session was removed, reset by an admin,
 * or reopened with more time (the student will submit again from the room).
 */
async function saveSession(rec) {
  if (!rec.sessionId) return 'ok' // nothing to update (should not happen)

  const { data: current, error: readErr } = await supabase
    .from('exam_sessions')
    .select('id, status, end_timestamp')
    .eq('id', rec.sessionId)
    .maybeSingle()
  if (readErr) throw readErr
  if (!current) return 'abandon'
  if (current.status === 'reset') return 'abandon'
  if (current.status === 'active' && rec.sessionEnd && current.end_timestamp &&
      new Date(current.end_timestamp).getTime() > new Date(rec.sessionEnd).getTime() + REOPEN_TOLERANCE_MS) {
    return 'abandon'
  }

  const payload = {
    answers: rec.answers,
    violation_count: rec.violationCount,
    current_question: rec.currentQuestion,
    last_sync: new Date().toISOString(),
  }
  if (rec.status) payload.status = rec.status

  const { data: updated, error } = await supabase
    .from('exam_sessions')
    .update(payload)
    .eq('id', rec.sessionId)
    .select('id')
  if (error) throw error
  if (!updated || updated.length === 0) {
    throw new Error('Sesi ujian tidak dapat diperbarui (akses ditolak)')
  }
  return 'ok'
}

/**
 * Safety net: a submission with answers but no graded items (the question
 * list was not available when it was made) is graded against the questions
 * on the server, so it can never be stored as a score of 0 by mistake.
 */
async function ensureGraded(rec) {
  const hasAnswers = Object.keys(rec.answers || {}).some(k => !k.startsWith('_'))
  const graded = Array.isArray(rec.grading?.breakdown) && rec.grading.breakdown.length > 0
  if (graded || !hasAnswers) return rec

  const { data: qs, error } = await supabase
    .from('questions')
    .select('*')
    .eq('exam_id', rec.examId)
    .order('number', { ascending: true })
  if (error) throw error
  if (!qs || qs.length === 0) return rec

  const { autoScore, maxAutoScore, breakdown } = gradeExam(rec.answers, qs)
  const grading = { autoScore: roundScore(autoScore), maxAutoScore: roundScore(maxAutoScore), breakdown }
  patchRecord(rec.key, { grading })
  return { ...rec, grading }
}

/** Step 2: create or update the result row. Returns the result id. */
async function saveResult(rec) {
  const fields = {
    session_id: rec.sessionId,
    auto_score: roundScore(rec.grading.autoScore),
    max_auto_score: roundScore(rec.grading.maxAutoScore),
    violation_count: rec.violationCount,
    breakdown: JSON.stringify(rec.grading.breakdown || []),
  }

  // Newest existing result for this student + exam (robust even if an older
  // bug left duplicates behind — maybeSingle() would fail on those)
  const { data: rows, error: findErr } = await supabase
    .from('results')
    .select('id, breakdown')
    .eq('exam_id', rec.examId)
    .eq('student_id', rec.userId)
    .order('submitted_at', { ascending: false })
    .limit(1)
  if (findErr) throw findErr

  const updateById = async (id, oldBreakdown) => {
    // essay_score is deliberately not touched, and the teacher's per-question
    // essay grades are carried over: a teacher may have graded already
    const payload = oldBreakdown === undefined
      ? fields
      : { ...fields, breakdown: JSON.stringify(keepGradedEssays(rec.grading.breakdown || [], oldBreakdown)) }
    const { data, error } = await supabase.from('results').update(payload).eq('id', id).select('id')
    if (error) throw error
    if (!data || data.length === 0) throw new Error('Hasil ujian tidak dapat diperbarui (akses ditolak)')
    return id
  }

  if (rows && rows.length > 0) return updateById(rows[0].id, rows[0].breakdown)

  // Fixed id per session: repeating this insert can never create a second row
  const id = `res-${rec.sessionId || rec.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const now = new Date().toISOString()
  const { data: created, error: insertErr } = await supabase
    .from('results')
    .insert([{ id, student_id: rec.userId, exam_id: rec.examId, essay_score: 0, submitted_at: now, created_at: now, ...fields }])
    .select('id')
  if (insertErr) {
    if (isDuplicateKey(insertErr)) return updateById(id) // an earlier attempt did succeed
    throw insertErr
  }
  return created?.[0]?.id || id
}

/**
 * Send one submission, retrying until the server confirms it (or until the
 * submission is cancelled / belongs to another logged-in user).
 *
 * Resolves with one of:
 *   { ok: true, resultId }
 *   { ok: false, abandoned: true }  session removed / reset / reopened
 *   { ok: false, paused: true }     another user is logged in on this device
 *   { ok: false, gone: true }       cancelled
 */
export function processSubmission(key, { onProgress } = {}) {
  if (inFlight.has(key)) {
    const running = inFlight.get(key)
    if (onProgress) running.progressListeners.add(onProgress)
    return running.promise
  }

  const progressListeners = new Set(onProgress ? [onProgress] : [])
  const report = (info) => progressListeners.forEach(fn => { try { fn(info) } catch { /* ignore */ } })

  const promise = (async () => {
    if (!isSupabaseConfigured || !supabase) return { ok: false, paused: true }
    let attempt = 0
    for (;;) {
      const rec = getRecord(key)
      if (!rec) return { ok: false, gone: true }
      const currentUser = getCurrentUser()
      if (!currentUser || currentUser.id !== rec.userId) return { ok: false, paused: true }

      attempt++
      report({ stage: 'sending', attempt })
      try {
        if (isOffline()) {
          report({ stage: 'waiting', attempt, reason: 'Tidak ada koneksi internet' })
          await waitForOnline(30000)
          if (isOffline()) throw new TypeError('Failed to fetch (offline)')
        }

        const sessionStep = await saveSession(rec)
        if (sessionStep === 'abandon') {
          removeRecord(key)
          return { ok: false, abandoned: true }
        }
        report({ stage: 'saving-result', attempt })
        const resultId = await saveResult(await ensureGraded(rec))

        // Confirmed by the server: now it is safe to forget the device copies
        removeRecord(key)
        try { await new ExamAtomicEngine(rec.examId, rec.userId).clear() } catch { /* best effort */ }
        report({ stage: 'done', attempt, resultId })
        return { ok: true, resultId }
      } catch (err) {
        const reason = describeError(err)
        const wait = retryDelay(attempt)
        console.warn(`[Submission] attempt ${attempt} failed, retrying in ${Math.round(wait / 1000)}s:`, err?.message || err)
        patchRecord(key, { attempts: (rec.attempts || 0) + 1, lastError: reason, lastAttemptAt: Date.now() })
        report({ stage: 'retrying', attempt, reason, retryAt: Date.now() + wait })
        // Wake up early if the connection comes back
        await Promise.race([
          sleep(wait),
          new Promise(resolve => {
            if (typeof window === 'undefined') return
            window.addEventListener('online', resolve, { once: true })
          }),
        ])
      }
    }
  })()

  const entry = { promise, progressListeners }
  inFlight.set(key, entry)
  promise.finally(() => inFlight.delete(key))
  return promise
}

// ─── Recovery of answers that never left the device ─────────────────────────

async function localExamIds(userId) {
  const ids = new Set(getLocalAnswerExamIds(userId))
  try {
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      const prefix = 'binar_exam_db_'
      const suffix = `_${userId}`
      for (const db of await indexedDB.databases()) {
        const name = db?.name || ''
        if (name.startsWith(prefix) && name.endsWith(suffix)) {
          ids.add(name.slice(prefix.length, name.length - suffix.length))
        }
      }
    }
  } catch { /* listing not supported: the stored list is used */ }
  return [...ids].filter(Boolean)
}

let recovering = false
let lastRecoveryAt = 0

/**
 * Find exams whose answers are still only on this device — e.g. the phone was
 * off or the app closed when time ran out or the teacher closed the exam —
 * and get them onto the server:
 *   - session already closed  → sent as a submission (graded, result updated)
 *   - session still running   → answers saved to the session (the student can continue)
 * Exams open in this tab are skipped (the exam room handles those itself).
 */
export async function recoverUnsentAnswers(userId) {
  if (!userId || recovering || !isSupabaseConfigured || !supabase || isOffline()) return
  if (Date.now() - lastRecoveryAt < 5 * 60 * 1000) return
  recovering = true
  lastRecoveryAt = Date.now()
  try {
    for (const examId of await localExamIds(userId)) {
      if (getRecord(submissionKey(userId, examId))) continue
      if (typeof window !== 'undefined' && window.location.pathname.includes(`/exam/${examId}/room`)) continue

      const { data: rows, error } = await supabase
        .from('exam_sessions')
        .select('id, status, answers, end_timestamp, violation_count, current_question')
        .eq('exam_id', examId)
        .eq('student_id', userId)
        .order('started_at', { ascending: false })
        .limit(1)
      if (error) continue // try again next time
      const sess = rows?.[0]

      const probe = new ExamAtomicEngine(examId, userId)
      let merged
      let unsent = 0
      try {
        merged = await probe.init(sess?.answers || {}, null)
        unsent = probe.getDirtyCount()
      } finally {
        probe.destroy()
      }

      const closed = sess && (sess.status === 'submitted' || sess.status === 'time_up')
      if (!sess || sess.answers?._try_mode) continue
      if (unsent === 0) {
        if (closed) await probe.clear() // nothing left to send: free the space
        continue
      }

      if (closed) {
        const { data: qs, error: qErr } = await supabase
          .from('questions').select('*').eq('exam_id', examId).order('number', { ascending: true })
        if (qErr || !qs || qs.length === 0) continue
        const key = enqueueSubmission({
          userId,
          examId,
          sessionId: sess.id,
          sessionEnd: sess.end_timestamp,
          answers: merged,
          violationCount: sess.violation_count,
          currentQuestion: sess.current_question,
          status: null, // keep the server's status
          grading: gradeExam(merged, qs),
        })
        processSubmission(key).catch(() => {})
      } else if (sess.status === 'active') {
        await supabase
          .from('exam_sessions')
          .update({ answers: merged, last_sync: new Date().toISOString() })
          .eq('id', sess.id)
      }
    }
  } catch (err) {
    console.warn('[Submission] recovery of unsent answers skipped:', err?.message || err)
  } finally {
    recovering = false
  }
}

/**
 * Keep sending this user's pending submissions in the background: at start,
 * whenever the connection returns, and once a minute. Also looks for answers
 * that never left the device. Returns a stop function.
 */
export function startSubmissionRunner(userId) {
  if (!userId || typeof window === 'undefined') return () => {}
  const run = () => {
    for (const rec of getPendingSubmissions(userId)) {
      if (!inFlight.has(rec.key)) processSubmission(rec.key).catch(() => {})
    }
    recoverUnsentAnswers(userId).catch(() => {})
  }
  run()
  const timer = setInterval(run, 60000)
  window.addEventListener('online', run)

  // Ask before closing the tab while answers are still on their way
  const onBeforeUnload = (e) => {
    if (getPendingSubmissions(userId).length === 0) return
    e.preventDefault()
    e.returnValue = ''
  }
  window.addEventListener('beforeunload', onBeforeUnload)

  return () => {
    clearInterval(timer)
    window.removeEventListener('online', run)
    window.removeEventListener('beforeunload', onBeforeUnload)
  }
}
