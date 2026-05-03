import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getCurrentUser, logout } from '../../lib/auth'
import { users } from '../../lib/db'
import { BookOpen, Plus, Activity, BarChart2, LogOut, KeyRound, X, Save, Users, Menu, LayoutDashboard } from 'lucide-react'
import BiometricPrompt from '../../components/BiometricPrompt'

export default function TeacherLayout() {
  const user = getCurrentUser()
  const navigate = useNavigate()
  
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ newPass: '', confirmPass: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  async function handleChangePassword() {
    setError(''); setSuccess('')
    if (!form.newPass.trim()) return setError('Password baru tidak boleh kosong.')
    if (form.newPass !== form.confirmPass) return setError('Konfirmasi password tidak cocok.')
    
    setSaving(true)
    try {
      await users.update(user.id, { password: form.newPass })
      setSuccess('Password berhasil diubah. Silakan gunakan password baru saat login berikutnya.')
      setTimeout(() => {
        setShowModal(false)
        setForm({ newPass: '', confirmPass: '' })
        setSuccess('')
      }, 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function navClick() { setSidebarOpen(false) }

  return (
    <div className="dashboard-layout">
      <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)}>
        <Menu size={20} />
      </button>
      <div className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)} />
      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <img src={`${import.meta.env.BASE_URL}binar-logo.png`} alt="BINAR Logo" style={{ height: 80, objectFit: 'contain' }} />
            <h2>BINAR <span className="logo-accent">Guru</span></h2>
          </div>
        </div>

        <div className="sidebar-nav">
          <NavLink to="/teacher/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={navClick}>
            <LayoutDashboard size={18} /> Dashboard
          </NavLink>
          <div className="nav-label">Ujian</div>
          <NavLink to="/teacher/exams" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={navClick}>
            <BookOpen size={18} /> Daftar Ujian
          </NavLink>
          <NavLink to="/teacher/create" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={navClick}>
            <Plus size={18} /> Buat Ujian
          </NavLink>

          <div className="nav-label">Siswa</div>
          <NavLink to="/teacher/students" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={navClick}>
            <Users size={18} /> Kelola Siswa
          </NavLink>

          <div className="nav-label">Monitoring</div>
          <NavLink to="/teacher/exams" className="nav-item" onClick={navClick}>
            <Activity size={18} /> Monitor Siswa
          </NavLink>
          <NavLink to="/teacher/exams" className="nav-item" onClick={navClick}>
            <BarChart2 size={18} /> Hasil Ujian
          </NavLink>
        </div>

        <div className="sidebar-footer">
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>{user?.name}</div>
          <div className="text-muted text-xs" style={{ marginBottom: '0.75rem' }}>{user?.id}</div>
          
          <button className="btn btn-ghost btn-sm w-full" style={{ marginBottom: '0.5rem', justifyContent: 'flex-start' }} onClick={() => setShowModal(true)}>
            <KeyRound size={14} style={{ marginRight: '0.5rem' }} /> Ubah Password
          </button>
          <button className="btn btn-ghost btn-sm w-full" style={{ color: 'var(--danger)', justifyContent: 'flex-start' }} onClick={handleLogout}>
            <LogOut size={14} style={{ marginRight: '0.5rem' }} /> Keluar
          </button>
        </div>
      </nav>
      <div className="main-content">
        <Outlet />
      </div>

      <BiometricPrompt />

      {showModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h3>Ubah Password</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={15} /></button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {success ? (
                <div className="alert alert-success">{success}</div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Password Baru</label>
                    <input 
                      type="password" 
                      className="form-input" 
                      placeholder="Masukkan password baru"
                      value={form.newPass}
                      onChange={e => setForm(f => ({ ...f, newPass: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Konfirmasi Password Baru</label>
                    <input 
                      type="password" 
                      className="form-input" 
                      placeholder="Ketik ulang password baru"
                      value={form.confirmPass}
                      onChange={e => setForm(f => ({ ...f, confirmPass: e.target.value }))}
                    />
                  </div>
                  
                  {error && <div className="alert alert-error">{error}</div>}
                  
                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Batal</button>
                    <button className="btn btn-gold" style={{ flex: 1 }} onClick={handleChangePassword} disabled={saving}>
                      {saving ? 'Menyimpan...' : <><Save size={14} /> Simpan</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
