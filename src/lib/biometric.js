/**
 * Biometric Authentication Service — MULTI-USER
 * Supports multiple users registering biometrics on the same device.
 * Uses Web Authentication API (WebAuthn) for fingerprint, Face ID, and PIN/pattern.
 */

const CREDENTIALS_KEY = 'binar_biometric_credentials' // Array of { credentialId, user }
const BIOMETRIC_DISMISSED_KEY = 'binar_biometric_dismissed'

// ─── PWA Detection ──────────────────────────────────────────────────────────

export function isPWA() {
  if (window.navigator.standalone === true) return true
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true
  return false
}

// ─── Capability Detection ───────────────────────────────────────────────────

export async function isBiometricAvailable() {
  if (!window.PublicKeyCredential) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

// ─── Multi-User Credential Storage ──────────────────────────────────────────

/**
 * Get all stored credentials (array of { credentialId, user })
 */
function getAllCredentials() {
  const stored = localStorage.getItem(CREDENTIALS_KEY)
  if (!stored) return []
  try {
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Save the credentials array
 */
function saveAllCredentials(credentials) {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials))
}

/**
 * Check if ANY biometric credentials are stored on this device
 */
export function hasStoredCredential() {
  return getAllCredentials().length > 0
}

/**
 * Check if a specific user has a stored credential
 */
export function hasCredentialForUser(userId) {
  return getAllCredentials().some(c => c.user.id === userId)
}

/**
 * Get all users who have registered biometrics on this device
 * @returns {Array<{id, name, kelas, role}>}
 */
export function getStoredBiometricUsers() {
  return getAllCredentials().map(c => c.user)
}

/**
 * Get the credential entry for a specific user
 */
function getCredentialForUser(userId) {
  return getAllCredentials().find(c => c.user.id === userId) || null
}

/**
 * Clear ALL biometric credentials from this device
 */
export function clearBiometric() {
  localStorage.removeItem(CREDENTIALS_KEY)
  localStorage.removeItem(BIOMETRIC_DISMISSED_KEY)
}

/**
 * Remove biometric credential for a specific user
 */
export function clearBiometricForUser(userId) {
  const credentials = getAllCredentials().filter(c => c.user.id !== userId)
  saveAllCredentials(credentials)
}

/**
 * Mark the biometric prompt as dismissed for this session (per user)
 */
export function dismissBiometricPrompt(userId) {
  const key = `${BIOMETRIC_DISMISSED_KEY}_${userId || 'global'}`
  sessionStorage.setItem(key, 'true')
}

/**
 * Check if user has dismissed the prompt this session
 */
export function isBiometricPromptDismissed(userId) {
  const key = `${BIOMETRIC_DISMISSED_KEY}_${userId || 'global'}`
  return sessionStorage.getItem(key) === 'true'
}

// ─── Helper: ArrayBuffer <-> Base64 ────────────────────────────────────────

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBuffer(base64) {
  let b64 = base64.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) {
    b64 += '='
  }
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// ─── Registration (Enrollment) ──────────────────────────────────────────────

/**
 * Register a biometric credential for the given user.
 * Each user gets their own credential on the same device.
 */
export async function registerBiometric(user) {
  if (!window.PublicKeyCredential) {
    throw new Error('Browser tidak mendukung autentikasi biometrik.')
  }

  // If user already has a credential, update their info
  if (hasCredentialForUser(user.id)) {
    const credentials = getAllCredentials()
    const updated = credentials.map(c =>
      c.user.id === user.id
        ? { ...c, user: { id: user.id, name: user.name, kelas: user.kelas, role: user.role } }
        : c
    )
    saveAllCredentials(updated)
    return true
  }

  const rpId = window.location.hostname
  const rpName = 'BINAR Exam App'
  const userIdBytes = new TextEncoder().encode(user.id)

  // Collect existing credential IDs to exclude (prevent duplicate registration)
  const existingCreds = getAllCredentials()
  const excludeCredentials = existingCreds.map(c => ({
    id: base64ToBuffer(c.credentialId),
    type: 'public-key',
    transports: ['internal']
  }))

  const publicKeyOptions = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: rpName, id: rpId },
    user: {
      id: userIdBytes,
      name: user.id,
      displayName: user.name
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' }
    ],
    excludeCredentials,
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred'
    },
    timeout: 60000,
    attestation: 'none'
  }

  try {
    const credential = await navigator.credentials.create({
      publicKey: publicKeyOptions
    })

    const credentialId = bufferToBase64(credential.rawId)
    const userData = { id: user.id, name: user.name, kelas: user.kelas, role: user.role }

    // Add to the credentials array
    const credentials = getAllCredentials()
    credentials.push({ credentialId, user: userData })
    saveAllCredentials(credentials)

    return true
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Pendaftaran dibatalkan. Silakan coba lagi.')
    }
    if (err.name === 'InvalidStateError') {
      // Credential already exists on the authenticator — save user mapping
      const userData = { id: user.id, name: user.name, kelas: user.kelas, role: user.role }
      const credentials = getAllCredentials()
      credentials.push({ credentialId: 'existing_' + user.id, user: userData })
      saveAllCredentials(credentials)
      return true
    }
    throw new Error('Gagal mendaftarkan biometrik: ' + err.message)
  }
}

// ─── Authentication (Verification) ─────────────────────────────────────────

/**
 * Authenticate a specific user using their stored biometric credential.
 * @param {string} userId — the user ID to authenticate
 * @returns {Promise<Object>} The stored user data { id, name, role, kelas }
 */
export async function authenticateWithBiometric(userId) {
  const entry = getCredentialForUser(userId)
  if (!entry) {
    throw new Error('Tidak ada kredensial biometrik untuk pengguna ini.')
  }

  const rpId = window.location.hostname

  const publicKeyOptions = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rpId,
    userVerification: 'required',
    timeout: 60000
  }

  if (entry.credentialId && !entry.credentialId.startsWith('existing_')) {
    try {
      publicKeyOptions.allowCredentials = [{
        id: base64ToBuffer(entry.credentialId),
        type: 'public-key',
        transports: ['internal']
      }]
    } catch (e) {
      console.warn("Invalid credential ID format, using discoverable credential", e)
    }
  }

  try {
    await navigator.credentials.get({ publicKey: publicKeyOptions })
    return entry.user
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Verifikasi dibatalkan atau gagal. Silakan coba lagi.')
    }
    throw new Error('Gagal memverifikasi: ' + err.message)
  }
}

/**
 * Check if biometric enrollment should be offered for a specific user
 */
export async function shouldOfferBiometric(userId) {
  if (hasCredentialForUser(userId)) return false
  if (isBiometricPromptDismissed(userId)) return false
  const available = await isBiometricAvailable()
  return available
}
