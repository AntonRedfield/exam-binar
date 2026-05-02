import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, loginWithBiometric, isStudentId } from '../lib/auth'
import { isBiometricAvailable, hasStoredCredential, getStoredBiometricUsers } from '../lib/biometric'
import { Eye, EyeOff, AlertCircle, Fingerprint, ScanFace, KeyRound, User, ChevronRight } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricUsers, setBiometricUsers] = useState([])
  const [biometricLoading, setBiometricLoading] = useState(null) // userId being verified

  const needsPassword = id.trim() !== '' && !isStudentId(id.trim())

  // Check if biometric login is available on mount
  useEffect(() => {
    async function checkBiometric() {
      if (hasStoredCredential()) {
        const available = await isBiometricAvailable()
        if (available) {
          setBiometricAvailable(true)
          setBiometricUsers(getStoredBiometricUsers())
        }
      }
    }
    checkBiometric()
  }, [])

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

  async function handleBiometricLogin(userId) {
    setError('')
    setBiometricLoading(userId)
    try {
      const user = await loginWithBiometric(userId)
      navigateByRole(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBiometricLoading(null)
    }
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

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">
          <img src={`${import.meta.env.BASE_URL}binar-logo.png`} alt="BINAR Logo" style={{ height: 160, objectFit: 'contain', marginBottom: '1rem' }} />
          <h2 style={{ fontSize: '1.6rem', marginBottom: '0.25rem' }}>BINAR Junior High School</h2>
          <p className="text-muted">Aplikasi Ujian Berbasis Komputer</p>
        </div>

        {/* ─── Biometric Login Section (Multi-User) ─── */}
        {biometricAvailable && biometricUsers.length > 0 && (
          <>
            <div className="biometric-login-section">
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '0.75rem' }}>
                Login cepat dengan biometrik
              </p>

              <div className="biometric-user-list">
                {biometricUsers.map(u => (
                  <button
                    key={u.id}
                    className="biometric-user-item"
                    onClick={() => handleBiometricLogin(u.id)}
                    disabled={biometricLoading !== null}
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
        )}

        {!biometricAvailable && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Masukkan ID Anda untuk melanjutkan
          </p>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">ID Pengguna</label>
            <input
              type="text"
              className="form-input"
              placeholder="Masukkan ID Anda"
              value={id}
              onChange={e => setId(e.target.value.toLowerCase())}
              autoFocus={!biometricAvailable}
              required
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
            <div className="alert alert-error">
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-gold btn-lg" disabled={loading} style={{ marginTop: '0.5rem' }}>
            {loading ? <><div className="spinner" style={{ width: 20, height: 20 }} /> Memverifikasi...</> : 'Masuk'}
          </button>
        </form>

        <p className="text-muted text-xs" style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          BINAR Examination System &copy; 2025 &mdash; Semua aktivitas dimonitor
        </p>
      </div>
    </div>
  )
}
