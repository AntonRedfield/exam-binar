import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../lib/auth'
import { results, exams, sessions, questions } from '../lib/db'
import { CheckCircle, XCircle, Clock, ShieldAlert, Printer, ArrowLeft } from 'lucide-react'
import { formatScore, roundScore } from '../lib/format'

export default function Results() {
  const { resultId } = useParams()
  const navigate = useNavigate()
  const user = getCurrentUser()
  const [result, setResult] = useState(null)
  const [examQuestions, setExamQuestions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    const loadResult = async () => {
      try {
        const { data } = await results.getById(resultId)
        if (isMounted && data) {
          setResult(data)
          setLoading(false)
        }
      } catch {
        if (isMounted) setLoading(false)
      }
    }

    loadResult()
    const pollTimer = setInterval(loadResult, 3500)
    return () => {
      isMounted = false
      clearInterval(pollTimer)
    }
  }, [resultId])

  useEffect(() => {
    if (!result?.exam_id || !user?.id) return
    let isMounted = true

    const checkActiveSession = async () => {
      try {
        const { data: sess } = await sessions.get(user.id, result.exam_id)
        if (isMounted) {
          if (sess && sess.status === 'active') {
            setActiveSession(sess)
          } else {
            setActiveSession(null)
          }
        }
      } catch (e) {
        // quiet ignore
      }
    }

    checkActiveSession()
    const interval = setInterval(checkActiveSession, 3500)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [result?.exam_id, user?.id])

  useEffect(() => {
    if (!result?.exam_id) return
    let isMounted = true
    questions.listByExam(result.exam_id).then(({ data }) => {
      if (isMounted && data) setExamQuestions(data)
    }).catch(() => {})
    return () => { isMounted = false }
  }, [result?.exam_id])

  if (loading) return <div className="loading-screen"><div className="spinner" style={{ width: 40, height: 40 }} /></div>
  if (!result) return <div className="loading-screen"><p className="text-muted">Hasil tidak ditemukan.</p></div>

  const isTeacher = user?.role === 'MODERATOR' || user?.level === 2 || user?.level === 3
  const isAdmin = user?.role === 'SUPERADMIN' || user?.level === 4
  const isAuthorizedTeacher = isTeacher && result.exams?.created_by === user?.id

  // Teacher ownership check: teacher can only see results for exams they made by themselves
  if (isTeacher && !isAuthorizedTeacher) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--navy)', padding: '4rem 1rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="card text-center" style={{ maxWidth: 500, padding: '2.5rem 1.5rem', borderTop: '4px solid var(--danger)', background: '#ffffff' }}>
          <ShieldAlert size={48} color="var(--danger)" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Akses Dibatasi</h3>
          <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>
            Anda hanya berwenang melihat hasil ujian yang Anda buat sendiri.
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/teacher/exams')}>
            <ArrowLeft size={15} /> Kembali ke Daftar Ujian
          </button>
        </div>
      </div>
    )
  }

  const questionMap = new Map()
  examQuestions.forEach(q => questionMap.set(Number(q.number), q))

  const computedMaxFromQs = roundScore(examQuestions.reduce((sum, q) => {
    const pts = (q.points !== undefined && q.points !== null && !isNaN(Number(q.points))) ? Number(q.points) : 1
    return sum + pts
  }, 0))

  const rawBreakdown = (() => { try { return JSON.parse(result.breakdown || '[]') } catch { return [] } })()
  const essayScore = Number(result.essay_score) || 0
  const essayCount = rawBreakdown.filter(b => b.type === 'ESSAY' || b.type === 'PARAGRAPH' || b.reason_type === 'essay').length

  const breakdown = rawBreakdown.map(b => {
    const isAD = b.type === 'AGREE_DISAGREE'
    const isEssay = b.type === 'ESSAY' || b.type === 'PARAGRAPH' || (isAD && b.reason_type === 'essay')
    const qObj = questionMap.get(Number(b.number))
    const configuredPts = (qObj?.points !== undefined && qObj?.points !== null && !isNaN(Number(qObj.points)))
      ? Number(qObj.points)
      : (Number(b.max) || 1)
    const maxPts = (isAD && isEssay) ? roundScore(configuredPts * 0.5) : roundScore(configuredPts)

    let earned = b.earned !== undefined ? Number(b.earned) : 0
    let status = b.status || (isEssay ? 'pending' : 'wrong')

    if (isEssay && essayScore > 0 && (b.status === 'pending' || b.earned === undefined || b.earned === 0)) {
      if (essayCount === 1) {
        earned = essayScore
        status = earned >= maxPts ? 'correct' : (earned > 0 ? 'partial' : 'wrong')
      }
    }

    return {
      ...b,
      earned,
      max: maxPts,
      status
    }
  })

  const totalScore = roundScore((Number(result.auto_score) || 0) + essayScore)
  const breakdownMaxSum = roundScore(breakdown.reduce((sum, b) => sum + (Number(b.max) || 0), 0))
  const maxScore = roundScore(computedMaxFromQs > 0 ? computedMaxFromQs : Math.max(Number(result.max_auto_score) || 0, breakdownMaxSum))
  const pctNum = maxScore > 0 ? (totalScore / maxScore) * 100 : 0
  const pctStr = formatScore(pctNum)
  const essayPending = breakdown.some(b => (b.type === 'ESSAY' || b.type === 'PARAGRAPH' || (b.type === 'AGREE_DISAGREE' && b.reason_type === 'essay')) && b.status === 'pending') && essayScore === 0
  const passingGrade = result.exams?.passing_grade ?? 60
  const backPath = user?.role === 'SUPERADMIN' ? '/admin/exams' : (user?.role === 'MODERATOR' ? '/teacher/exams' : '/home')
  const canViewBreakdown = isAdmin || isAuthorizedTeacher || result.exams?.status !== 'published'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }} className="no-print">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(backPath)}>
            <ArrowLeft size={15} /> Kembali
          </button>
          {canViewBreakdown && (
            <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
              <Printer size={15} /> Cetak Hasil
            </button>
          )}
        </div>

        {/* Banner if Teacher has granted extra time and re-activated session */}
        {activeSession && (
          <div style={{
            background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
            borderRadius: 12,
            padding: '1.25rem 1.5rem',
            color: '#ffffff',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            boxShadow: '0 8px 24px rgba(37, 99, 235, 0.25)',
            border: '1.5px solid #60a5fa'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <Clock size={28} color="#fef08a" />
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#fef08a' }}>
                  Waktu Tambahan Diberikan oleh Pengawas!
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#e0f2fe' }}>
                  Sesi ujian Anda telah dibuka kembali dengan waktu tambahan. Seluruh jawaban sebelumnya tetap aman tersimpan.
                </p>
              </div>
            </div>
            <button
              className="btn btn-gold btn-sm"
              onClick={() => navigate(`/exam/${result.exam_id}/lobby`)}
              style={{ fontWeight: 800, padding: '0.55rem 1.25rem', fontSize: '0.88rem' }}
            >
              Lanjutkan Ujian Sekarang →
            </button>
          </div>
        )}

        {/* Score card */}
        <div className="card results-score" style={{ textAlign: 'center', marginBottom: '1.5rem', background: 'linear-gradient(135deg, var(--navy-mid), var(--navy-light))' }}>
          <p className="text-muted text-sm" style={{ marginBottom: '0.25rem' }}>{result.exams?.title}</p>
          <h1 style={{ fontSize: '3.5rem', fontFamily: "'Inter', sans-serif", fontWeight: 800, marginBottom: '0.25rem', color: pctNum >= passingGrade ? 'var(--success)' : 'var(--danger)' }}>
            {pctStr}%
          </h1>
          <div className="progress-bar" style={{ maxWidth: 240, margin: '0 auto 1rem' }}>
            <div className="progress-fill" style={{ width: `${pctNum}%`, background: pctNum >= passingGrade ? 'linear-gradient(90deg, var(--success), #34D399)' : 'linear-gradient(90deg, var(--danger), #F87171)' }} />
          </div>
          <div className="results-stats" style={{ display: 'flex', justifyContent: 'center', gap: '2rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span>Nilai: <strong style={{ color: 'var(--text-primary)' }}>{pctStr}%</strong></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldAlert size={14} color={result.violation_count > 0 ? 'var(--warning)' : 'var(--success)'} />
              {result.violation_count} Pelanggaran
            </span>
            {essayPending && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--warning)' }}>
                <Clock size={14} /> Esai Menunggu Penilaian
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
            Siswa: <strong>{result.users?.full_name || result.student?.full_name || user?.name || user?.full_name || 'Siswa'}</strong> &mdash; Kelas {result.users?.classes?.name || result.users?.kelas || result.student?.kelas || user?.kelas || '—'}
          </p>
        </div>

        {/* Breakdown table */}
        {canViewBreakdown && (
          <div id="quiz-area" lang="en" translate="no" className="card notranslate">
            <div className="card-header">
              <h3>Rincian Jawaban per Soal</h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Tipe</th>
                    <th>Jawaban Anda</th>
                    <th>Kunci Jawaban</th>
                    <th>Status</th>
                    <th>Skor</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map(b => (
                    <tr key={b.number}>
                      <td>{b.number}</td>
                      <td><span className="question-type-badge">{typeLabel(b.type)}</span></td>
                      <td style={{ fontFamily: 'monospace' }}>{formatAnswer(b.given, b.type)}</td>
                      <td style={{ fontFamily: 'monospace' }}>{b.status === 'pending' ? '—' : formatAnswer(b.correct, b.type)}</td>
                      <td>
                        {b.status === 'correct' && <span className="badge badge-active">✓ Benar</span>}
                        {b.status === 'wrong' && <span className="badge badge-closed">✗ Salah</span>}
                        {b.status === 'partial' && <span className="badge badge-pending">~ Parsial</span>}
                        {b.status === 'pending' && <span className="badge badge-draft">⏳ Esai</span>}
                      </td>
                      <td style={{ fontWeight: 700 }}>{b.status === 'pending' ? '—' : `${formatScore(b.earned)}/${formatScore(b.max)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="app-footer">
          <div>&copy;2026 SNT 10 Kupang. All rights reserved.</div>
          <div>System Engineered &amp; Maintain by Maulana Sulthoni.</div>
        </div>
      </div>
    </div>
  )
}

function typeLabel(type) {
  return {
    MCQ: 'PG',
    COMPLEX_MCQ: 'Multi',
    TRUE_FALSE: 'B/S',
    MATCHING: 'Jodoh',
    SEQUENCING: 'Urut',
    AGREE_DISAGREE: 'S/TS',
    ESSAY: 'Esai'
  }[type] || type
}

function formatAnswer(val, type) {
  if (val === undefined || val === null) return '—'
  if (type === 'SEQUENCING' && Array.isArray(val)) {
    return val.map((v, i) => `${i + 1}:${v}`).join(', ')
  }
  if (Array.isArray(val)) return val.join(', ')
  if (typeof val === 'object') {
    if (type === 'AGREE_DISAGREE') {
      if ('stance' in val) {
        const s = val.stance === 'agree' ? 'Setuju' : (val.stance === 'disagree' ? 'Tidak Setuju' : '—')
        const r = Array.isArray(val.reasons) && val.reasons.length > 0
          ? ` (Alasan: ${val.reasons.join(', ')})`
          : (val.essay ? ` (Alasan: "${val.essay.length > 30 ? val.essay.slice(0, 30) + '...' : val.essay}")` : '')
        return `${s}${r}`
      }
    }
    return Object.entries(val).map(([k, v]) => `${k}→${v}`).join(', ')
  }
  return String(val)
}
