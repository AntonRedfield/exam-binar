import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getCurrentUser, logout } from '../../lib/auth'
import { BookOpen, Plus, Activity, BarChart2, LogOut, KeyRound, Users, Menu, LayoutDashboard } from 'lucide-react'
import BiometricPrompt from '../../components/BiometricPrompt'
import ChangePasswordModal from '../../components/ChangePasswordModal'

export default function TeacherLayout() {
  const user = getCurrentUser()
  const navigate = useNavigate()
  
  const [showModal, setShowModal] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function navClick() { setSidebarOpen(false) }

  return (
    <div className="dashboard-layout">
      <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)}>
        <Menu size={20} />
      </button>
      <div className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)} />
      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo" style={{ padding: '1rem 0.75rem', textAlign: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1b3361', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              Sistem Asesmen Terpadu
            </span>
            <img
              src={`${import.meta.env.BASE_URL}Logo_SNT.webp`}
              alt="Logo SNT 10 Kupang"
              style={{
                height: 60,
                width: 60,
                objectFit: 'contain',
                background: '#ffffff',
                borderRadius: '14px',
                padding: '4px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                border: '1px solid rgba(27, 51, 97, 0.1)'
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1b3361' }}>SNT 10 Kupang</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#dfae34', background: 'rgba(223, 174, 52, 0.15)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Guru</span>
            </div>
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
          <NavLink to="/teacher/monitor" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={navClick}>
            <Activity size={18} /> Monitor Siswa (Live)
          </NavLink>
          <NavLink to="/teacher/exams" className="nav-item" onClick={navClick}>
            <BarChart2 size={18} /> Hasil Ujian
          </NavLink>
        </div>

        <div className="sidebar-footer">
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>{user?.name}</div>
          <div className="text-muted text-xs" style={{ marginBottom: '0.75rem' }}>Guru</div>
          
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
        <div className="app-footer">
          <div>&copy;2026 SNT 10 Kupang. All rights reserved.</div>
          <div>System Engineered &amp; Maintain by Maulana Sulthoni.</div>
        </div>
      </div>

      <BiometricPrompt />
      <ChangePasswordModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </div>
  )
}

