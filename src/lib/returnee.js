/**
 * Returnee Module — Centralized Exam Token System (OSN Exambro & TKA System)
 * 
 * Rules:
 * - Exactly 1 active token per exam (NOT per student).
 * - All students who are locked out (Returnee / "out") use the SAME token within the active time window.
 * - Teachers (Level 3 & 4) can configure the token duration (e.g. 60 seconds, 120s, 300s, 900s, etc.).
 * - If current time > token expiry time, token is EXPIRED and will reject student unlock attempts.
 * - Teacher can generate a new token, extend the active token timer, or enter a manual 6-character token.
 * - Verification is case-insensitive (standard 6 alphanumeric characters).
 */

import { supabase, isSupabaseConfigured } from './supabase.js'

export const RETURNEE_TOKEN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const RETURNEE_TOKEN_REGEX = /^[0-9a-zA-Z]{6}$/

/**
 * Validates whether a token string is 6 alphanumeric characters.
 * @param {string} token 
 * @returns {boolean}
 */
export function isValidReturneeToken(token) {
  if (!token || typeof token !== 'string') return false
  return RETURNEE_TOKEN_REGEX.test(token.trim())
}

/**
 * Sanitizes input to conform to token format (uppercase alphanumeric, max 6 chars).
 * @param {string} input 
 * @returns {string}
 */
export function sanitizeReturneeToken(input) {
  if (!input) return ''
  return String(input)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 6)
}

/**
 * Generates a random 6-character uppercase alphanumeric token.
 * Example outputs: 'W7BX9A', 'K49M12', '0A8Z5C'
 * @returns {string}
 */
export function generateReturneeToken() {
  const chars = RETURNEE_TOKEN_CHARS
  const len = chars.length
  let token = ''
  
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(6)
    crypto.getRandomValues(bytes)
    for (let i = 0; i < 6; i++) {
      token += chars[bytes[i] % len]
    }
  } else {
    for (let i = 0; i < 6; i++) {
      token += chars[Math.floor(Math.random() * len)]
    }
  }
  return token
}

/**
 * Computes complete metadata for an exam's active token:
 * duration, expiration timestamp, remaining seconds, and status.
 * Resilient to both new schema columns and fallback columns.
 * 
 * @param {Object} exam
 * @returns {{
 *   token: string|null,
 *   duration: number,
 *   expiresAt: string|null,
 *   remainingSeconds: number,
 *   isExpired: boolean,
 *   isActive: boolean,
 *   percentRemaining: number
 * }}
 */
export function getExamTokenInfo(exam) {
  if (!exam || !exam.returnee_token) {
    return {
      token: null,
      duration: 60,
      expiresAt: null,
      remainingSeconds: 0,
      isExpired: false,
      isActive: false,
      percentRemaining: 0
    }
  }

  const token = sanitizeReturneeToken(exam.returnee_token)
  const duration = Number(exam.returnee_token_duration) || Number(exam.survey_notify_time) || 60

  let expiresAt = exam.returnee_token_expires_at || null
  if (!expiresAt && exam.updated_at) {
    const updatedAtTime = new Date(exam.updated_at).getTime()
    if (!isNaN(updatedAtTime)) {
      expiresAt = new Date(updatedAtTime + duration * 1000).toISOString()
    }
  }

  let remainingSeconds = 0
  if (expiresAt) {
    const expiryTime = new Date(expiresAt).getTime()
    if (!isNaN(expiryTime)) {
      remainingSeconds = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000))
    }
  }

  const isExpired = remainingSeconds <= 0
  const isActive = !isExpired && remainingSeconds > 0
  const percentRemaining = duration > 0 ? Math.min(100, Math.max(0, Math.round((remainingSeconds / duration) * 100))) : 0

  return {
    token,
    duration,
    expiresAt,
    remainingSeconds,
    isExpired,
    isActive,
    percentRemaining
  }
}

/**
 * Marks a specific session as requiring a returnee token.
 * @param {string} sessionId
 * @param {string} reason
 */
export async function markSessionAsReturnee(sessionId, reason = 'Logout terdeteksi') {
  if (!isSupabaseConfigured || !supabase || !sessionId) return { error: null }
  try {
    const { data, error } = await supabase
      .from('exam_sessions')
      .update({
        returnee_token_required: true,
        returnee_reason: reason,
        last_sync: new Date().toISOString()
      })
      .eq('id', sessionId)
      .select()
      .maybeSingle()

    return { data, error }
  } catch (err) {
    console.warn('[Returnee] markSessionAsReturnee error:', err)
    return { error: err }
  }
}

/**
 * Marks all active exam sessions for a student as requiring a returnee token.
 * Triggered on user logout, session conflict, or tab termination.
 * @param {string} studentId
 * @param {string} reason
 */
export async function markActiveSessionsAsReturnee(studentId, reason = 'Logout terdeteksi') {
  if (!isSupabaseConfigured || !supabase || !studentId) return { error: null }
  try {
    const { data, error } = await supabase
      .from('exam_sessions')
      .update({
        returnee_token_required: true,
        returnee_reason: reason,
        last_sync: new Date().toISOString()
      })
      .eq('student_id', studentId)
      .eq('status', 'active')
      .select()

    return { data, error }
  } catch (err) {
    console.warn('[Returnee] markActiveSessionsAsReturnee error:', err)
    return { error: err }
  }
}

/**
 * Sets or updates the centralized exam-wide token (Level 3 & 4 only).
 * Exactly 1 token per exam with teacher-configured duration (in seconds).
 * 
 * @param {string} examId 
 * @param {string|null} customToken 
 * @param {number} durationSeconds - Duration in seconds (e.g. 60, 120, 300, 900)
 * @returns {Promise<{ token: string|null, duration: number, expiresAt: string|null, error: Error|null }>}
 */
export async function setExamReturneeToken(examId, customToken = null, durationSeconds = 60) {
  if (!isSupabaseConfigured || !supabase || !examId) {
    return { token: null, duration: 60, expiresAt: null, error: new Error('Database offline atau examId tidak valid') }
  }

  let finalToken = ''
  if (customToken) {
    const sanitized = sanitizeReturneeToken(customToken)
    if (!isValidReturneeToken(sanitized)) {
      return { token: null, duration: 60, expiresAt: null, error: new Error('Token harus tepat 6 karakter alphanumeric (0-9, A-Z).') }
    }
    finalToken = sanitized
  } else {
    finalToken = generateReturneeToken()
  }

  const duration = Math.max(10, Number(durationSeconds) || 60)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + duration * 1000).toISOString()
  const nowIso = now.toISOString()

  try {
    // Attempt standard update with duration and expiry columns
    const updatePayload = {
      returnee_token: finalToken,
      returnee_token_duration: duration,
      returnee_token_expires_at: expiresAt,
      updated_at: nowIso
    }

    const { error } = await supabase
      .from('exams')
      .update(updatePayload)
      .eq('id', examId)

    if (error) {
      // 42703 = column does not exist (migration not yet applied to remote DB)
      if (error.code === '42703' || String(error.message).includes('returnee_token_expires_at')) {
        console.warn('[Returnee] Falling back to existing columns for token duration storage')
        const { error: fallbackError } = await supabase
          .from('exams')
          .update({
            returnee_token: finalToken,
            survey_notify_time: String(duration),
            updated_at: nowIso
          })
          .eq('id', examId)

        if (fallbackError) throw fallbackError
      } else {
        throw error
      }
    }

    return { token: finalToken, duration, expiresAt, error: null }
  } catch (err) {
    console.error('[Returnee] setExamReturneeToken error:', err)
    return { token: null, duration, expiresAt: null, error: err }
  }
}

/**
 * Extends or resets the expiration time of the active token without changing the token code.
 * Useful when students need more time with the current token.
 * 
 * @param {string} examId 
 * @param {number} durationSeconds 
 * @returns {Promise<{ token: string|null, duration: number, expiresAt: string|null, error: Error|null }>}
 */
export async function extendExamReturneeToken(examId, durationSeconds = 60) {
  if (!isSupabaseConfigured || !supabase || !examId) {
    return { token: null, duration: 60, expiresAt: null, error: new Error('Database offline atau examId tidak valid') }
  }

  try {
    const { data: exam, error: fetchErr } = await supabase
      .from('exams')
      .select('*')
      .eq('id', examId)
      .maybeSingle()

    if (fetchErr || !exam || !exam.returnee_token) {
      return { token: null, duration: 60, expiresAt: null, error: new Error('Belum ada token aktif untuk diperpanjang') }
    }

    return await setExamReturneeToken(examId, exam.returnee_token, durationSeconds)
  } catch (err) {
    return { token: null, duration: 60, expiresAt: null, error: err }
  }
}

/**
 * Clears/removes the exam-wide returnee token (invalidates immediately).
 * @param {string} examId 
 */
export async function clearExamReturneeToken(examId) {
  if (!isSupabaseConfigured || !supabase || !examId) return { error: null }
  try {
    const updatePayload = {
      returnee_token: null,
      returnee_token_expires_at: null,
      updated_at: new Date().toISOString()
    }
    const { error } = await supabase
      .from('exams')
      .update(updatePayload)
      .eq('id', examId)

    if (error && (error.code === '42703' || String(error.message).includes('returnee_token_expires_at'))) {
      const { error: fallbackError } = await supabase
        .from('exams')
        .update({
          returnee_token: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', examId)
      return { error: fallbackError }
    }

    return { error }
  } catch (err) {
    return { error: err }
  }
}

/**
 * Direct unlock for a returnee student by Level 3 or 4 teacher/proctor (no student typing required).
 * Forces the student back into the exam without requiring a token.
 * @param {string} sessionId 
 */
export async function unlockStudentReturnee(sessionId) {
  if (!isSupabaseConfigured || !supabase || !sessionId) return { error: null }
  try {
    const { error } = await supabase
      .from('exam_sessions')
      .update({
        returnee_token_required: false,
        returnee_token: null,
        returnee_reason: null,
        returnee_unlocked_at: new Date().toISOString(),
        last_sync: new Date().toISOString()
      })
      .eq('id', sessionId)

    return { error }
  } catch (err) {
    return { error: err }
  }
}

/**
 * Direct unlock for ALL returnee students in an exam (emergency force-unlock all without token).
 * @param {string} examId 
 */
export async function unlockAllExamReturnees(examId) {
  if (!isSupabaseConfigured || !supabase || !examId) return { error: null }
  try {
    const { error } = await supabase
      .from('exam_sessions')
      .update({
        returnee_token_required: false,
        returnee_token: null,
        returnee_reason: null,
        returnee_unlocked_at: new Date().toISOString(),
        last_sync: new Date().toISOString()
      })
      .eq('exam_id', examId)
      .eq('returnee_token_required', true)

    return { error }
  } catch (err) {
    return { error: err }
  }
}

/**
 * Manually lock an active student session as returnee from Proctor/Monitor.
 * @param {string} sessionId 
 * @param {string} reason 
 */
export async function lockStudentReturnee(sessionId, reason = 'Dikunci oleh pengawas') {
  return markSessionAsReturnee(sessionId, reason)
}

/**
 * Verifies a student's input token against the active central exam token.
 * All locked out students use the 1 central exam token within its duration.
 * 
 * Checks:
 * 1. Has an exam token been generated?
 * 2. Has the token expired (current time > expiresAt)?
 * 3. Does the input token match the exam token (case-insensitive)?
 * 
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {string} params.examId
 * @param {string} params.token
 * @returns {Promise<{ success: boolean, message?: string, error?: string }>}
 */
export async function verifyAndUnlockReturnee({ sessionId, examId, token }) {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Koneksi database offline.' }
  }

  const clean = sanitizeReturneeToken(token)
  if (!clean || clean.length !== 6) {
    return { success: false, error: 'Token harus terdiri dari 6 karakter (angka dan huruf).' }
  }

  try {
    // Fetch session and exam data in parallel
    const [sessRes, examRes] = await Promise.all([
      supabase.from('exam_sessions').select('*').eq('id', sessionId).maybeSingle(),
      supabase.from('exams').select('*').eq('id', examId).maybeSingle()
    ])

    const sess = sessRes.data
    const exam = examRes.data

    if (!sess) {
      return { success: false, error: 'Sesi ujian tidak ditemukan.' }
    }

    if (!exam || !exam.returnee_token) {
      return {
        success: false,
        error: 'Token ujian belum dirilis oleh Pengawas. Silakan hubungi Guru/Pengawas di ruangan ujian.'
      }
    }

    const tokenInfo = getExamTokenInfo(exam)

    // Check if token has expired
    if (tokenInfo.isExpired) {
      return {
        success: false,
        error: `Token ujian telah kadaluarsa (batas waktu ${tokenInfo.duration} detik habis). Minta token baru yang masih aktif kepada Pengawas.`
      }
    }

    // Compare token case-insensitively
    const expectedToken = tokenInfo.token
    if (expectedToken !== clean) {
      return {
        success: false,
        error: 'Token yang dimasukkan salah. Periksa kembali token 6 karakter aktif dari Pengawas.'
      }
    }

    // Token is valid and active! Unlock student session
    const { error: unlockErr } = await supabase
      .from('exam_sessions')
      .update({
        returnee_token_required: false,
        returnee_token: null,
        returnee_unlocked_at: new Date().toISOString(),
        last_sync: new Date().toISOString()
      })
      .eq('id', sessionId)

    if (unlockErr) {
      return { success: false, error: 'Gagal membuka sesi: ' + unlockErr.message }
    }

    return {
      success: true,
      message: 'Token terverifikasi! Anda dapat melanjutkan ujian.'
    }
  } catch (err) {
    console.error('[Returnee] verifyAndUnlockReturnee error:', err)
    return { success: false, error: err.message || 'Terjadi kesalahan saat memverifikasi token.' }
  }
}

/**
 * Backwards compatibility stub for individual student tokens (now deprecated).
 * Directly unlocks student session or sets exam token.
 */
export async function setStudentReturneeToken(sessionId) {
  console.warn('[Returnee] Individual student tokens are deprecated in favor of 1 exam-wide token.')
  return unlockStudentReturnee(sessionId)
}
