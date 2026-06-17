import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, loginWithBiometric, isStudentId } from '../lib/auth'
import {
  FastLoginState,
  detectFastLoginState,
  getStoredBiometricUsers,
  clearBiometricForUser,
  getDiagnosticInfo,
} from '../lib/biometric'
import {
  Eye, EyeOff, AlertCircle, Fingerprint, ScanFace, KeyRound,
  User, ChevronRight, ShieldAlert, ShieldX, Info, Trash2, ChevronDown, ChevronUp,
} from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Fast Login state machine
  const [fastLoginState, setFastLoginState] = useState(FastLoginState.CHECKING)
  const [biometricUsers, setBiometricUsers] = useState([])
  const [biometricLoading, setBiometricLoading] = useState(null)
  const [diagnostics, setDiagnostics] = useState(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  const needsPassword = id.trim() !== '' && !isStudentId(id.trim())

  // ─── Detect Fast Login state on mount ───
  const runDetection = useCallback(async () => {
    setFastLoginState(FastLoginState.CHECKING)
    try {
      const result = await detectFastLoginState()
      setFastLoginState(result.state)
      setBiometricUsers(result.users)
      setDiagnostics(result.diagnostics)
      console.info('[FastLogin] State:', result.state, result.diagnostics)
    } catch (err) {
      console.error('[FastLogin] Detection failed:', err)
      setFastLoginState(FastLoginState.UNSUPPORTED_BROWSER)
      setDiagnostics(getDiagnosticInfo())
    }
  }, [])

  useEffect(() => {
    runDetection()
  }, [runDetection])

  // ─── Form Login ───
  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(id, needsPassword ? password : undefined)
      navigateByRole(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── Biometric Login ───
  async function handleBiometricLogin(userId) {
    setError('')
    setBiometricLoading(userId)
    try {
      const user = await loginWithBiometric(userId)
      setFastLoginState(FastLoginState.AUTHENTICATED)
      navigateByRole(user)
    } catch (err) {
      setFastLoginState(FastLoginState.AUTH_FAILED)
      setError(err.message)
      setBiometricLoading(null)
    }
  }

  // ─── Clear stale credentials ───
  function handleClearCredential(userId, e) {
    e.stopPropagation()
    clearBiometricForUser(userId)
    // Re-detect state
    const remaining = getStoredBiometricUsers()
    setBiometricUsers(remaining)
    if (remaining.length === 0) {
      setFastLoginState(FastLoginState.READY_TO_REGISTER)
    }
    setError('')
  }

  function navigateByRole(user) {
    if (user.role === 'SUPERADMIN') navigate('/admin/users')
    else if (user.role === 'TEACHER') navigate('/teacher/exams')
    else navigate('/home')
  }

  const roleLabel = (role) => {
    if (role === 'SUPERADMIN') return 'Admin'
    if (role === 'TEACHER') return 'Guru'
    return 'Siswa'
  }

  // ─── Render helpers ───

  /** Banner for Cases C and D (unsupported states) */
  function renderFastLoginBanner() {
    if (fastLoginState === FastLoginState.UNSUPPORTED_BROWSER) {
      return (
        <div className="fast-login-banner fast-login-banner-warn" id="fast-login-banner-unsupported">
          <ShieldX size={18} className="fast-login-banner-icon" />
          <div>
            <strong>Fast Login tidak tersedia</strong>
            <p>Fast Login tidak didukung di browser ini. Silakan gunakan login manual.</p>
          </div>
        </div>
      )
    }

    if (fastLoginState === FastLoginState.NO_PLATFORM_AUTH) {
      return (
        <div className="fast-login-banner fast-login-banner-info" id="fast-login-banner-no-auth">
          <ShieldAlert size={18} className="fast-login-banner-icon" />
          <div>
            <strong>Fast Login belum bisa digunakan</strong>
            <p>Untuk menggunakan Fast Login, silakan aktifkan PIN, sidik jari, Face ID, atau Windows Hello di pengaturan perangkat Anda terlebih dahulu.</p>
          </div>
        </div>
      )
    }

    return null
  }

  /** Passkey ready — show multi-user biometric list (Case A) */
  function renderBiometricLogin() {
    if (fastLoginState !== FastLoginState.PASSKEY_READY && fastLoginState !== FastLoginState.AUTH_FAILED) {
      return null
    }

    if (biometricUsers.length === 0) return null

    return (
      <>
        <div className="biometric-login-section">
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '0.75rem' }}>
            Login cepat dengan biometrik
          </p>

          <div className="biometric-user-list" id="fast-login-user-list">
            {biometricUsers.map(u => (
              <div key={u.id} className="biometric-user-item-wrap">
                <button
                  className="biometric-user-item"
                  onClick={() => handleBiometricLogin(u.id)}
                  disabled={biometricLoading !== null}
                  id={`fast-login-user-${u.id}`}
                >
                  <div className="biometric-user-avatar">
                    {biometricLoading === u.id
                      ? <div className="spinner" style={{ width: 18, height: 18 }} />
                      : <User size={18} />
                    }
                  </div>
                  <div className="biometric-user-info">
                    <span className="biometric-user-name">{u.name}</span>
                    <span className="biometric-user-role">
                      {roleLabel(u.role)}{u.kelas ? ` · Kelas ${u.kelas}` : ''}
                    </span>
                  </div>
                  <div className="biometric-user-icons">
                    <Fingerprint size={14} />
                    <ScanFace size={13} />
                    <KeyRound size={12} />
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </button>
                <button
                  className="biometric-user-clear"
                  onClick={(e) => handleClearCredential(u.id, e)}
                  title="Hapus kredensial"
                  aria-label={`Hapus kredensial ${u.name}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          <p className="text-muted text-xs" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            Sidik jari, Face ID, atau PIN perangkat
          </p>
        </div>

        <div className="biometric-divider">
          <span>atau login manual</span>
        </div>
      </>
    )
  }

  /** Auth failed state — show error with retry and clear options */
  function renderAuthFailedActions() {
    if (fastLoginState !== FastLoginState.AUTH_FAILED) return null

    return (
      <div className="fast-login-retry-section" id="fast-login-retry">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setFastLoginState(FastLoginState.PASSKEY_READY)
            setError('')
          }}
          style={{ flex: 1 }}
        >
          Coba Lagi
        </button>
      </div>
    )
  }

  /** Diagnostics panel (collapsible) */
  function renderDiagnostics() {
    if (!diagnostics) return null

    // Show diagnostics toggle only when there's an issue
    const showToggle = fastLoginState === FastLoginState.UNSUPPORTED_BROWSER
      || fastLoginState === FastLoginState.NO_PLATFORM_AUTH
      || fastLoginState === FastLoginState.AUTH_FAILED
      || error

    if (!showToggle) return null

    return (
      <div className="fast-login-diagnostics" id="fast-login-diagnostics">
        <button
          className="fast-login-diagnostics-toggle"
          onClick={() => setShowDiagnostics(v => !v)}
        >
          <Info size={13} />
          <span>Informasi Diagnostik</span>
          {showDiagnostics ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {showDiagnostics && (
          <div className="fast-login-diagnostics-content">
            <div className="fast-login-diag-row">
              <span>Browser</span><span>{diagnostics.browser}</span>
            </div>
            <div className="fast-login-diag-row">
              <span>OS</span><span>{diagnostics.os}</span>
            </div>
            <div className="fast-login-diag-row">
              <span>Mode</span><span>{diagnostics.pwaMode === 'standalone' ? 'PWA' : 'Browser'}</span>
            </div>
            <div className="fast-login-diag-row">
              <span>WebAuthn</span>
              <span style={{ color: diagnostics.webAuthnSupported ? 'var(--success)' : 'var(--danger)' }}>
                {diagnostics.webAuthnSupported ? '✓ Didukung' : '✗ Tidak didukung'}
              </span>
            </div>
            <div className="fast-login-diag-row">
              <span>Authenticator</span>
              <span style={{ color: diagnostics.platformAuthAvailable ? 'var(--success)' : 'var(--danger)' }}>
                {diagnostics.platformAuthAvailable === null ? '…' : diagnostics.platformAuthAvailable ? '✓ Tersedia' : '✗ Tidak tersedia'}
              </span>
            </div>
            <div className="fast-login-diag-row">
              <span>Passkey terdaftar</span><span>{diagnostics.registeredUsersCount}</span>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">
          <img src={`${import.meta.env.BASE_URL}binar-logo.png`} alt="BINAR Logo" style={{ height: 160, objectFit: 'contain', marginBottom: '1rem' }} />
          <h2 style={{ fontSize: '1.6rem', marginBottom: '0.25rem' }}>BOLOS</h2>
          <p className="text-muted">(BINAR Online Lecture Operational System)</p>
        </div>

        {/* ─── Fast Login Checking State ─── */}
        {fastLoginState === FastLoginState.CHECKING && (
          <div className="fast-login-checking" id="fast-login-checking">
            <div className="fast-login-skeleton" />
            <div className="fast-login-skeleton fast-login-skeleton-short" />
          </div>
        )}

        {/* ─── Fast Login Banners (Cases C & D) ─── */}
        {renderFastLoginBanner()}

        {/* ─── Biometric Login Section (Case A — Passkey Ready) ─── */}
        {renderBiometricLogin()}

        {/* ─── Auth Failed Retry Actions ─── */}
        {renderAuthFailedActions()}

        {/* ─── Prompt text when no biometric ─── */}
        {(fastLoginState === FastLoginState.READY_TO_REGISTER ||
          fastLoginState === FastLoginState.UNSUPPORTED_BROWSER ||
          fastLoginState === FastLoginState.NO_PLATFORM_AUTH) && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Masukkan ID Anda untuk melanjutkan
          </p>
        )}

        {/* ─── Manual Login Form ─── */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">ID Pengguna</label>
            <input
              type="text"
              className="form-input"
              placeholder="Masukkan ID Anda"
              value={id}
              onChange={e => setId(e.target.value.toLowerCase())}
              autoFocus={fastLoginState !== FastLoginState.PASSKEY_READY}
              required
              id="login-input-id"
            />
          </div>

          {needsPassword && (
            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Masukkan password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ paddingRight: '3rem' }}
                  required
                  id="login-input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{ position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {isStudentId(id.trim()) && id.trim() && (
            <div className="alert alert-info" style={{ fontSize: '0.82rem' }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              Akun siswa tidak memerlukan password — langsung klik Masuk.
            </div>
          )}

          {error && (
            <div className="alert alert-error" id="login-error">
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-gold btn-lg" disabled={loading} style={{ marginTop: '0.5rem' }} id="login-submit-btn">
            {loading ? <><div className="spinner" style={{ width: 20, height: 20 }} /> Memverifikasi...</> : 'Masuk'}
          </button>
        </form>

        {/* ─── Diagnostics (shown on errors) ─── */}
        {renderDiagnostics()}

        <div className="app-footer">
          Dibuat dan Dikembangkan oleh Tim IT BINAR &copy;2025
        </div>
      </div>
    </div>
  )
}
