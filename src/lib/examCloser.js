/**
 * Reliable "close exam" (Tutup & Kunci / Kembalikan ke Draft).
 *
 * Order matters:
 *   1. Close the exam FIRST and notify open exam rooms, so students stop
 *      answering and their devices send their final answers (submission
 *      outbox, see submissionQueue.js).
 *   2. Lock every still-open session in ONE request.
 *   3. Grade every student from the answers stored on the server and save
 *      each result. Every write is verified and retried; a few students are
 *      processed in parallel so big classes finish quickly.
 *   4. Keep a follow-up job on this device that re-checks all results after
 *      20 s, 1 min and 3 min (answers sent late by students' phones are then
 *      graded too) and keeps retrying until every result is stored — also
 *      after a reload or when the app is opened again.
 *
 * Grading never runs against an empty question list: if the questions can't
 * be loaded, nothing is written (no student is ever overwritten with 0).
 */

import { supabase, isSupabaseConfigured } from './supabase.js'
import { gradeExam } from './grader.js'
import { roundScore } from './format.js'
import { broadcastExamLiveUpdate } from './liveExamSync.js'
import { isOffline, waitForOnline } from './network.js'
import { keepGradedEssays, parseBreakdown } from './resultMerge.js'

const JOBS_KEY = 'binar_close_jobs_v1'
const RECHECK_DELAYS_MS = [20000, 60000, 180000]
const RETRY_FAILED_EVERY_MS = 60000
const MAX_JOB_AGE_MS = 3 * 24 * 60 * 60 * 1000
const PARALLEL_WRITES = 5

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/** Run a Supabase call until it succeeds (errors are returned, not thrown, by supabase-js). */
async function withRetry(fn, tries = 5) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fn()
      if (res?.error) throw res.error
      return res
    } catch (err) {
      lastErr = err
      if (i < tries - 1) {
        if (isOffline()) await waitForOnline(20000)
        await sleep(Math.min(8000, 1000 * 2 ** i) + Math.floor(Math.random() * 500))
      }
    }
  }
  throw lastErr
}

async function runPool(items, limit, worker) {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await worker(item)
    }
  })
  await Promise.all(runners)
}

const sameBreakdown = (a, b) => JSON.stringify(parseBreakdown(a)) === JSON.stringify(parseBreakdown(b))

/**
 * Grade every finished session of an exam from the answers on the server and
 * store each result. Results that are already correct are left untouched.
 * Returns { total, saved, unchanged, failed: [studentId], error? }.
 */
export async function gradeAndStoreAllResults(examId, { onProgress } = {}) {
  if (!isSupabaseConfigured || !supabase || !examId) {
    return { total: 0, saved: 0, unchanged: 0, failed: [], error: 'Database offline' }
  }

  const { data: qs } = await withRetry(() => supabase
    .from('questions').select('*').eq('exam_id', examId).order('number', { ascending: true }))
  if (!qs || qs.length === 0) {
    // Never grade against nothing: that would store 0 for every student
    throw new Error('Soal ujian tidak dapat dimuat — penilaian ditunda agar nilai siswa tidak tertimpa 0.')
  }

  const [{ data: sessionRows }, { data: resultRows }] = await Promise.all([
    withRetry(() => supabase
      .from('exam_sessions')
      .select('id, student_id, status, answers, violation_count')
      .eq('exam_id', examId)),
    withRetry(() => supabase
      .from('results')
      .select('id, student_id, session_id, auto_score, max_auto_score, breakdown, submitted_at')
      .eq('exam_id', examId)),
  ])

  // Newest result per student (older duplicates are left alone)
  const newestByStudent = new Map()
  for (const r of resultRows || []) {
    const prev = newestByStudent.get(r.student_id)
    if (!prev || String(r.submitted_at || '') > String(prev.submitted_at || '')) newestByStudent.set(r.student_id, r)
  }

  const finished = (sessionRows || []).filter(s => s.student_id && (s.status === 'submitted' || s.status === 'time_up'))
  const report = { total: finished.length, saved: 0, unchanged: 0, failed: [] }
  let done = 0

  await runPool(finished, PARALLEL_WRITES, async (s) => {
    try {
      const { autoScore, maxAutoScore, breakdown } = gradeExam(s.answers || {}, qs)
      const auto = roundScore(autoScore)
      const max = roundScore(maxAutoScore)
      const existing = newestByStudent.get(s.student_id)

      if (existing) {
        const merged = keepGradedEssays(breakdown, existing.breakdown)
        const upToDate = roundScore(existing.auto_score || 0) === auto &&
          roundScore(existing.max_auto_score || 0) === max &&
          existing.session_id === s.id &&
          sameBreakdown(existing.breakdown, merged)
        if (upToDate) {
          report.unchanged++
        } else {
          const { data } = await withRetry(() => supabase
            .from('results')
            .update({
              session_id: s.id,
              auto_score: auto,
              max_auto_score: max,
              violation_count: s.violation_count || 0,
              breakdown: JSON.stringify(merged),
            })
            .eq('id', existing.id)
            .select('id'))
          if (!data || data.length === 0) throw new Error('Hasil tidak dapat diperbarui (akses ditolak)')
          report.saved++
        }
      } else {
        // Fixed id per session: repeating this can never create a duplicate
        const id = `res-${s.id}`
        const now = new Date().toISOString()
        const row = {
          id, student_id: s.student_id, exam_id: examId, session_id: s.id,
          auto_score: auto, max_auto_score: max, essay_score: 0,
          violation_count: s.violation_count || 0, breakdown: JSON.stringify(breakdown),
          submitted_at: now, created_at: now,
        }
        const { error: insErr } = await supabase.from('results').insert([row]).select('id')
        if (insErr) {
          const duplicate = insErr.code === '23505' || /duplicate key/i.test(insErr.message || '')
          if (!duplicate) {
            // Unknown outcome (maybe a lost reply): retry as an idempotent update-or-insert
            await withRetry(async () => {
              const again = await supabase.from('results').insert([row]).select('id')
              if (again.error && (again.error.code === '23505' || /duplicate key/i.test(again.error.message || ''))) {
                return supabase.from('results').update(row).eq('id', id).select('id')
              }
              return again
            })
          } else {
            await withRetry(() => supabase.from('results').update(row).eq('id', id).select('id'))
          }
        }
        report.saved++
      }
    } catch (err) {
      console.warn('[ExamCloser] could not store result for', s.student_id, err?.message || err)
      report.failed.push(s.student_id)
    } finally {
      done++
      onProgress?.({ stage: 'grading', done, total: finished.length })
    }
  })

  return report
}

// ─── Follow-up jobs (persisted on the teacher's device) ─────────────────────

function readJobs() {
  try {
    const list = JSON.parse(localStorage.getItem(JOBS_KEY) || '[]')
    return Array.isArray(list) ? list.filter(j => j && Date.now() - (j.createdAt || 0) < MAX_JOB_AGE_MS) : []
  } catch {
    return []
  }
}

function writeJobs(list) {
  try { localStorage.setItem(JOBS_KEY, JSON.stringify(list)) } catch { /* storage unavailable */ }
}

function upsertJob(job) {
  writeJobs([...readJobs().filter(j => j.examId !== job.examId), job])
}

function removeJob(examId) {
  writeJobs(readJobs().filter(j => j.examId !== examId))
}

/** Exams whose results are still being re-checked / retried from this device. */
export function getPendingCloseJobs() {
  return readJobs()
}

const runningJobs = new Set()

async function runJob(job) {
  if (runningJobs.has(job.examId)) return
  runningJobs.add(job.examId)
  try {
    const report = await gradeAndStoreAllResults(job.examId)
    const step = (job.step || 0) + 1
    if (report.failed.length === 0 && step >= RECHECK_DELAYS_MS.length) {
      removeJob(job.examId) // every scheduled re-check done and everything stored
      return
    }
    const delay = report.failed.length > 0 && step >= RECHECK_DELAYS_MS.length
      ? RETRY_FAILED_EVERY_MS
      : (RECHECK_DELAYS_MS[step] || RETRY_FAILED_EVERY_MS) - (RECHECK_DELAYS_MS[step - 1] || 0)
    upsertJob({ ...job, step: Math.min(step, RECHECK_DELAYS_MS.length), nextRunAt: Date.now() + Math.max(delay, 15000), failed: report.failed.length, lastError: null })
  } catch (err) {
    upsertJob({ ...job, nextRunAt: Date.now() + RETRY_FAILED_EVERY_MS, lastError: err?.message || String(err) })
  } finally {
    runningJobs.delete(job.examId)
  }
}

/**
 * Process due follow-up jobs on this device (teachers/admins). Runs now,
 * every 15 s and when the connection returns. Returns a stop function.
 */
export function startCloseJobRunner() {
  if (typeof window === 'undefined') return () => {}
  const tick = () => {
    if (isOffline()) return
    for (const job of readJobs()) {
      if ((job.nextRunAt || 0) <= Date.now()) runJob(job)
    }
  }
  tick()
  const timer = setInterval(tick, 15000)
  window.addEventListener('online', tick)
  return () => {
    clearInterval(timer)
    window.removeEventListener('online', tick)
  }
}

// ─── Messages for the teacher ───────────────────────────────────────────────

export function describeCloseProgress(p) {
  if (!p) return ''
  if (p.stage === 'closing') return 'Menutup ujian…'
  if (p.stage === 'locking') return 'Mengunci sesi siswa…'
  if (p.stage === 'grading') return `Menilai ${p.done}/${p.total} siswa…`
  return 'Memproses…'
}

export function describeCloseResult(res, targetStatus) {
  const label = targetStatus === 'closed' ? 'ditutup & dikunci' : 'di-unpublish ke draft'
  const followUp = 'Jawaban yang terlambat terkirim dari HP siswa dinilai ulang otomatis dalam 3 menit ke depan.'
  if (res?.gradingError) {
    return `Ujian sudah ${label} dan semua siswa dikunci, tetapi penilaian tertunda (${res.gradingError}). ` +
      'Sistem mencoba lagi otomatis setiap menit — biarkan aplikasi ini terbuka atau buka lagi nanti.'
  }
  const base = `Ujian berhasil ${label}. ${res?.countSubmitted || 0} siswa yang masih mengerjakan dikumpulkan otomatis; ` +
    `${res?.countGraded || 0} dari ${res?.totalSessions || 0} nilai tersimpan.`
  if (res?.failedCount > 0) {
    return `${base} ${res.failedCount} nilai belum tersimpan karena koneksi — sistem terus mencoba otomatis ` +
      `(biarkan aplikasi ini terbuka atau buka lagi nanti). ${followUp}`
  }
  return `${base} ${followUp}`
}

// ─── Close ──────────────────────────────────────────────────────────────────

/**
 * Close (targetStatus 'closed') or unpublish to draft, force-submit every
 * student and store every result. Throws only when the exam itself could not
 * be closed; grading problems are reported and retried in the background.
 */
export async function closeExamReliably(examId, targetStatus = 'draft', { onProgress } = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Database offline')
  const finalStatus = targetStatus === 'closed' ? 'closed' : 'draft'

  // 1. Close first: students stop answering, their devices send final answers
  onProgress?.({ stage: 'closing' })
  const { data: updatedExam } = await withRetry(() => supabase
    .from('exams')
    .update({ status: finalStatus, updated_at: new Date().toISOString() })
    .eq('id', examId)
    .select()
    .single(), 6)

  broadcastExamLiveUpdate(examId, {
    type: 'EXAM_UNPUBLISHED',
    action: 'force_submitted',
    targetStatus: finalStatus,
    message: finalStatus === 'closed'
      ? 'Ujian telah ditutup secara resmi oleh guru pengawas. Seluruh jawaban Anda telah otomatis dikumpulkan dan dinilai.'
      : 'Ujian telah dihentikan/di-unpublish oleh guru pengawas. Seluruh jawaban Anda telah otomatis dikumpulkan dan dinilai.'
  }).catch(err => console.warn('[ExamCloser] broadcast error:', err))

  // 2. Lock every session that is still open, in one request
  onProgress?.({ stage: 'locking' })
  const { data: locked } = await withRetry(() => supabase
    .from('exam_sessions')
    .update({ status: 'submitted', last_sync: new Date().toISOString() })
    .eq('exam_id', examId)
    .in('status', ['active', 'reset'])
    .select('id'), 6)

  // 3. Follow-up re-checks survive a reload / closing the tab
  upsertJob({ examId, createdAt: Date.now(), step: 0, nextRunAt: Date.now() + RECHECK_DELAYS_MS[0] })

  // 4. Grade and store every result now
  let report
  try {
    report = await gradeAndStoreAllResults(examId, { onProgress })
  } catch (err) {
    report = { total: 0, saved: 0, unchanged: 0, failed: [], error: err?.message || String(err) }
  }

  return {
    success: true,
    data: updatedExam,
    finalStatus,
    countSubmitted: (locked || []).length,
    countGraded: report.saved + report.unchanged,
    totalSessions: report.total,
    failedCount: report.failed.length,
    gradingError: report.error || null,
  }
}
