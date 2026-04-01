import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function Analytics() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [
        { count: totalUsers },
        { count: totalTeachers },
        { count: totalExams },
        { count: totalSessions },
        { data: recentResults }
      ] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'USER'),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'TEACHER'),
        supabase.from('exams').select('*', { count: 'exact', head: true }),
        supabase.from('exam_sessions').select('*', { count: 'exact', head: true }),
        supabase.from('results').select('auto_score, max_auto_score, violation_count').limit(200),
      ])

      let avgScore = 0
      let totalViolations = 0
      if (recentResults?.length) {
        const pcts = recentResults.map(r => r.max_auto_score > 0 ? (r.auto_score / r.max_auto_score) * 100 : 0)
        avgScore = (pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1)
        totalViolations = recentResults.reduce((sum, r) => sum + (r.violation_count || 0), 0)
      }

      setStats({ totalUsers, totalTeachers, totalExams, totalSessions, avgScore, totalViolations, recentResults: recentResults || [] })
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading-screen"><div className="spinner" style={{ width: 32, height: 32 }} /></div>

  const distrib = [0, 0, 0, 0, 0] // 0-20, 20-40, 40-60, 60-80, 80-100
  stats.recentResults.forEach(r => {
    const pct = r.max_auto_score > 0 ? (r.auto_score / r.max_auto_score) * 100 : 0
    const idx = Math.min(4, Math.floor(pct / 20))
    distrib[idx]++
  })
  const maxBar = Math.max(...distrib, 1)

  return (
    <>
      <div className="page-header">
        <h2>Analitik Sekolah</h2>
        <p className="text-muted text-sm">Data keseluruhan sistem ujian BINAR</p>
      </div>
      <div className="page-body">
        {/* Stats grid */}
        <div className="stat-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { label: 'Total Siswa', value: stats.totalUsers, color: 'var(--accent)', icon: '🎓' },
            { label: 'Total Guru', value: stats.totalTeachers, color: 'var(--gold-darker)', icon: '👨‍🏫' },
            { label: 'Total Ujian', value: stats.totalExams, color: '#a78bfa', icon: '📋' },
            { label: 'Total Sesi', value: stats.totalSessions, color: 'var(--success)', icon: '🖥️' },
            { label: 'Rata-rata Nilai', value: `${stats.avgScore}%`, color: stats.avgScore >= 60 ? 'var(--success)' : 'var(--danger)', icon: '📊' },
            { label: 'Total Pelanggaran', value: stats.totalViolations, color: 'var(--warning)', icon: '⚠️' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-icon" style={{ background: s.color + '20', fontSize: '1.5rem' }}>{s.icon}</div>
              <div>
                <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Score distribution chart */}
        <div className="card">
          <div className="card-header">
            <h3>Distribusi Nilai (semua ujian)</h3>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', height: 160, padding: '0.5rem 0' }}>
            {distrib.map((count, i) => {
              const labels = ['0–20', '20–40', '40–60', '60–80', '80–100']
              const colors = ['#EF4444', '#F59E0B', '#F59E0B', '#10B981', '#4F8EF7']
              const height = Math.max(8, (count / maxBar) * 130)
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{count}</span>
                  <div style={{ width: '100%', height, background: colors[i], borderRadius: '6px 6px 0 0', opacity: 0.85, transition: 'all 0.4s ease' }} />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{labels[i]}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
