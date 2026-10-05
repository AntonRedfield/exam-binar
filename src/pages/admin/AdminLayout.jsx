import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getCurrentUser, logout } from '../../lib/auth'
import { Shield, Users, BookOpen, BarChart2, LogOut, Menu, LayoutDashboard } from 'lucide-react'
import BiometricPrompt from '../../components/BiometricPrompt'

export default function AdminLayout() {
  const user = getCurrentUser()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
            <img src={`${import.meta.env.BASE_URL}logo-snt.png`} alt="Logo SNT 10 Kupang" style={{ height: 60, width: 60, objectFit: 'contain' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1b3361' }}>SNT 10 Kupang</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#dfae34', background: 'rgba(223, 174, 52, 0.15)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Admin</span>
            </div>
          </div>
        </div>
        <div className="sidebar-nav">
          <NavLink to="/admin/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={navClick}>
            <LayoutDashboard size={18} /> Dashboard
          </NavLink>
          <div className="nav-label">Manajemen</div>
          <NavLink to="/admin/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={navClick}>
            <Users size={18} /> Pengguna
          </NavLink>
          <NavLink to="/admin/exams" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={navClick}>
            <BookOpen size={18} /> Semua Ujian
          </NavLink>
          <NavLink to="/admin/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={navClick}>
            <BarChart2 size={18} /> Analitik
          </NavLink>
          <div className="nav-label">Akses Guru</div>
          <NavLink to="/teacher/exams" className="nav-item" onClick={navClick}>
            <BookOpen size={18} /> Dashboard Guru
          </NavLink>
        </div>
        <div className="sidebar-footer">
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.25rem' }}>{user?.name}</div>
          <div className="text-muted text-xs" style={{ marginBottom: '0.75rem' }}>Superadmin</div>
          <button className="btn btn-ghost btn-sm w-full" onClick={() => { logout(); navigate('/login') }}>
            <LogOut size={14} /> Keluar
          </button>
        </div>
      </nav>
      <div className="main-content">
        <Outlet />
        <div className="app-footer">
          Sistem Asesmen Terpadu SNT 10 Kupang &copy;{new Date().getFullYear()}
        </div>
      </div>
      <BiometricPrompt />
    </div>
  )
}
