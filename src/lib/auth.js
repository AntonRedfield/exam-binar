/**
 * Authentication Module — HRBAC Architecture (Supabase Authentication)
 * 
 * Exclusively uses Supabase Auth with PostgreSQL profiles table.
 * All test/mock database fallbacks have been removed.
 * 
 * User level mapping:
 *   Level 4 = Admin (SUPERADMIN) | Level 3 = Teacher (MODERATOR)
 *   Level 2 = Officer (USER)     | Level 1 = Student/Parent (USER)
 */

import { supabase, isSupabaseConfigured } from './supabase.js'
import {
  registerActiveSession,
  clearActiveSession,
  isSingleSessionEnforced,
  getLocalSessionToken,
  setLocalSessionToken
} from './sessionGuard.js'
import { markActiveSessionsAsReturnee } from './returnee.js'
import { recordLoginAttempt, flushPendingDeviceScan } from './loginAudit.js'
import { isNetworkError, isOffline, getClockProblem } from './network.js'
import { clearOfflineForUser } from './offlineCache.js'

export { isSingleSessionEnforced, getLocalSessionToken, setLocalSessionToken }

// ─── Constants ──────────────────────────────────────────────────────────────

const AUTH_STORAGE_KEY = 'binar_auth_session'
const EMAIL_DOMAIN = 'exam.binar.internal'

// HRBAC Level → human-readable role label
const LEVEL_LABELS = {
  4: 'Admin',
  3: 'Moderator',
  2: 'User',
  1: 'User',
}

// Legacy app role constants (for backward-compat with existing pages)
const LEVEL_TO_APP_ROLE = {
  4: 'SUPERADMIN',
  3: 'MODERATOR',
  2: 'USER',
  1: 'USER',
}

const DB_TO_APP_ROLE = {
  admin: 'SUPERADMIN',
  teacher: 'MODERATOR',
  student: 'USER',
  parent: 'USER',
  officer: 'USER',
  secretary: 'MODERATOR',
}

const APP_TO_DB_ROLE = {
  SUPERADMIN: 'admin',
  MODERATOR: 'teacher',
  USER: 'student',
}

// Auth State Change Listeners
const authListeners = new Set()

function notifyAuthChange(event, session) {
  authListeners.forEach(listener => {
    try {
      listener(event, session)
    } catch (e) {
      console.error('[Auth] Error in listener:', e)
    }
  })
}

// ─── Keep the saved login in sync with supabase-js ──────────────────────────
// supabase-js refreshes the access token roughly every hour. Copy the new
// tokens into our saved login so a reload never resurrects stale tokens, and
// drop the saved login when supabase-js reports the session is really gone.
if (isSupabaseConfigured && supabase && typeof localStorage !== 'undefined') {
  supabase.auth.onAuthStateChange((event, supaSession) => {
    try {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        return
      }
      if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && supaSession?.access_token) {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY)
        if (!raw) return
        const stored = JSON.parse(raw)
        if (!stored?.user?.id || stored.user.id !== supaSession.user?.id) return
        stored.access_token = supaSession.access_token
        stored.refresh_token = supaSession.refresh_token || stored.refresh_token
        if (supaSession.expires_at) stored.expires_at = supaSession.expires_at * 1000
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(stored))
      }
    } catch {
      // Storage unavailable (private mode / quota): nothing to keep in sync
    }
  })
}

// ─── Shadow Email Mapping ───────────────────────────────────────────────────

export function usernameToEmail(username) {
  const clean = username.trim().toLowerCase()
  if (clean.includes('@')) return clean
  return `${clean}@${EMAIL_DOMAIN}`
}

// ─── Metadata Helpers ───────────────────────────────────────────────────────

/**
 * Extract the HRBAC level from a session user object.
 * @param {Object} user — session.user
 * @returns {number} HRBAC level (1–4), defaults to 1
 */
export function getUserLevel(user) {
  const level = user?.app_metadata?.level ?? user?.user_metadata?.level
  return parseInt(level, 10) || 1
}

/**
 * Get the app role string from the user's HRBAC level.
 */
export function getUserRole(user) {
  const level = getUserLevel(user)
  const metadataRole = user?.app_metadata?.role ?? user?.user_metadata?.role
  if (metadataRole) {
    const appRole = DB_TO_APP_ROLE[metadataRole.toLowerCase()]
    if (appRole) return appRole
  }
  return LEVEL_TO_APP_ROLE[level] || 'USER'
}

/**
 * Get a human-readable role label.
 */
export function getRoleLabel(user) {
  const level = getUserLevel(user)
  return LEVEL_LABELS[level] || 'User'
}

// ─── Login ──────────────────────────────────────────────────────────────────

/**
 * True when Supabase never got an answer from the server (status 0):
 * no internet, blocked DNS/VPN/firewall, wrong device clock (TLS fails),
 * data-saver proxy browsers, etc. supabase-js reports these as
 * AuthRetryableFetchError with status 0 instead of throwing.
 * (Transient failures are already retried automatically in network.js.)
 */
function isNetworkAuthError(error) {
  return isNetworkError(error)
}

/** Explain a "could not reach the server" failure in a way a student can act on. */
function networkLoginMessage() {
  const clock = getClockProblem()
  if (clock) {
    const shown = clock.deviceTime.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    return `Tanggal di perangkat ini salah (${shown}), sehingga koneksi aman ke server ditolak. ` +
      'Aktifkan "Tanggal & waktu otomatis" di pengaturan HP, lalu coba login lagi.'
  }
  if (isOffline()) {
    return 'Perangkat tidak terhubung ke internet. Nyalakan data seluler atau Wi-Fi, lalu coba lagi.'
  }
  return 'Tidak dapat terhubung ke server login (kode 0), padahal sistem sudah mencoba ulang otomatis. ' +
    'Periksa sinyal internet, matikan VPN / Private DNS / mode hemat data, atau ganti jaringan ' +
    '(Wi-Fi ↔ data seluler), lalu coba lagi.'
}

const dbRoleForLevel = (lvl) => (lvl === 4 ? 'admin' : (lvl === 3 ? 'teacher' : (lvl === 2 ? 'officer' : 'student')))

// A saved login is kept across reloads for at most this long (the short-lived
// access token itself is refreshed automatically by supabase-js).
const MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Login using username/email + password directly against Supabase Auth.
 * 
 * @param {string} username — raw username (e.g., "mordlicht", "ivan", "7a1")
 * @param {string} password — plaintext password
 * @returns {Promise<Object>} — { user, session, level, role }
 */
export async function login(username, password) {
  if (!username || !username.trim()) {
    throw new Error('Username tidak boleh kosong.')
  }
  if (!password || !password.trim()) {
    throw new Error('Password tidak boleh kosong.')
  }

  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Koneksi Supabase backend belum siap. Periksa konfigurasi .env')
  }

  const cleanUsername = username.trim()
  const cleanPassword = password.trim()
  let email = usernameToEmail(cleanUsername)

  // ── Pre-login resolution via Supabase RPC ──────────────────────────────
  // Resolves identifier (username / student ID / NISN / full name / email).
  // IMPORTANT: We pass p_password: '' so that prepare_student_login does NOT
  // overwrite user passwords with default credentials during identifier resolution.
  let prepResult = null
  let prepNetworkFailed = false
  try {
    const { data: res, error: prepError } = await supabase.rpc('prepare_student_login', {
      p_identifier: cleanUsername,
      p_password: ''
    })
    if (!prepError && res?.found && res?.email) {
      prepResult = res
      email = res.email
    } else if (prepError && isNetworkError(prepError)) {
      prepNetworkFailed = true
    }
  } catch (rpcErr) {
    prepNetworkFailed = isNetworkError(rpcErr)
    console.warn('[Auth] prepare_student_login RPC call skipped or failed:', rpcErr?.message)
  }

  let data = null
  let error = null
  try {
    ({ data, error } = await supabase.auth.signInWithPassword({
      email,
      password: cleanPassword
    }))
  } catch (signInErr) {
    error = signInErr
  }

  if (isNetworkAuthError(error)) {
    const netErr = error
    console.error('[Auth] Network error during sign-in:', netErr)
    // Audit failed login (network error). Sent in the background; it only
    // arrives if the connection recovers.
    recordLoginAttempt({
      identifier: cleanUsername,
      userId: prepResult?.user_id || null,
      fullName: prepResult?.fullname || null,
      role: dbRoleForLevel(prepResult?.role_level),
      roleLevel: prepResult?.role_level || null,
      status: 'failed',
      failureReason: `Jaringan error: ${netErr?.message || 'tidak dapat terhubung ke server'}`,
      metadata: {
        email,
        stage: 'network',
        errorStatus: netErr?.status ?? null,
        online: typeof navigator !== 'undefined' ? navigator.onLine : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        deviceTime: new Date().toISOString(),
        clockBehind: Boolean(getClockProblem()),
      }
    }).catch(() => {})
    throw new Error(networkLoginMessage())
  }

  // If initial sign-in fails, check if this is an uncustomized student/officer account
  // (strictly Level 1 or 2) who needs dynamic default credential synchronization.
  // CRITICAL: We NEVER trigger this fallback for Teachers (Level 3) or Admin (Level 4),
  // ensuring their custom passwords are fully respected and old/default passwords are rejected.
  // Fallback credential sync: ONLY for Students/Officers (Level 1 & 2) who have NOT set a custom password.
  // We must NOT pass the actual password to prepare_student_login for users who already have a
  // custom password — doing so could re-hash and re-sync their credentials incorrectly.
  const isStudentOrOfficer = prepResult?.found && (Number(prepResult?.role_level) === 1 || Number(prepResult?.role_level) === 2)
  const hasCustomPassword = prepResult?.has_custom_password === true
  if (error && isStudentOrOfficer && !hasCustomPassword) {
    try {
      const { data: retryPrep } = await supabase.rpc('prepare_student_login', {
        p_identifier: cleanUsername,
        p_password: cleanPassword
      })
      if (retryPrep?.found) {
        const retryResult = await supabase.auth.signInWithPassword({
          email: retryPrep.email || email,
          password: cleanPassword
        })
        if (!retryResult.error && retryResult.data?.user && retryResult.data?.session) {
          data = retryResult.data
          error = null
        }
      }
    } catch (retryErr) {
      console.warn('[Auth] Student credential sync retry skipped:', retryErr?.message)
    }
  }

  if (error || !data?.user || !data?.session) {
    console.error('[Auth] Sign-in failed:', { email, status: error?.status, code: error?.code, message: error?.message })
    const msg = (error?.message || '').toLowerCase()
    let failureReason = error?.message || 'Kredensial tidak valid'
    if (error?.code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
      failureReason = 'Password atau username salah'
    } else if (error?.status === 429 || msg.includes('rate limit')) {
      failureReason = 'Rate limit: Terlalu banyak percobaan login'
    }

    // Audit failed login (potential account breach or wrong password)
    recordLoginAttempt({
      identifier: cleanUsername,
      userId: prepResult?.user_id || null,
      fullName: prepResult?.fullname || null,
      role: dbRoleForLevel(prepResult?.role_level),
      roleLevel: prepResult?.role_level || null,
      status: 'failed',
      failureReason,
      metadata: { email, errorCode: error?.code, errorStatus: error?.status }
    }).catch(() => {})

    if (error?.code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
      if (prepNetworkFailed) {
        // The account lookup (NISN / full name → account) failed because of the
        // connection, so "wrong password" would be misleading.
        throw new Error('Koneksi tidak stabil saat memeriksa akun Anda. Tunggu sebentar lalu coba login sekali lagi.')
      }
      throw new Error('Username atau password salah. Silakan periksa kembali kredensial Anda.')
    }
    if (error?.status === 429 || msg.includes('rate limit')) {
      throw new Error('Terlalu banyak percobaan login dari jaringan ini. Tunggu 2–5 menit lalu coba lagi.')
    }
    if (isNetworkAuthError(error)) {
      throw new Error(networkLoginMessage())
    }
    throw new Error(`Login gagal: ${error?.message || 'respons server tidak valid'} (kode ${error?.status ?? '-'})`)
  }

  // Fetch the profile and register this device's session AT THE SAME TIME:
  // on a slow link every sequential round trip adds seconds to the login.
  const levelHint = Number(prepResult?.role_level) || Number(data.user.user_metadata?.level) || null
  const profilePromise = supabase
    .from('profiles')
    .select('id, username, display_name, fullname, role_level, class_section')
    .eq('id', data.user.id)
    .maybeSingle()
    .then(res => res, () => ({ data: null }))
  const earlyRegistration = levelHint ? registerActiveSession(data.user.id, levelHint) : null

  const { data: profile } = await profilePromise

  const level = profile?.role_level ?? levelHint ?? 1
  const role = LEVEL_TO_APP_ROLE[level] || 'USER'
  const dbRole = dbRoleForLevel(level)

  const sessionUser = {
    id: data.user.id,
    email: data.user.email || email,
    user_metadata: {
      full_name: profile?.display_name || profile?.fullname || data.user.user_metadata?.full_name || cleanUsername,
      display_name: profile?.display_name || profile?.fullname || data.user.user_metadata?.display_name || cleanUsername,
      role: dbRole,
      kelas: profile?.class_section || data.user.user_metadata?.kelas || '',
      class_id: profile?.class_section || data.user.user_metadata?.class_id || '',
      username: profile?.username || cleanUsername
    },
    app_metadata: {
      role: dbRole,
      level: level,
    }
  }

  // Register active session for Level 1 & 2 users (Level 3 & 4 remain unrestricted).
  // Reuse the early registration unless the real level changes the rule.
  let activeSessionToken
  if (earlyRegistration && isSingleSessionEnforced(levelHint) === isSingleSessionEnforced(level)) {
    activeSessionToken = await earlyRegistration
  } else {
    if (earlyRegistration) await earlyRegistration.catch(() => null)
    activeSessionToken = await registerActiveSession(data.user.id, level)
  }

  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: sessionUser,
    expires_at: data.session.expires_at ? data.session.expires_at * 1000 : Date.now() + 86400000 * 7,
    login_at: Date.now(),
    active_session_token: activeSessionToken,
  }

  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
    // Clear any previous kickout reason on fresh login
    sessionStorage.removeItem('binar_kickout_reason')
  } catch (err) {
    console.error('[Auth] Failed to write session to localStorage:', err)
  }

  const sessionData = {
    user: sessionUser,
    session,
    level,
    role,
  }

  // Audit successful login
  recordLoginAttempt({
    identifier: cleanUsername,
    userId: data.user.id,
    fullName: sessionUser.user_metadata?.full_name || cleanUsername,
    role: dbRole,
    roleLevel: level,
    status: 'success',
    failureReason: null,
    metadata: {
      email: sessionUser.email,
      kelas: sessionUser.user_metadata?.kelas || '',
      sessionToken: activeSessionToken
    }
  }).catch(() => {})

  _syncCurrentUser(sessionData)
  notifyAuthChange('SIGNED_IN', session)
  return sessionData
}

// ─── Logout ─────────────────────────────────────────────────────────────────

// Wait for a background network step, but never longer than `ms`. The request
// itself keeps running and still lands if the connection recovers; logging out
// just doesn't hang on a bad connection.
function settleWithin(promise, ms) {
  return Promise.race([
    Promise.resolve(promise).catch(err => console.warn('[Auth] logout step error:', err?.message || err)),
    new Promise(resolve => setTimeout(resolve, ms)),
  ])
}

export async function logout(reason = null) {
  const currentUser = getCurrentUser()

  const returneeReason = reason === 'split_screen'
    ? 'Terdeteksi Split Screen'
    : reason === 'app_switch'
    ? 'Keluar dari aplikasi ujian terlalu lama'
    : reason === 'other_device'
    ? 'Terdeteksi login di perangkat lain'
    : reason === 'other_window'
    ? 'Terdeteksi membuka tab/jendela lain'
    : 'Logout terdeteksi'

  await Promise.all([
    settleWithin(flushPendingDeviceScan(), 3000),
    // Mark any active exam session as requiring returnee token
    currentUser ? settleWithin(markActiveSessionsAsReturnee(currentUser.id, returneeReason), 8000) : null,
    // Clear active_session_id in DB if voluntary logout
    currentUser && !reason ? settleWithin(clearActiveSession(currentUser.id, currentUser.level), 5000) : null,
  ])

  if (isSupabaseConfigured && supabase) {
    await settleWithin(supabase.auth.signOut(), 5000)
  }

  // Shared devices: the next student must not see this student's cached data.
  // (Unsent exam answers live in IndexedDB and are intentionally kept.)
  if (currentUser) clearOfflineForUser(currentUser.id)

  try {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    if (reason) {
      sessionStorage.setItem('binar_kickout_reason', reason)
    } else {
      sessionStorage.removeItem('binar_kickout_reason')
    }
  } catch (err) {
    console.warn('[Auth] Failed to clear session:', err)
  }
  _syncCurrentUser(null)
  notifyAuthChange('SIGNED_OUT', null)
}

// ─── Session Helpers ────────────────────────────────────────────────────────

/**
 * Get the current Auth session.
 * @returns {Promise<Object|null>} — { user, session, level, role } or null
 */
export async function getSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw)
    if (!session?.user) return null

    // Purge deprecated test user sessions if any exist in browser
    const username = (session.user.user_metadata?.username || session.user.email || '').toLowerCase()
    if (
      username.startsWith('admin1') ||
      username.startsWith('admin2') ||
      username.startsWith('admin3') ||
      username.startsWith('guru-') ||
      username.startsWith('murid-')
    ) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }

    // Expiration. `expires_at` is the ~1 hour access token, which supabase-js
    // refreshes on its own with the refresh token. Signing the student out
    // here (the old behaviour) forced a fresh login on every reload after the
    // first hour — exactly when the connection is often bad. Only drop the
    // saved login when it can't be refreshed, or after MAX_SESSION_AGE_MS.
    const accessExpired = session.expires_at && Date.now() > session.expires_at
    const tooOld = session.login_at && Date.now() - session.login_at > MAX_SESSION_AGE_MS
    if ((accessExpired && !session.refresh_token) || tooOld) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }

    // Ensure Supabase client session is restored in memory if access token exists
    if (isSupabaseConfigured && supabase && session.access_token && session.refresh_token) {
      supabase.auth.getSession().then(({ data: supaSess }) => {
        if (!supaSess?.session) {
          supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token
          }).catch(e => console.warn('[Auth] Background setSession warning:', e?.message))
        }
      }).catch(() => {})
    }

    const level = getUserLevel(session.user)
    const role = getUserRole(session.user)

    return {
      user: session.user,
      session,
      level,
      role,
    }
  } catch (err) {
    console.warn('[Auth] getSession error:', err)
    return null
  }
}

/**
 * Subscribe to auth state changes.
 * 
 * @param {Function} callback — (event, session) => void
 * @returns {Object} — { data: { subscription: { unsubscribe: Function } } }
 */
export function onAuthStateChange(callback) {
  authListeners.add(callback)

  let sbSub = null
  if (isSupabaseConfigured && supabase) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        _syncCurrentUser(null)
        callback('SIGNED_OUT', null)
      }
    })
    sbSub = data?.subscription
  }

  return {
    data: {
      subscription: {
        unsubscribe: () => {
          authListeners.delete(callback)
          if (sbSub) sbSub.unsubscribe()
        }
      }
    }
  }
}

// ─── Profile Fetching ───────────────────────────────────────────────────────

/**
 * Fetch the user's public profile from Supabase.
 * 
 * @param {string} userId — user id
 * @returns {Promise<Object>} — profile row
 */
export async function fetchProfile(userId) {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (data) {
        return {
          id: data.id,
          username: data.username,
          full_name: data.display_name || data.fullname,
          display_name: data.display_name || data.fullname,
          role: data.role_level === 4 ? 'admin' : (data.role_level === 3 ? 'teacher' : (data.role_level === 2 ? 'officer' : 'student')),
          class_section: data.class_section || '',
          kelas: data.class_section || '',
          email: data.email
        }
      }
    } catch (e) {
      console.warn('[Auth] fetchProfile Supabase error:', e)
    }
  }

  return {
    id: userId,
    display_name: 'Pengguna',
    username: 'user',
    role: 'student',
    class_section: ''
  }
}

// ─── Backward-Compatible Sync API ───────────────────────────────────────────

let _currentUser = null

/**
 * Update the internal user cache. Called from App.jsx AuthProvider
 * whenever the session changes.
 */
export function _syncCurrentUser(sessionData) {
  if (!sessionData?.user) {
    _currentUser = null
    return
  }
  const level = getUserLevel(sessionData.user)
  const role = getUserRole(sessionData.user)
  _currentUser = {
    id: sessionData.user.id,
    username: sessionData.user.user_metadata?.username || sessionData.user.email?.replace(/@.*$/, '') || sessionData.user.id,
    name: sessionData.user.user_metadata?.full_name || sessionData.user.email,
    full_name: sessionData.user.user_metadata?.full_name || sessionData.user.email,
    role,
    level,
    dbRole: sessionData.user.app_metadata?.role || role.toLowerCase(),
    kelas: sessionData.user.user_metadata?.kelas || null,
    class_id: sessionData.user.user_metadata?.class_id || null,
  }
}

/**
 * Synchronous getter for the current user. Used by page components.
 * Returns the cached user object or null if not logged in.
 */
export function getCurrentUser() {
  return _currentUser
}

// ─── Legacy Role Mapping ────────────────────────────────────────────────────

export function mapDbRole(dbRole) {
  return DB_TO_APP_ROLE[dbRole] || dbRole?.toUpperCase() || 'USER'
}

export function mapAppRole(appRole) {
  return APP_TO_DB_ROLE[appRole] || appRole?.toLowerCase() || 'student'
}

export function isStudentId(idOrEmail) {
  const user = getCurrentUser()
  if (user && (user.username === idOrEmail || user.id === idOrEmail)) {
    return user.role === 'USER'
  }
  return false
}

/**
 * Stub — passkey status is handled locally.
 */
export async function updatePasskeyStatus() {
  // No-op
}

/**
 * Change the current logged-in user's password directly via Supabase Auth.
 * Works for any authenticated role (Student, Teacher, Admin).
 * 
 * @param {string} newPassword — Plaintext new password (min 6 characters)
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function updateOwnPassword(newPassword) {
  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
    throw new Error('Password baru minimal harus 6 karakter.')
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Koneksi Supabase belum siap. Silakan coba beberapa saat lagi.')
  }

  const cleanPassword = newPassword.trim()

  // 1. Ensure supabase client has active session restored if available in storage
  try {
    const { data: currentSess } = await supabase.auth.getSession()
    if (!currentSess?.session) {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_STORAGE_KEY) : null
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.access_token && parsed?.refresh_token) {
          await supabase.auth.setSession({
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token
          })
        }
      }
    }
  } catch (sessErr) {
    console.warn('[Auth] Error re-establishing Supabase auth session:', sessErr)
  }

  // 2. Update via Supabase GoTrue Auth — this is the ONLY source of truth for the password.
  // IMPORTANT: We do NOT call register_seed_user here anymore.
  // register_seed_user reconstructs the entire auth.users row and wipes the
  // has_custom_password flag from raw_user_meta_data, which causes the
  // prepare_student_login RPC to think the password is still default and
  // allows old/default passwords to be re-synced on the next login attempt.
  let goTrueUpdated = false
  let goTrueError = null
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: cleanPassword,
      data: {
        has_custom_password: true,
        password_updated_at: new Date().toISOString()
      }
    })
    if (!error && data?.user) {
      goTrueUpdated = true
    } else if (error) {
      goTrueError = error
    }
  } catch (gtErr) {
    goTrueError = gtErr
    console.warn('[Auth] supabase.auth.updateUser warning:', gtErr)
  }

  if (!goTrueUpdated) {
    throw new Error(goTrueError?.message || 'Gagal mengubah password. Silakan coba login ulang.')
  }

  // 3. Keep local session storage in sync with updated user metadata
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY)
      if (raw) {
        const session = JSON.parse(raw)
        if (session?.user) {
          session.user.user_metadata = {
            ...session.user.user_metadata,
            has_custom_password: true,
            password_updated_at: new Date().toISOString()
          }
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
        }
      }
    }
  } catch (syncErr) {
    console.warn('[Auth] Error updating cached session metadata:', syncErr)
  }

  return { success: true, message: 'Password berhasil diperbarui!' }
}
