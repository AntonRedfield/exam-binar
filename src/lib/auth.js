import { supabase } from './supabase'
import { authenticateWithBiometric, clearBiometricForUser } from './biometric'

const SESSION_KEY = 'binar_user'

/**
 * Determine if this ID is a student (ID-only login, no password required)
 */
export function isStudentId(id) {
  return id.endsWith('@murid.binar')
}

export function isParentId(id) {
  return id.endsWith('@partner.binar')
}

/**
 * Login: ID-only for students, ID+password for teachers/admins
 */
export async function login(id, password) {
  const trimmedId = id.trim()

  // Query user from Supabase
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', trimmedId)
    .single()

  if (error || !user) {
    throw new Error('ID tidak ditemukan. Periksa kembali ID Anda.')
  }

  // Parents have no exam access
  if (isParentId(trimmedId)) {
    throw new Error('Akun wali murid tidak memiliki akses ke sistem ujian.')
  }

  // Students: ID-only (no password check)
  if (isStudentId(trimmedId)) {
    const sessionData = { id: user.id, name: user.name, kelas: user.kelas, role: user.role }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData))
    return sessionData
  }

  // Teachers & Admins: require password
  if (!password || password.trim() === '') {
    throw new Error('Password diperlukan untuk akun guru/admin.')
  }

  if (user.password !== password.trim()) {
    throw new Error('Password salah. Silakan coba lagi.')
  }

  const sessionData = { id: user.id, name: user.name, kelas: user.kelas, role: user.role }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData))
  return sessionData
}

/**
 * Login using device biometric / Face ID / PIN for a specific user.
 * @param {string} userId — the user ID to authenticate
 */
export async function loginWithBiometric(userId) {
  // Step 1: Verify biometric for this specific user
  const storedUser = await authenticateWithBiometric(userId)

  // Step 2: Re-validate that this user still exists in the database
  const { data: dbUser, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', storedUser.id)
    .single()

  if (error || !dbUser) {
    clearBiometricForUser(storedUser.id)
    throw new Error('Akun tidak ditemukan. Kredensial biometrik telah dihapus.')
  }

  // Step 3: Self-heal — if Supabase doesn't know about the passkey, update it
  if (!dbUser.has_passkey) {
    await updatePasskeyStatus(dbUser.id, true).catch(err => {
      console.warn('[FastLogin] Failed to self-heal passkey status:', err)
    })
  }

  // Step 4: Create session
  const sessionData = { id: dbUser.id, name: dbUser.name, kelas: dbUser.kelas, role: dbUser.role }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData))
  return sessionData
}

/**
 * Update the passkey registration status for a user in Supabase.
 * @param {string} userId — The user ID
 * @param {boolean} hasPasskey — Whether the user has a passkey registered
 */
export async function updatePasskeyStatus(userId, hasPasskey) {
  const updateData = { has_passkey: hasPasskey }
  if (hasPasskey) {
    updateData.passkey_registered_at = new Date().toISOString()
  } else {
    updateData.passkey_registered_at = null
  }

  const { error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', userId)

  if (error) {
    console.error('[FastLogin] Failed to update passkey status:', error)
    throw error
  }

  console.info('[FastLogin] Updated passkey status for', userId, '→', hasPasskey)
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY)
}

export function getCurrentUser() {
  const stored = sessionStorage.getItem(SESSION_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}
