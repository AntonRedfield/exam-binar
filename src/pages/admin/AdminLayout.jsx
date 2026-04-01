import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { getCurrentUser, logout } from '../../lib/auth'
import { Shield, Users, BookOpen, BarChart2, LogOut } from 'lucide-react'

export default function AdminLayout() {
  const user = getCurrentUser()
  const navigate = useNavigate()

  return (
    <div className="dashboard-layout">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <img src={`${import.meta.env.BASE_URL}binar-logo.png`} alt="BINAR Logo" style={{ height: 80, objectFit: 'contain' }} />
            <h2>BINAR <span style={{ color: '#a78bfa' }}>Admin</span></h2>
          </div>
        </div>
        <div className="sidebar-nav">
          <div className="nav-label">Manajemen</div>
          <NavLink to="/admin/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Users size={18} /> Pengguna
          </NavLink>
          <NavLink to="/admin/exams" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <BookOpen size={18} /> Semua Ujian
          </NavLink>
          <NavLink to="/admin/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <BarChart2 size={18} /> Analitik
          </NavLink>
          <div className="nav-label">Akses Guru</div>
          <NavLink to="/teacher/exams" className="nav-item">
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
      </div>
    </div>
  )
}
