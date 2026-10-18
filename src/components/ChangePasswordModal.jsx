import { useState } from 'react'
import { updateOwnPassword, getCurrentUser } from '../lib/auth'
import { KeyRound, Eye, EyeOff, X, CheckCircle2, AlertCircle } from 'lucide-react'

export default function ChangePasswordModal({ isOpen, onClose }) {
  const currentUser = getCurrentUser()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  if (!isOpen) return null

  function handleClose() {
    setNewPassword('')
    setConfirmPassword('')
    setError('')
    setSuccess('')
    onClose()
  }

  async function handleSubmit(e) {
    e?.preventDefault()
    setError('')
    setSuccess('')

    if (!newPassword || newPassword.trim().length < 6) {
      setError('Password baru minimal harus 6 karakter.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password tidak cocok dengan password baru.')
      return
    }

    setLoading(true)
    try {
      await updateOwnPassword(newPassword)
      setSuccess('Password Anda berhasil diperbarui! Silakan gunakan password baru ini saat login berikutnya.')
      setTimeout(() => {
        handleClose()
      }, 2500)
    } catch (err) {
      setError(err.message || 'Gagal mengubah password. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal" style={{ maxWidth: 440, width: '100%', padding: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              background: 'rgba(223, 174, 52, 0.15)',
              color: '#b48218',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <KeyRound size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Ubah Password Akun</h3>
              <p className="text-muted text-xs" style={{ margin: '0.15rem 0 0 0' }}>
                Akun: <strong style={{ color: '#1b3361' }}>{currentUser?.username || currentUser?.name || 'Pengguna'}</strong>
              </p>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleClose} type="button" aria-label="Tutup">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div style={{
            padding: '1.25rem',
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '10px',
            color: '#15803d',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem'
          }}>
            <CheckCircle2 size={22} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.25rem' }}>Sukses!</div>
              <div style={{ fontSize: '0.85rem', lineHeight: 1.4 }}>{success}</div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {error && (
              <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '0.85rem' }}>{error}</span>
              </div>
            )}

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Password Baru <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Minimal 6 karakter"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ paddingRight: '2.5rem', width: '100%' }}
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0
                  }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Ulangi Password Baru <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Ketik ulang password baru"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{ paddingRight: '2.5rem', width: '100%' }}
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>
              <div className="text-muted text-xs" style={{ marginTop: '0.4rem' }}>
                Gunakan kombinasi huruf dan angka agar password lebih kuat dan aman.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={handleClose}
                disabled={loading}
              >
                Batal
              </button>
              <button
                type="submit"
                className="btn btn-gold"
                style={{ flex: 1, fontWeight: 700 }}
                disabled={loading || !newPassword || !confirmPassword}
              >
                {loading ? 'Menyimpan...' : 'Simpan Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
