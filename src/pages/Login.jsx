import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { login, getUserLevel } from '../lib/auth'
import { Eye, EyeOff, AlertCircle, AlertTriangle, LogIn, Loader2 } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [kickoutWarning, setKickoutWarning] = useState(false)

  useEffect(() => {
    try {
      const reason = searchParams.get('reason') || sessionStorage.getItem('binar_kickout_reason')
      if (reason === 'concurrent_session' || reason === 'other_device' || reason === 'other_window') {
        setKickoutWarning(true)
        sessionStorage.removeItem('binar_kickout_reason')
      }
    } catch (e) {}
  }, [searchParams])

  // ─── Form Submit ───
  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await login(username, password)
      navigateByRole(result)
    } catch (err) {
      setError(err.message || 'Login gagal. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Role-Based Redirect (using HRBAC levels from JWT) ───
  function navigateByRole({ role }) {
    switch (role) {
      case 'SUPERADMIN':
        navigate('/admin/dashboard', { replace: true })
        break
      case 'MODERATOR':
        navigate('/teacher/dashboard', { replace: true })
        break
      default:
        navigate('/home', { replace: true })
    }
  }

  return (
    <div className="login-screen">
      {/* Animated background particles */}
      <div className="login-bg-effects">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
      </div>

      <div className="login-card" id="login-card">
        {/* Logo & Branding */}
        <div className="login-header">
          <div className="brand-top-title">
            Sistem Asesmen Terpadu
          </div>
          <div className="login-logo-wrap">
            <img
              src={`${import.meta.env.BASE_URL}Logo_SNT.webp`}
              alt="Logo Sekolah Nasional Terintegrasi 10 Kupang"
              className="login-logo-img"
            />
          </div>
          <h1 className="login-title">
            Sekolah Nasional Terintegrasi 10 Kupang
          </h1>
        </div>

        {kickoutWarning && (
          <div style={{
            marginBottom: '1.25rem',
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            color: '#b91c1c',
            textAlign: 'left'
          }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--danger)' }} />
            <div style={{ fontSize: '0.82rem', lineHeight: 1.45 }}>
              <div style={{ fontWeight: 700, marginBottom: '0.15rem' }}>Sesi Anda Telah Berakhir</div>
              Akun Anda telah login di perangkat atau jendela lain. Akun Siswa &amp; Petugas (Level 1 &amp; 2) dibatasi hanya 1 login aktif dalam satu waktu.
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form" autoComplete="off">
          {/* Username Field */}
          <div className="form-group">
            <label className="form-label" htmlFor="login-input-username">
              Username
            </label>
            <input
              type="text"
              id="login-input-username"
              className="form-input"
              placeholder="Masukkan username Anda"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
              autoFocus
              required
              autoComplete="username"
              spellCheck={false}
            />
          </div>

          {/* Password Field */}
          <div className="form-group">
            <label className="form-label" htmlFor="login-input-password">
              Password
            </label>
            <div className="login-password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                id="login-input-password"
                className="form-input"
                placeholder="Masukkan password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="alert alert-error" id="login-error" role="alert">
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-gold btn-lg login-submit"
            disabled={loading}
            id="login-submit-btn"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="login-spinner" />
                Memverifikasi...
              </>
            ) : (
              <>
                <LogIn size={18} />
                Masuk
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <div>&copy;2026 SNT 10 Kupang. All rights reserved.</div>
          <div>System Engineered &amp; Maintain by Maulana Sulthoni.</div>
        </div>
      </div>
    </div>
  )
}
