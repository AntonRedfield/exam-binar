import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser, logout } from '../lib/auth'
import { exams, sessions, results } from '../lib/db'
import { BookOpen, Clock, CheckCircle, Play, LogOut, RotateCcw, ZapOff } from 'lucide-react'
import BiometricPrompt from '../components/BiometricPrompt'

function getStatusBadge(status) {
  if (status === 'active') return <span className="badge badge-pending">Sedang Berlangsung</span>
  if (status === 'submitted' || status === 'time_up') return <span className="badge badge-active">Selesai</span>
  if (status === 'reset') return <span className="badge badge-draft">Direset</span>
  return null
}

export default function StudentHome() {
  const navigate = useNavigate()
  const user = getCurrentUser()
  const [examList, setExamList] = useState([])
  const [sessionMap, setSessionMap] = useState({})
  const [resultMap, setResultMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: allExams } = await exams.list()
      if (!allExams) { setLoading(false); return }

      // Filter exams: show if no target_kelas, target_kelas is 'all', or student's class starts with one of the target strings
      const relevant = allExams.filter(e => {
        if (!e.target_kelas || e.target_kelas === 'all') return true
        if (!user.kelas) return false
        const targets = e.target_kelas.split(',')
        return targets.some(t => user.kelas.startsWith(t))
      })

      // Load sessions and results for each exam
      const sMap = {}
      const rMap = {}
      const visibleExams = []
      
      for (const exam of relevant) {
        let isVisible = exam.status === 'published'
        const { data: sess } = await sessions.get(user.id, exam.id)
        if (sess) {
          sMap[exam.id] = sess
          isVisible = true // Always show if they have a session/result
        }
        
        if (isVisible) {
          visibleExams.push(exam)
          const { data: result } = await results.get(user.id, exam.id)
          if (result) rMap[exam.id] = result
        }
      }
      setExamList(visibleExams)
      setSessionMap(sMap)
      setResultMap(rMap)
      setLoading(false)
    }
    load()
  }, [user.id, user.kelas])

  function handleExamClick(exam) {
    const session = sessionMap[exam.id]
    if (session?.status === 'submitted' || session?.status === 'time_up') {
      const result = resultMap[exam.id]
      if (result) navigate(`/results/${result.id}`)
    } else {
      if (exam.status !== 'published') {
        alert('Ujian ini sudah ditutup.')
        return
      }
      navigate(`/exam/${exam.id}/lobby`)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" style={{ width: 40, height: 40 }} />
      <p className="text-muted">Memuat ujian...</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)' }}>
      {/* Header */}
      <header className="student-header" style={{ background: 'var(--glass)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(20px)', padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src={`${import.meta.env.BASE_URL}binar-logo.png`} alt="BINAR Logo" style={{ height: 80, objectFit: 'contain' }} />
          <span style={{ fontFamily: 'Cambria, "Times New Roman", serif', fontWeight: 700, fontSize: '1.25rem' }}>
            BINAR JHS <span className="text-gold">Exam App</span>
          </span>
        </div>
        <div className="student-header-right" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user.name}</div>
            <div className="text-muted text-xs">Kelas {user.kelas} &middot; {user.id}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
            <LogOut size={15} /> Keluar
          </button>
        </div>
      </header>

      {/* Body */}
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>Ujian Tersedia</h2>
        <p className="text-muted" style={{ marginBottom: '2rem', fontSize: '0.9rem' }}>
          Kelas {user.kelas} &mdash; {examList.length} ujian ditemukan
        </p>

        {examList.length === 0 ? (
          <div className="empty-state card">
            <ZapOff size={48} style={{ margin: '0 auto 1rem', opacity: 0.3, display: 'block' }} />
            <p>Tidak ada ujian yang tersedia saat ini.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {examList.map(exam => {
              const session = sessionMap[exam.id]
              const result = resultMap[exam.id]
              const isDone = session?.status === 'submitted' || session?.status === 'time_up'
              const isActive = session?.status === 'active' || session?.status === 'reset'

              let scoreNode = null
              if (isDone && result) {
                const totalScore = (result.auto_score || 0) + (result.essay_score || 0)
                const pctNum = result.max_auto_score > 0 ? (totalScore / result.max_auto_score) * 100 : 0
                const pctStr = pctNum.toLocaleString('id-ID', { maximumFractionDigits: 2 })
                scoreNode = <span className="text-success">Nilai: {pctStr}%</span>
              }

              return (
                <div key={exam.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', cursor: 'pointer', transition: 'transform 0.15s, border-color 0.15s', borderColor: isDone ? 'rgba(16,185,129,0.2)' : isActive ? 'rgba(245,158,11,0.25)' : 'var(--border)' }}
                  onClick={() => handleExamClick(exam)}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: isDone ? 'var(--success-bg)' : isActive ? 'var(--warning-bg)' : 'rgba(79,142,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isDone ? <CheckCircle size={26} color="var(--success)" /> : isActive ? <RotateCcw size={26} color="var(--warning)" /> : <Play size={26} color="var(--accent)" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{exam.title}</h3>
                      {getStatusBadge(session?.status)}
                    </div>
                    <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Clock size={13} /> {exam.duration_minutes} menit</span>
                      {scoreNode}
                      {isActive && exam.status === 'published' && <span className="text-gold">Klik untuk melanjutkan ujian</span>}
                      {isActive && exam.status !== 'published' && <span className="text-danger">Ujian telah ditutup</span>}
                      {!session && <span>Belum dimulai — klik untuk mulai</span>}
                    </div>
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.8rem', flexShrink: 0 }}>
                    {isDone ? 'Lihat Hasil →' : (isActive && exam.status !== 'published') ? 'Ditutup' : isActive ? 'Lanjutkan →' : 'Mulai →'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
      <BiometricPrompt />
    </div>
  )
}
