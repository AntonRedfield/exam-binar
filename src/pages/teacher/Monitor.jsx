import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { exams, sessions } from '../../lib/db'
import { RefreshCcw, ChevronLeft, RotateCcw, Activity } from 'lucide-react'
import { MONITORING_LEVELS } from '../../lib/monitoringConfig'
import { MonitoringIcon, getMonitoringBadgeStyle } from '../../lib/monitoringUI'

function statusBadge(status) {
  const map = {
    active: <span className="badge badge-pending">🟡 Aktif</span>,
    submitted: <span className="badge badge-active">✅ Selesai</span>,
    time_up: <span className="badge badge-closed">⏰ Waktu Habis</span>,
    reset: <span className="badge badge-draft">🔄 Direset</span>,
  }
  return map[status] || <span className="badge badge-draft">—</span>
}

function getRemaining(endTimestamp) {
  if (!endTimestamp) return '—'
  const secs = Math.max(0, Math.floor((new Date(endTimestamp).getTime() - Date.now()) / 1000))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function Monitor() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [sessionList, setSessionList] = useState([])
  const [loading, setLoading] = useState(true)
  const [, forceUpdate] = useState(0)
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })

  const load = useCallback(async () => {
    const [{ data: examData }, { data: sess }] = await Promise.all([
      exams.getById(examId),
      sessions.listByExam(examId),
    ])
    setExam(examData)
    setSessionList(sess || [])
    setLoading(false)
  }, [examId])

  useEffect(() => { load() }, [load])

  // Refresh every 10s
  useEffect(() => {
    const id = setInterval(() => { load(); forceUpdate(v => v + 1) }, 10000)
    return () => clearInterval(id)
  }, [load])

  async function handleReset(sess) {
    if (!confirm(`Reset ujian ${sess.users?.name}? Jawaban akan terhapus.`)) return
    await sessions.reset(sess.student_id, examId)
    await load()
  }

  const active = sessionList.filter(s => s.status === 'active').length
  const done = sessionList.filter(s => s.status === 'submitted' || s.status === 'time_up').length

  function handleSort(key) {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
  }

  const sortedSessions = [...sessionList].sort((a, b) => {
    let aVal = a.users?.[sortConfig.key] || a.student_id || ''
    let bVal = b.users?.[sortConfig.key] || b.student_id || ''
    
    aVal = String(aVal).toLowerCase()
    bVal = String(bVal).toLowerCase()
    
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher/exams')}><ChevronLeft size={15} /></button>
            <div>
              <h2>Monitor: {exam?.title}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <p className="text-muted text-sm" style={{ margin: 0 }}>Auto-refresh tiap 10 detik</p>
                {exam?.monitoring_level && (
                  <span style={getMonitoringBadgeStyle(exam.monitoring_level)}>
                    <MonitoringIcon level={exam.monitoring_level} size={12} />
                    {MONITORING_LEVELS[exam.monitoring_level]?.name || `Lv.${exam.monitoring_level}`}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCcw size={15} /> Refresh</button>
        </div>
      </div>
      <div className="page-body">
        <div className="stat-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--warning-bg)' }}><Activity size={22} color="var(--warning)" /></div>
            <div><div className="stat-value">{active}</div><div className="stat-label">Sedang Ujian</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--success-bg)' }}><Activity size={22} color="var(--success)" /></div>
            <div><div className="stat-value">{done}</div><div className="stat-label">Selesai</div></div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'rgba(79,142,247,0.1)' }}><Activity size={22} color="var(--accent)" /></div>
            <div><div className="stat-value">{sessionList.length}</div><div className="stat-label">Total Sesi</div></div>
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                    Nama Siswa {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('kelas')}>
                    Kelas {sortConfig.key === 'kelas' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th>Status</th>
                  <th>Sisa Waktu</th>
                  <th>Soal ke-</th>
                  <th>Dijawab</th>
                  <th>Pelanggaran</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {sortedSessions.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Belum ada siswa yang memulai ujian.</td></tr>
                ) : sortedSessions.map(sess => (
                  <tr key={sess.id}>
                    <td style={{ fontWeight: 600 }}>{sess.users?.name || sess.student_id}</td>
                    <td>{sess.users?.kelas || '—'}</td>
                    <td>{statusBadge(sess.status)}</td>
                    <td style={{ fontFamily: 'monospace' }}>{sess.status === 'active' ? getRemaining(sess.end_timestamp) : '—'}</td>
                    <td>{sess.current_question || 1}</td>
                    <td>{sess.answers ? Object.keys(sess.answers).length : 0}</td>
                    <td>
                      {sess.violation_count > 0
                        ? <span style={{ color: 'var(--warning)', fontWeight: 700 }}>⚠ {sess.violation_count}</span>
                        : <span className="text-muted">0</span>}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleReset(sess)} title="Reset sesi siswa ini">
                        <RotateCcw size={13} /> Reset
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
