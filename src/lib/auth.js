import { supabase } from './supabase'
import { authenticateWithBiometric, clearBiometric } from './biometric'

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
 * Login using device biometric / Face ID / PIN.
 * Verifies the stored credential via WebAuthn, then re-validates the user in Supabase.
 */
export async function loginWithBiometric() {
  // Step 1: Verify biometric (triggers fingerprint/Face ID/PIN prompt)
  const storedUser = await authenticateWithBiometric()

  // Step 2: Re-validate that this user still exists in the database
  const { data: dbUser, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', storedUser.id)
    .single()

  if (error || !dbUser) {
    // User no longer exists — clear biometric data
    clearBiometric()
    throw new Error('Akun tidak ditemukan. Kredensial biometrik telah dihapus.')
  }

  // Step 3: Create session (same as normal login)
  const sessionData = { id: dbUser.id, name: dbUser.name, kelas: dbUser.kelas, role: dbUser.role }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData))
  return sessionData
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
