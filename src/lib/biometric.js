/**
 * Biometric Authentication Service — MULTI-USER
 * Supports multiple users registering biometrics on the same device.
 * Uses Web Authentication API (WebAuthn) for fingerprint, Face ID, and PIN/pattern.
 * 
 * Implements a 6-state state machine for reliable Fast Login detection.
 */

const CREDENTIALS_KEY = 'binar_biometric_credentials' // Array of { credentialId, user }
const BIOMETRIC_DISMISSED_KEY = 'binar_biometric_dismissed'

// ─── Fast Login State Machine ───────────────────────────────────────────────

/**
 * State machine states for Fast Login feature.
 * 
 * CHECKING           → Initial state, running async capability checks
 * UNSUPPORTED_BROWSER → Browser does not support WebAuthn at all
 * NO_PLATFORM_AUTH   → WebAuthn supported but no platform authenticator (no PIN/fingerprint/Face ID)
 * READY_TO_REGISTER  → Platform authenticator available, but user has no passkey registered
 * PASSKEY_READY      → Passkey registered, ready to authenticate
 * AUTH_FAILED        → Authentication attempt failed
 * AUTHENTICATED      → Authentication succeeded
 */
export const FastLoginState = {
  CHECKING: 'checking',
  UNSUPPORTED_BROWSER: 'unsupported_browser',
  NO_PLATFORM_AUTH: 'no_platform_auth',
  READY_TO_REGISTER: 'ready_to_register',
  PASSKEY_READY: 'passkey_ready',
  AUTH_FAILED: 'auth_failed',
  AUTHENTICATED: 'authenticated',
}

/**
 * Detect the current Fast Login state by running all necessary checks.
 * @returns {Promise<{state: string, users: Array, diagnostics: Object}>}
 */
export async function detectFastLoginState() {
  const diagnostics = getDiagnosticInfo()

  // State 1: Check if WebAuthn API exists
  if (!window.PublicKeyCredential) {
    console.warn('[FastLogin] WebAuthn API not available')
    return {
      state: FastLoginState.UNSUPPORTED_BROWSER,
      users: [],
      diagnostics,
    }
  }

  // State 2: Check if platform authenticator is available
  try {
    const hasPlatformAuth = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    diagnostics.platformAuthAvailable = hasPlatformAuth

    if (!hasPlatformAuth) {
      console.warn('[FastLogin] No platform authenticator available (no PIN/fingerprint/Face ID)')
      return {
        state: FastLoginState.NO_PLATFORM_AUTH,
        users: [],
        diagnostics,
      }
    }
  } catch (err) {
    console.error('[FastLogin] Error checking platform authenticator:', err)
    return {
      state: FastLoginState.NO_PLATFORM_AUTH,
      users: [],
      diagnostics,
    }
  }

  // State 3 or 4: Check if any credentials are stored locally
  const storedUsers = getStoredBiometricUsers()
  diagnostics.registeredUsersCount = storedUsers.length

  if (storedUsers.length === 0) {
    console.info('[FastLogin] Platform authenticator available, no passkeys registered')
    return {
      state: FastLoginState.READY_TO_REGISTER,
      users: [],
      diagnostics,
    }
  }

  // State 4: Passkey(s) registered and ready
  console.info('[FastLogin] Passkey ready for', storedUsers.length, 'user(s)')
  return {
    state: FastLoginState.PASSKEY_READY,
    users: storedUsers,
    diagnostics,
  }
}

// ─── Diagnostic Info ────────────────────────────────────────────────────────

/**
 * Get diagnostic information for debugging cross-platform issues.
 * @returns {Object} Diagnostic data
 */
export function getDiagnosticInfo() {
  const ua = navigator.userAgent || ''
  const uaData = navigator.userAgentData || null

  // Detect browser
  let browser = 'Unknown'
  if (uaData?.brands) {
    const brand = uaData.brands.find(b => 
      b.brand !== 'Not_A Brand' && b.brand !== 'Chromium' && !b.brand.startsWith('Not')
    )
    if (brand) browser = `${brand.brand} ${brand.version}`
    else if (uaData.brands.find(b => b.brand === 'Chromium')) browser = 'Chromium-based'
  } else if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome'
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari'
  else if (ua.includes('Firefox/')) browser = 'Firefox'

  // Detect OS
  let os = 'Unknown'
  if (uaData?.platform) os = uaData.platform
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  else if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac')) os = 'macOS'
  else if (ua.includes('Linux')) os = 'Linux'

  return {
    browser,
    os,
    pwaMode: isPWA() ? 'standalone' : 'browser',
    webAuthnSupported: !!window.PublicKeyCredential,
    platformAuthAvailable: null, // filled by detectFastLoginState
    registeredUsersCount: getAllCredentials().length,
    timestamp: new Date().toISOString(),
  }
}

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

// ─── WebAuthn Error Handling ────────────────────────────────────────────────

/**
 * Map WebAuthn errors to user-friendly Indonesian messages.
 * @param {Error} err — The caught error
 * @param {'register'|'authenticate'} context — Whether this was during registration or auth
 * @returns {string} User-friendly error message
 */
export function mapWebAuthnError(err, context = 'authenticate') {
  const name = err?.name || ''
  const message = err?.message || ''

  console.error(`[FastLogin] WebAuthn ${context} error:`, { name, message, err })

  switch (name) {
    case 'NotAllowedError':
      if (context === 'register') {
        return 'Pendaftaran dibatalkan. Silakan coba lagi.'
      }
      return 'Verifikasi dibatalkan atau gagal. Silakan coba lagi.'

    case 'InvalidStateError':
      if (context === 'register') {
        return 'Biometrik sudah terdaftar untuk akun ini.'
      }
      return 'Kredensial tidak valid. Silakan hapus dan daftar ulang biometrik.'

    case 'SecurityError':
      return 'Keamanan perangkat tidak dikonfigurasi. Silakan aktifkan PIN, sidik jari, atau Face ID di pengaturan perangkat Anda.'

    case 'AbortError':
      return 'Verifikasi dibatalkan. Silakan coba lagi.'

    case 'NotSupportedError':
      return 'Metode autentikasi tidak didukung oleh perangkat ini.'

    case 'ConstraintError':
      return 'Perangkat tidak memenuhi persyaratan keamanan untuk Fast Login.'

    default:
      return `Terjadi kesalahan: ${message || name || 'Unknown error'}`
  }
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

  // Check platform authenticator before attempting registration
  const hasPlatform = await isBiometricAvailable()
  if (!hasPlatform) {
    throw new Error('Keamanan perangkat tidak dikonfigurasi. Silakan aktifkan PIN, sidik jari, atau Face ID terlebih dahulu.')
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
    console.info('[FastLogin] Updated existing credential info for user:', user.id)
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

    console.info('[FastLogin] Successfully registered biometric for user:', user.id)
    return true
  } catch (err) {
    if (err.name === 'InvalidStateError') {
      // Credential already exists on the authenticator — save user mapping
      const userData = { id: user.id, name: user.name, kelas: user.kelas, role: user.role }
      const credentials = getAllCredentials()
      credentials.push({ credentialId: 'existing_' + user.id, user: userData })
      saveAllCredentials(credentials)
      console.info('[FastLogin] Credential already existed on authenticator, mapped user:', user.id)
      return true
    }
    throw new Error(mapWebAuthnError(err, 'register'))
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

  // Pre-check: is platform authenticator still available?
  const hasPlatform = await isBiometricAvailable()
  if (!hasPlatform) {
    throw new Error('Keamanan perangkat tidak lagi tersedia. Silakan periksa pengaturan PIN/sidik jari/Face ID.')
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
      console.warn('[FastLogin] Invalid credential ID format, using discoverable credential', e)
    }
  }

  try {
    await navigator.credentials.get({ publicKey: publicKeyOptions })
    console.info('[FastLogin] Authentication successful for user:', userId)
    return entry.user
  } catch (err) {
    throw new Error(mapWebAuthnError(err, 'authenticate'))
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
