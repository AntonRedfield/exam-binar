/**
 * Returnee Module — Exam Mode Returnee & Token Management
 * 
 * Rules:
 * - If a student taking an exam is detected logged out (voluntary, kicked by session guard,
 *   closing browser/tab, crash, device change, or any other circumstance) and needs to return:
 *   They MUST input a valid Returnee Token from a Level 3 (Teacher) or Level 4 (Admin) user.
 * - Token format: Exactly 6 characters, numbers (0-9) and lowercase letters (a-z) only.
 * - Level 3 & 4 users can generate tokens automatically (auto-generated) or input them manually.
 */

import { supabase, isSupabaseConfigured } from './supabase.js'

export const RETURNEE_TOKEN_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz'
export const RETURNEE_TOKEN_REGEX = /^[0-9a-z]{6}$/

/**
 * Validates whether a token string is valid (6 alphanumeric lowercase characters).
 * @param {string} token 
 * @returns {boolean}
 */
export function isValidReturneeToken(token) {
  if (!token || typeof token !== 'string') return false
  return RETURNEE_TOKEN_REGEX.test(token.trim().toLowerCase())
}

/**
 * Sanitizes an input string to conform to token format (lowercase, strip invalid characters, max 6 chars).
 * @param {string} input 
 * @returns {string}
 */
export function sanitizeReturneeToken(input) {
  if (!input) return ''
  return String(input)
    .toLowerCase()
    .replace(/[^0-9a-z]/g, '')
    .slice(0, 6)
}

/**
 * Generates a cryptographically random 6-character lowercase alphanumeric token.
 * Example outputs: '7b3x9a', 'k49m12', '0a8z5c'
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
 * Sets or updates the exam-wide returnee token (Level 3 & 4 only).
 * If customToken is provided, it is sanitized and validated.
 * If customToken is not provided or null, a random token is auto-generated.
 * 
 * @param {string} examId 
 * @param {string|null} customToken 
 * @returns {Promise<{ token: string|null, error: Error|null }>}
 */
export async function setExamReturneeToken(examId, customToken = null) {
  if (!isSupabaseConfigured || !supabase || !examId) {
    return { token: null, error: new Error('Database offline atau examId tidak valid') }
  }

  let finalToken = ''
  if (customToken) {
    const sanitized = sanitizeReturneeToken(customToken)
    if (!isValidReturneeToken(sanitized)) {
      return { token: null, error: new Error('Token harus tepat 6 karakter (angka dan huruf kecil saja).') }
    }
    finalToken = sanitized
  } else {
    finalToken = generateReturneeToken()
  }

  try {
    const { error } = await supabase
      .from('exams')
      .update({ returnee_token: finalToken })
      .eq('id', examId)

    if (error) throw error
    return { token: finalToken, error: null }
  } catch (err) {
    console.error('[Returnee] setExamReturneeToken error:', err)
    return { token: null, error: err }
  }
}

/**
 * Clears/removes the exam-wide returnee token.
 * @param {string} examId 
 */
export async function clearExamReturneeToken(examId) {
  if (!isSupabaseConfigured || !supabase || !examId) return { error: null }
  try {
    const { error } = await supabase
      .from('exams')
      .update({ returnee_token: null })
      .eq('id', examId)

    return { error }
  } catch (err) {
    return { error: err }
  }
}

/**
 * Sets or updates an individual student's returnee token (Level 3 & 4 only).
 * If customToken is provided, validates and sets it.
 * If not provided, auto-generates a 6-character token.
 * 
 * @param {string} sessionId 
 * @param {string|null} customToken 
 * @returns {Promise<{ token: string|null, error: Error|null }>}
 */
export async function setStudentReturneeToken(sessionId, customToken = null) {
  if (!isSupabaseConfigured || !supabase || !sessionId) {
    return { token: null, error: new Error('Database offline atau sessionId tidak valid') }
  }

  let finalToken = ''
  if (customToken) {
    const sanitized = sanitizeReturneeToken(customToken)
    if (!isValidReturneeToken(sanitized)) {
      return { token: null, error: new Error('Token harus tepat 6 karakter (angka dan huruf kecil saja).') }
    }
    finalToken = sanitized
  } else {
    finalToken = generateReturneeToken()
  }

  try {
    const { error } = await supabase
      .from('exam_sessions')
      .update({
        returnee_token: finalToken,
        returnee_token_required: true,
        last_sync: new Date().toISOString()
      })
      .eq('id', sessionId)

    if (error) throw error
    return { token: finalToken, error: null }
  } catch (err) {
    console.error('[Returnee] setStudentReturneeToken error:', err)
    return { token: null, error: err }
  }
}

/**
 * Direct unlock for a returnee student by Level 3 or 4 user (no student typing required).
 * @param {string} sessionId 
 */
export async function unlockStudentReturnee(sessionId) {
  if (!isSupabaseConfigured || !supabase || !sessionId) return { error: null }
  try {
    const { error } = await supabase
      .from('exam_sessions')
      .update({
        returnee_token_required: false,
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
 * Manually lock an active student session as returnee from Proctor/Monitor.
 * @param {string} sessionId 
 * @param {string} reason 
 */
export async function lockStudentReturnee(sessionId, reason = 'Dikunci oleh pengawas') {
  return markSessionAsReturnee(sessionId, reason)
}

/**
 * Verifies a student's input token to unlock an active returnee exam session.
 * Checks against both:
 * 1. The individual student session returnee_token
 * 2. The exam-wide returnee_token
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
    return { success: false, error: 'Token harus terdiri dari 6 karakter (angka dan huruf kecil).' }
  }

  try {
    // Fetch session and exam data
    const [sessRes, examRes] = await Promise.all([
      supabase.from('exam_sessions').select('*').eq('id', sessionId).maybeSingle(),
      supabase.from('exams').select('returnee_token').eq('id', examId).maybeSingle()
    ])

    const sess = sessRes.data
    const exam = examRes.data

    if (!sess) {
      return { success: false, error: 'Sesi ujian tidak ditemukan.' }
    }

    const expectedStudentToken = sess.returnee_token ? sanitizeReturneeToken(sess.returnee_token) : null
    const expectedExamToken = exam?.returnee_token ? sanitizeReturneeToken(exam.returnee_token) : null

    // Check if token matches either individual or exam token
    const isStudentMatch = expectedStudentToken && expectedStudentToken === clean
    const isExamMatch = expectedExamToken && expectedExamToken === clean

    if (!isStudentMatch && !isExamMatch) {
      if (!expectedStudentToken && !expectedExamToken) {
        return {
          success: false,
          error: 'Token belum digenerate oleh pengawas (Level 3/4). Silakan hubungi Guru / Admin untuk meminta token.'
        }
      }
      return {
        success: false,
        error: 'Token yang dimasukkan salah. Periksa kembali 6 digit angka dan huruf kecil Anda.'
      }
    }

    // Token is valid! Unlock session
    const { error: unlockErr } = await supabase
      .from('exam_sessions')
      .update({
        returnee_token_required: false,
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
