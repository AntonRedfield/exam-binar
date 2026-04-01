/**
 * Biometric Authentication Service
 * Uses Web Authentication API (WebAuthn) for fingerprint, Face ID, and PIN/pattern.
 * The OS/browser decides which method to offer based on device capabilities.
 */

const CREDENTIAL_KEY = 'binar_biometric_credential'
const BIOMETRIC_USER_KEY = 'binar_biometric_user'
const BIOMETRIC_DISMISSED_KEY = 'binar_biometric_dismissed'

// ─── PWA Detection ──────────────────────────────────────────────────────────

/**
 * Check if the app is running as an installed PWA (standalone mode)
 */
export function isPWA() {
  // iOS Safari standalone
  if (window.navigator.standalone === true) return true
  // Standard media query for standalone display
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // Chrome on Android sometimes uses 'minimal-ui' or 'fullscreen'
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true
  return false
}

// ─── Capability Detection ───────────────────────────────────────────────────

/**
 * Check if the device supports WebAuthn platform authenticator
 * (fingerprint, Face ID, Windows Hello, PIN, pattern, etc.)
 */
export async function isBiometricAvailable() {
  // Check basic WebAuthn support
  if (!window.PublicKeyCredential) return false

  try {
    // Check if platform authenticator (built-in biometric/PIN) is available
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    return available
  } catch {
    return false
  }
}

// ─── Credential Storage ─────────────────────────────────────────────────────

/**
 * Check if a biometric credential is registered on this device
 */
export function hasStoredCredential() {
  return localStorage.getItem(CREDENTIAL_KEY) !== null
}

/**
 * Get the user data associated with the stored biometric credential
 */
export function getStoredBiometricUser() {
  const stored = localStorage.getItem(BIOMETRIC_USER_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

/**
 * Clear biometric credential from this device
 */
export function clearBiometric() {
  localStorage.removeItem(CREDENTIAL_KEY)
  localStorage.removeItem(BIOMETRIC_USER_KEY)
  localStorage.removeItem(BIOMETRIC_DISMISSED_KEY)
}

/**
 * Mark the biometric prompt as dismissed for this session
 */
export function dismissBiometricPrompt() {
  sessionStorage.setItem(BIOMETRIC_DISMISSED_KEY, 'true')
}

/**
 * Check if user has dismissed the prompt this session
 */
export function isBiometricPromptDismissed() {
  return sessionStorage.getItem(BIOMETRIC_DISMISSED_KEY) === 'true'
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
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// ─── Registration (Enrollment) ──────────────────────────────────────────────

/**
 * Register a biometric credential for the given user.
 * This triggers the OS's biometric/Face ID/PIN prompt.
 * 
 * @param {Object} user - { id, name, role, kelas }
 * @returns {Promise<boolean>} true if registration succeeded
 */
export async function registerBiometric(user) {
  if (!window.PublicKeyCredential) {
    throw new Error('Browser tidak mendukung autentikasi biometrik.')
  }

  const rpId = window.location.hostname
  const rpName = 'BINAR Exam App'

  // Create a unique user handle from the user ID
  const userIdBytes = new TextEncoder().encode(user.id)

  const publicKeyOptions = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: {
      name: rpName,
      id: rpId
    },
    user: {
      id: userIdBytes,
      name: user.id,
      displayName: user.name
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },   // ES256
      { alg: -257, type: 'public-key' }  // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',   // Built-in only (fingerprint, Face ID, PIN)
      userVerification: 'required',          // Must verify identity (biometric, PIN, pattern)
      residentKey: 'preferred'
    },
    timeout: 60000,
    attestation: 'none'   // We don't need attestation for our use case
  }

  try {
    const credential = await navigator.credentials.create({
      publicKey: publicKeyOptions
    })

    // Store the credential ID so we can reference it during authentication
    const credentialId = bufferToBase64(credential.rawId)
    localStorage.setItem(CREDENTIAL_KEY, credentialId)

    // Store the user info associated with this credential
    const userData = { id: user.id, name: user.name, kelas: user.kelas, role: user.role }
    localStorage.setItem(BIOMETRIC_USER_KEY, JSON.stringify(userData))

    return true
  } catch (err) {
    // User cancelled or error
    if (err.name === 'NotAllowedError') {
      throw new Error('Pendaftaran dibatalkan. Silakan coba lagi.')
    }
    if (err.name === 'InvalidStateError') {
      // Credential already exists — that's fine, update user data
      const userData = { id: user.id, name: user.name, kelas: user.kelas, role: user.role }
      localStorage.setItem(BIOMETRIC_USER_KEY, JSON.stringify(userData))
      return true
    }
    throw new Error('Gagal mendaftarkan biometrik: ' + err.message)
  }
}

// ─── Authentication (Verification) ─────────────────────────────────────────

/**
 * Authenticate using the stored biometric credential.
 * This triggers the OS's biometric/Face ID/PIN prompt.
 * 
 * @returns {Promise<Object>} The stored user data { id, name, role, kelas }
 */
export async function authenticateWithBiometric() {
  const credentialIdBase64 = localStorage.getItem(CREDENTIAL_KEY)
  if (!credentialIdBase64) {
    throw new Error('Tidak ada kredensial biometrik tersimpan di perangkat ini.')
  }

  const credentialId = base64ToBuffer(credentialIdBase64)
  const rpId = window.location.hostname

  const publicKeyOptions = {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rpId: rpId,
    allowCredentials: [{
      id: credentialId,
      type: 'public-key',
      transports: ['internal']
    }],
    userVerification: 'required',   // Require biometric/PIN/pattern verification
    timeout: 60000
  }

  try {
    await navigator.credentials.get({
      publicKey: publicKeyOptions
    })

    // If we got here, biometric/PIN verification succeeded
    const userData = getStoredBiometricUser()
    if (!userData) {
      throw new Error('Data pengguna tidak ditemukan. Silakan login ulang.')
    }

    return userData
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Verifikasi dibatalkan atau gagal. Silakan coba lagi.')
    }
    throw new Error('Gagal memverifikasi: ' + err.message)
  }
}

/**
 * Check if biometric enrollment should be offered
 * (device supports it + no existing credential + not dismissed)
 * Works in any secure context (HTTPS or localhost), not just PWA mode.
 */
export async function shouldOfferBiometric() {
  if (hasStoredCredential()) return false
  if (isBiometricPromptDismissed()) return false
  
  const available = await isBiometricAvailable()
  return available
}
