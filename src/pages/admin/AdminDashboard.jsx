import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { getCurrentUser } from '../../lib/auth'
import { Users, BookOpen, BarChart2, Activity, Plus, ArrowRight, AlertTriangle, GraduationCap, TrendingUp, School } from 'lucide-react'

export default function AdminDashboard() {
  const user = getCurrentUser()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [recentExams, setRecentExams] = useState([])
  const [classBreakdown, setClassBreakdown] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [
        { count: totalUsers },
        { count: totalTeachers },
        { count: totalExams },
        { count: totalSessions },
        { count: activeExams },
        { data: recentResults },
        { data: latestExams }
      ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'USER'),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'TEACHER'),
        supabase.from('exams').select('*', { count: 'exact', head: true }),
        supabase.from('exam_sessions').select('*', { count: 'exact', head: true }),
        supabase.from('exams').select('*', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('results').select('auto_score, max_auto_score, violation_count').limit(200),
        supabase.from('exams').select('*, users(name)').order('created_at', { ascending: false }).limit(5),
      ])

      // Fetch class breakdown
      const { data: allStudents } = await supabase.from('users').select('kelas').eq('role', 'USER')
      const classMap = {}
      if (allStudents) {
        allStudents.forEach(s => {
          const k = s.kelas || 'Tanpa Kelas'
          classMap[k] = (classMap[k] || 0) + 1
        })
      }
      const classSorted = Object.entries(classMap)
        .sort(([a], [b]) => a.localeCompare(b, 'id', { numeric: true }))
        .map(([name, count]) => ({ name, count }))
      setClassBreakdown(classSorted)

      let avgScore = 0
      let totalViolations = 0
      const distrib = [0, 0, 0, 0, 0]
      if (recentResults?.length) {
        const pcts = recentResults.map(r => r.max_auto_score > 0 ? (r.auto_score / r.max_auto_score) * 100 : 0)
        avgScore = (pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1)
        totalViolations = recentResults.reduce((sum, r) => sum + (r.violation_count || 0), 0)
        recentResults.forEach(r => {
          const pct = r.max_auto_score > 0 ? (r.auto_score / r.max_auto_score) * 100 : 0
          const idx = Math.min(4, Math.floor(pct / 20))
          distrib[idx]++
        })
      }

      setStats({ totalUsers, totalTeachers, totalExams, totalSessions, activeExams, avgScore, totalViolations, distrib })
      setRecentExams(latestExams || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading-screen"><div className="spinner" style={{ width: 32, height: 32 }} /></div>

  const maxBar = Math.max(...stats.distrib, 1)
  const distribLabels = ['0–20', '20–40', '40–60', '60–80', '80–100']
  const distribColors = ['#EF4444', '#F59E0B', '#F59E0B', '#10B981', '#4F8EF7']

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Selamat Pagi'
    if (h < 15) return 'Selamat Siang'
    if (h < 18) return 'Selamat Sore'
    return 'Selamat Malam'
  })()

  return (
    <>
      <div className="page-header">
        <h2>{greeting}, {user?.name || 'Admin'} 👋</h2>
        <p className="text-muted text-sm">Ringkasan sistem ujian BINAR</p>
      </div>
      <div className="page-body">

        {/* ── Summary Stats ─────────────────────────────── */}
        <div className="stat-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { label: 'Total Siswa', value: stats.totalUsers, color: 'var(--accent)', icon: <GraduationCap size={22} /> },
            { label: 'Total Guru', value: stats.totalTeachers, color: 'var(--gold-darker)', icon: <Users size={22} /> },
            { label: 'Total Ujian', value: stats.totalExams, color: '#a78bfa', icon: <BookOpen size={22} /> },
            { label: 'Ujian Aktif', value: stats.activeExams, color: 'var(--success)', icon: <Activity size={22} /> },
            { label: 'Rata-rata Nilai', value: `${stats.avgScore}%`, color: Number(stats.avgScore) >= 60 ? 'var(--success)' : 'var(--danger)', icon: <TrendingUp size={22} /> },
            { label: 'Total Pelanggaran', value: stats.totalViolations, color: 'var(--warning)', icon: <AlertTriangle size={22} /> },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-icon" style={{ background: s.color + '18', color: s.color }}>{s.icon}</div>
              <div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Detail Kelas ────────────────────────────── */}
        {classBreakdown.length > 0 && (
          <div className="card" style={{ marginBottom: '2rem' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <School size={18} style={{ color: 'var(--accent)' }} /> Detail Kelas
              </h3>
              <span className="text-muted text-sm">{classBreakdown.length} kelas terdaftar</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {classBreakdown.map(c => (
                <div key={c.name} className="class-detail-item">
                  <div className="class-detail-name">{c.name}</div>
                  <div className="class-detail-count">{c.count} <span>siswa</span></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Two-column: Chart + Recent Exams ──────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '2rem' }}>

          {/* Score Distribution Mini Chart */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Distribusi Nilai</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/analytics')} style={{ gap: '0.35rem' }}>
                Selengkapnya <ArrowRight size={13} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', height: 130, padding: '0.5rem 0' }}>
              {stats.distrib.map((count, i) => {
                const height = Math.max(8, (count / maxBar) * 110)
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{count}</span>
                    <div style={{ width: '100%', height, background: distribColors[i], borderRadius: '6px 6px 0 0', opacity: 0.85 }} />
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{distribLabels[i]}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent Exams */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Ujian Terbaru</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/exams')} style={{ gap: '0.35rem' }}>
                Lihat Semua <ArrowRight size={13} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentExams.length === 0 ? (
                <p className="text-muted text-sm" style={{ textAlign: 'center', padding: '1.5rem 0' }}>Belum ada ujian.</p>
              ) : recentExams.map(exam => (
                <div
                  key={exam.id}
                  className="dashboard-recent-item"
                  onClick={() => navigate(`/admin/results/${exam.id}`)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {exam.title}
                    </div>
                    <div className="text-muted text-xs">
                      {exam.users?.name || exam.created_by} · {new Date(exam.created_at).toLocaleDateString('id-ID')}
                    </div>
                  </div>
                  <span className={`badge badge-${exam.status === 'published' ? 'active' : exam.status === 'closed' ? 'closed' : 'draft'}`}>
                    {exam.status === 'published' ? 'Aktif' : exam.status === 'closed' ? 'Tutup' : 'Draft'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Quick Links ──────────────────────────────── */}
        <h3 style={{ marginBottom: '1rem' }}>Akses Cepat</h3>
        <div className="dashboard-quicklinks">
          {[
            { label: 'Kelola Pengguna', desc: 'Tambah, edit, atau hapus akun siswa & guru', icon: <Users size={24} />, color: 'var(--accent)', to: '/admin/users' },
            { label: 'Semua Ujian', desc: 'Lihat, publish, atau hapus ujian dari semua guru', icon: <BookOpen size={24} />, color: '#a78bfa', to: '/admin/exams' },
            { label: 'Analitik Sekolah', desc: 'Statistik lengkap & distribusi nilai', icon: <BarChart2 size={24} />, color: 'var(--gold-darker)', to: '/admin/analytics' },
            { label: 'Dashboard Guru', desc: 'Akses fitur guru: buat ujian, monitor, hasil', icon: <Plus size={24} />, color: 'var(--success)', to: '/teacher/exams' },
          ].map(link => (
            <div key={link.label} className="dashboard-quicklink-card" onClick={() => navigate(link.to)}>
              <div className="dashboard-quicklink-icon" style={{ background: link.color + '15', color: link.color }}>
                {link.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.15rem' }}>{link.label}</div>
                <div className="text-muted text-xs">{link.desc}</div>
              </div>
              <ArrowRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </div>
          ))}
        </div>

      </div>
    </>
  )
}
