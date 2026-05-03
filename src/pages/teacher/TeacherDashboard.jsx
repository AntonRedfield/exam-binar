import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../../lib/auth'
import { exams } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { BookOpen, Plus, Activity, BarChart2, Users, ArrowRight, FileText, Zap } from 'lucide-react'

export default function TeacherDashboard() {
  const user = getCurrentUser()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [recentExams, setRecentExams] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Get all exams (teachers & superadmin see all)
      const { data: allExams } = await exams.list()
      const examList = allExams || []

      const totalExams = examList.length
      const activeExams = examList.filter(e => e.status === 'published').length
      const draftExams = examList.filter(e => e.status === 'draft').length
      const closedExams = examList.filter(e => e.status === 'closed').length

      // Get total sessions count
      const { count: totalSessions } = await supabase
        .from('exam_sessions')
        .select('*', { count: 'exact', head: true })

      // Get recent results stats
      const { data: recentResults } = await supabase
        .from('results')
        .select('auto_score, max_auto_score')
        .limit(100)

      let avgScore = 0
      if (recentResults?.length) {
        const pcts = recentResults.map(r => r.max_auto_score > 0 ? (r.auto_score / r.max_auto_score) * 100 : 0)
        avgScore = (pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1)
      }

      setStats({ totalExams, activeExams, draftExams, closedExams, totalSessions, avgScore, totalResults: recentResults?.length || 0 })
      setRecentExams(examList.slice(0, 5))
      setLoading(false)
    }
    load()
  }, [user.id])

  if (loading) return <div className="loading-screen"><div className="spinner" style={{ width: 32, height: 32 }} /></div>

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
        <h2>{greeting}, {user?.name || 'Guru'} 👋</h2>
        <p className="text-muted text-sm">Ringkasan aktivitas pengajaran Anda</p>
      </div>
      <div className="page-body">

        {/* ── Summary Stats ─────────────────────────────── */}
        <div className="stat-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { label: 'Total Ujian', value: stats.totalExams, color: '#a78bfa', icon: <BookOpen size={22} /> },
            { label: 'Ujian Aktif', value: stats.activeExams, color: 'var(--success)', icon: <Activity size={22} /> },
            { label: 'Draft', value: stats.draftExams, color: 'var(--text-muted)', icon: <FileText size={22} /> },
            { label: 'Total Sesi', value: stats.totalSessions, color: 'var(--accent)', icon: <Zap size={22} /> },
            { label: 'Hasil Dinilai', value: stats.totalResults, color: 'var(--gold-darker)', icon: <BarChart2 size={22} /> },
            { label: 'Rata-rata Nilai', value: `${stats.avgScore}%`, color: Number(stats.avgScore) >= 60 ? 'var(--success)' : 'var(--danger)', icon: <BarChart2 size={22} /> },
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

        {/* ── Recent Exams ──────────────────────────────── */}
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Ujian Terbaru</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher/exams')} style={{ gap: '0.35rem' }}>
              Lihat Semua <ArrowRight size={13} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {recentExams.length === 0 ? (
              <p className="text-muted text-sm" style={{ textAlign: 'center', padding: '1.5rem 0' }}>Belum ada ujian. Buat ujian pertama Anda!</p>
            ) : recentExams.map(exam => (
              <div
                key={exam.id}
                className="dashboard-recent-item"
                onClick={() => navigate(`/teacher/results/${exam.id}`)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {exam.title}
                  </div>
                  <div className="text-muted text-xs">
                    {exam.mode === 'quiz' ? '⚡ Kuis' : '📝 Ujian'} · {new Date(exam.created_at).toLocaleDateString('id-ID')}
                  </div>
                </div>
                <span className={`badge badge-${exam.status === 'published' ? 'active' : exam.status === 'closed' ? 'closed' : 'draft'}`}>
                  {exam.status === 'published' ? 'Aktif' : exam.status === 'closed' ? 'Tutup' : 'Draft'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Quick Links ──────────────────────────────── */}
        <h3 style={{ marginBottom: '1rem' }}>Akses Cepat</h3>
        <div className="dashboard-quicklinks">
          {[
            { label: 'Buat Ujian Baru', desc: 'Buat ujian atau kuis dengan berbagai tipe soal', icon: <Plus size={24} />, color: 'var(--gold-darker)', to: '/teacher/create' },
            { label: 'Daftar Ujian', desc: 'Kelola semua ujian yang telah dibuat', icon: <BookOpen size={24} />, color: '#a78bfa', to: '/teacher/exams' },
            { label: 'Kelola Siswa', desc: 'Lihat dan kelola data siswa terdaftar', icon: <Users size={24} />, color: 'var(--accent)', to: '/teacher/students' },
            { label: 'Monitor & Hasil', desc: 'Pantau siswa dan lihat hasil ujian', icon: <Activity size={24} />, color: 'var(--success)', to: '/teacher/exams' },
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
