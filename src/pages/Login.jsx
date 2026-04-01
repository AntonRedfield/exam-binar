import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, isStudentId } from '../lib/auth'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const needsPassword = id.trim() !== '' && !isStudentId(id.trim())

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(id, needsPassword ? password : undefined)
      if (user.role === 'SUPERADMIN') navigate('/admin/users')
      else if (user.role === 'TEACHER') navigate('/teacher/exams')
      else navigate('/home')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">
          <img src="/binar-logo.png" alt="BINAR Logo" style={{ height: 160, objectFit: 'contain', marginBottom: '1rem' }} />
          <h2 style={{ fontSize: '1.6rem', marginBottom: '0.25rem' }}>BINAR Junior High School</h2>
          <p className="text-muted">Aplikasi Ujian Berbasis Komputer</p>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Masukkan ID Anda untuk melanjutkan
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">ID Pengguna</label>
            <input
              type="text"
              className="form-input"
              placeholder="Masukkan ID Anda"
              value={id}
              onChange={e => setId(e.target.value)}
              autoFocus
              required
            />
          </div>

          {needsPassword && (
            <div className="form-group" style={{ animation: 'modal-in 0.2s ease' }}>
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
