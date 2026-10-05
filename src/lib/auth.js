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

import { supabase, isSupabaseConfigured } from './supabase'

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

  const cleanUsername = username.trim().toLowerCase()
  const cleanPassword = password.trim()
  const email = usernameToEmail(cleanUsername)

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: cleanPassword
  })

  if (error || !data?.user || !data?.session) {
    throw new Error('Username atau password salah. Silakan coba lagi.')
  }

  // Fetch user profile from Supabase profiles table
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle()

  const level = profile?.role_level ?? (data.user.user_metadata?.level ? Number(data.user.user_metadata.level) : 1)
  const role = LEVEL_TO_APP_ROLE[level] || 'USER'
  const dbRole = level === 4 ? 'admin' : (level === 3 ? 'teacher' : (level === 2 ? 'officer' : 'student'))

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

  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: sessionUser,
    expires_at: data.session.expires_at ? data.session.expires_at * 1000 : Date.now() + 86400000 * 7,
  }

  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  } catch (err) {
    console.error('[Auth] Failed to write session to localStorage:', err)
  }

  const sessionData = {
    user: sessionUser,
    session,
    level,
    role,
  }

  _syncCurrentUser(sessionData)
  notifyAuthChange('SIGNED_IN', session)
  return sessionData
}

// ─── Logout ─────────────────────────────────────────────────────────────────

export async function logout() {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.warn('[Auth] Supabase signOut error:', err)
    }
  }

  try {
    localStorage.removeItem(AUTH_STORAGE_KEY)
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

    // Check expiration
    if (session.expires_at && Date.now() > session.expires_at) {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
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
