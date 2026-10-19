import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { exams, sessions } from '../../lib/db'
import {
  Activity,
  Lock,
  Unlock,
  RotateCcw,
  RefreshCcw,
  ChevronLeft,
  Key,
  Copy,
  Check,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  Trash2,
  ChevronDown,
  ChevronUp,
  Timer,
  Edit2,
  Zap,
  Save,
  CheckCircle2,
  X
} from 'lucide-react'
import { questions } from '../../lib/db'
import { liveUpdateSingleQuestion } from '../../lib/liveExamSync'
import { MONITORING_LEVELS } from '../../lib/monitoringConfig'
import { MonitoringIcon, getMonitoringBadgeStyle } from '../../lib/monitoringUI'
import {
  isValidReturneeToken,
  sanitizeReturneeToken,
  setExamReturneeToken,
  extendExamReturneeToken,
  clearExamReturneeToken,
  getExamTokenInfo,
  unlockStudentReturnee,
  unlockAllExamReturnees,
  lockStudentReturnee
} from '../../lib/returnee'

function statusBadge(status, returneeRequired, returneeReason) {
  if (returneeRequired) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <span className="badge badge-returnee">
          <Lock size={11} /> Returnee
        </span>
        <span style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 600 }}>
          {returneeReason || 'Perlu Token'}
        </span>
        <span style={{ fontSize: '0.66rem', color: '#64748b', background: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: '4px', width: 'fit-content' }}>
          Gunakan Token Ujian
        </span>
      </div>
    )
  }
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

function formatTokenRemaining(secs) {
  if (secs <= 0) return '00:00 (Habis)'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const DURATION_PRESETS = [
  { label: '60s (1 Menit)', value: 60 },
  { label: '120s (2 Menit)', value: 120 },
  { label: '180s (3 Menit)', value: 180 },
  { label: '300s (5 Menit)', value: 300 },
  { label: '600s (10 Menit)', value: 600 }
]

export default function Monitor() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [sessionList, setSessionList] = useState([])
  const [loading, setLoading] = useState(true)
  const [, forceUpdate] = useState(0)
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })

  // Exam-level centralized token management state (OSN & TKA System)
  const [isTokenPanelCollapsed, setIsTokenPanelCollapsed] = useState(false)
  const [examTokenCopied, setExamTokenCopied] = useState(false)
  const [isManualExamToken, setIsManualExamToken] = useState(false)
  const [manualExamTokenInput, setManualExamTokenInput] = useState('')
  const [examTokenError, setExamTokenError] = useState('')
  const [examTokenLoading, setExamTokenLoading] = useState(false)
  const [tokenDuration, setTokenDuration] = useState(300) // default 300 seconds (5 min)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [, setTimerTick] = useState(0)

  // Quick Live Edit State
  const [quickEditOpen, setQuickEditOpen] = useState(false)
  const [examQuestions, setExamQuestions] = useState([])
  const [selectedQIndex, setSelectedQIndex] = useState(0)
  const [editingQ, setEditingQ] = useState(null)
  const [quickSaving, setQuickSaving] = useState(false)
  const [quickNotice, setQuickNotice] = useState('')
  const [quickError, setQuickError] = useState('')

  // 1-second countdown tick for live token timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimerTick(t => t + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const load = useCallback(async () => {
    const [{ data: examData }, { data: sess }] = await Promise.all([
      exams.getById(examId),
      sessions.listByExam(examId),
    ])
    setExam(examData)
    setSessionList(sess || [])
    if (examData?.returnee_token_duration) {
      setTokenDuration(Number(examData.returnee_token_duration))
    } else if (examData?.survey_notify_time && Number(examData.survey_notify_time) > 0) {
      setTokenDuration(Number(examData.survey_notify_time))
    }
    setLoading(false)
  }, [examId])

  useEffect(() => {
    let ignore = false
    exams.getById(examId).then(({ data: examData }) => {
      if (!ignore && examData) {
        setExam(examData)
        if (examData.returnee_token_duration) {
          setTokenDuration(Number(examData.returnee_token_duration))
        } else if (examData.survey_notify_time && Number(examData.survey_notify_time) > 0) {
          setTokenDuration(Number(examData.survey_notify_time))
        }
      }
    })
    sessions.listByExam(examId).then(({ data: sess }) => {
      if (!ignore) {
        setSessionList(sess || [])
        setLoading(false)
      }
    })
    return () => { ignore = true }
  }, [examId])

  // Open Quick Live Edit & load questions
  const openQuickEdit = async () => {
    setQuickEditOpen(true)
    setQuickError('')
    setQuickNotice('')
    try {
      const { data: qs } = await questions.listByExam(examId)
      const list = qs || []
      setExamQuestions(list)
      if (list.length > 0) {
        setSelectedQIndex(0)
        setEditingQ(JSON.parse(JSON.stringify(list[0])))
      }
    } catch (err) {
      setQuickError('Gagal memuat butir soal: ' + err.message)
    }
  }

  const handleSelectQuestion = (idx) => {
    setSelectedQIndex(idx)
    if (examQuestions[idx]) {
      setEditingQ(JSON.parse(JSON.stringify(examQuestions[idx])))
      setQuickNotice('')
      setQuickError('')
    }
  }

  const handleQuickApply = async () => {
    if (!editingQ?.id) return
    setQuickSaving(true)
    setQuickError('')
    setQuickNotice('')
    try {
      const res = await liveUpdateSingleQuestion(examId, editingQ.id, {
        number: Number(editingQ.number) || 1,
        question_text: editingQ.question_text || '',
        options: editingQ.options || null,
        option_images: editingQ.option_images || {},
        correct_answer: editingQ.correct_answer,
        points: Number(editingQ.points) || 1,
        image_url: editingQ.image_url || null,
      })

      if (!res.success) throw new Error(res.error)

      setQuickNotice(`✅ Soal No. ${editingQ.number} berhasil diperbarui & langsung diterapkan ke seluruh siswa!`)

      // Refresh local questions list
      const { data: qs } = await questions.listByExam(examId)
      if (qs) {
        setExamQuestions(qs)
        if (qs[selectedQIndex]) {
          setEditingQ(JSON.parse(JSON.stringify(qs[selectedQIndex])))
        }
      }
      setTimeout(() => setQuickNotice(''), 4500)
    } catch (err) {
      setQuickError(err.message || 'Gagal menerapkan perubahan butir soal')
    } finally {
      setQuickSaving(false)
    }
  }

  // Refresh every 10s for student session states
  useEffect(() => {
    const id = setInterval(() => { load(); forceUpdate(v => v + 1) }, 10000)
    return () => clearInterval(id)
  }, [load])

  // Compute live token info
  const tokenInfo = getExamTokenInfo(exam)

  // ─── Centralized Exam Token Handlers ─────────────────────────────────────────
  const handleAutoGenerateExamToken = useCallback(async () => {
    setExamTokenLoading(true)
    setExamTokenError('')
    const { token, duration, expiresAt, error } = await setExamReturneeToken(examId, null, tokenDuration)
    if (error) {
      setExamTokenError(error.message || 'Gagal membuat token')
    } else {
      setExam(prev => prev ? {
        ...prev,
        returnee_token: token,
        returnee_token_duration: duration,
        returnee_token_expires_at: expiresAt,
        survey_notify_time: String(duration),
        updated_at: new Date().toISOString()
      } : prev)
      setIsManualExamToken(false)
      setManualExamTokenInput('')
    }
    setExamTokenLoading(false)
  }, [examId, tokenDuration])

  // Auto-refresh when token expires if autoRefresh is toggled on
  useEffect(() => {
    if (autoRefresh && tokenInfo.token && tokenInfo.isExpired && !examTokenLoading) {
      const timeout = setTimeout(() => {
        handleAutoGenerateExamToken()
      }, 100)
      return () => clearTimeout(timeout)
    }
  }, [autoRefresh, tokenInfo.token, tokenInfo.isExpired, examTokenLoading, handleAutoGenerateExamToken])

  async function handleReset(sess) {
    const studentName = sess.users?.full_name || sess.users?.name || 'Siswa'
    if (!confirm(`Reset ujian ${studentName}? Jawaban akan terhapus.`)) return
    await sessions.reset(sess.student_id, examId)
    await load()
  }

  async function handleExtendExamToken() {
    if (!tokenInfo.token) return
    setExamTokenLoading(true)
    setExamTokenError('')
    const { token, duration, expiresAt, error } = await extendExamReturneeToken(examId, tokenDuration)
    if (error) {
      setExamTokenError(error.message || 'Gagal memperpanjang waktu token')
    } else {
      setExam(prev => prev ? {
        ...prev,
        returnee_token: token,
        returnee_token_duration: duration,
        returnee_token_expires_at: expiresAt,
        survey_notify_time: String(duration),
        updated_at: new Date().toISOString()
      } : prev)
    }
    setExamTokenLoading(false)
  }

  async function handleSaveManualExamToken() {
    const clean = sanitizeReturneeToken(manualExamTokenInput)
    if (!isValidReturneeToken(clean)) {
      setExamTokenError('Token harus terdiri dari tepat 6 karakter angka & huruf (0-9, A-Z).')
      return
    }
    setExamTokenLoading(true)
    setExamTokenError('')
    const { token, duration, expiresAt, error } = await setExamReturneeToken(examId, clean, tokenDuration)
    if (error) {
      setExamTokenError(error.message || 'Gagal menyimpan token')
    } else {
      setExam(prev => prev ? {
        ...prev,
        returnee_token: token,
        returnee_token_duration: duration,
        returnee_token_expires_at: expiresAt,
        survey_notify_time: String(duration),
        updated_at: new Date().toISOString()
      } : prev)
      setIsManualExamToken(false)
      setManualExamTokenInput('')
    }
    setExamTokenLoading(false)
  }

  async function handleClearExamToken() {
    if (!confirm('Hapus/nonaktifkan Token Ujian ini? Siswa yang terkunci (Returnee) harus menunggu token baru dirilis.')) return
    setExamTokenLoading(true)
    await clearExamReturneeToken(examId)
    setExam(prev => prev ? {
      ...prev,
      returnee_token: null,
      returnee_token_expires_at: null,
      updated_at: new Date().toISOString()
    } : prev)
    setExamTokenLoading(false)
  }

  function handleCopyExamToken() {
    if (!tokenInfo?.token) return
    navigator.clipboard.writeText(tokenInfo.token)
    setExamTokenCopied(true)
    setTimeout(() => setExamTokenCopied(false), 2000)
  }

  // ─── Proctor Student Actions ──────────────────────────────────────────
  async function handleDirectUnlock(sess) {
    const studentName = sess.users?.full_name || sess.users?.name || 'Siswa'
    if (!confirm(`Buka kunci ujian untuk ${studentName} langsung tanpa memerlukan input token?\n\nSiswa akan langsung dapat melanjutkan ujian (paksa masuk).`)) return
    await unlockStudentReturnee(sess.id)
    await load()
  }

  async function handleDirectUnlockAll() {
    if (returnees === 0) return
    if (!confirm(`Buka kunci paksa untuk SEMUA (${returnees} siswa) yang terkunci tanpa memerlukan token?\n\nGunakan ini jika terjadi kendala teknis tak terduga (jaringan terputus, pemadaman, dll) agar seluruh siswa langsung dapat kembali ujian.`)) return
    setLoading(true)
    await unlockAllExamReturnees(examId)
    await load()
    setLoading(false)
  }

  async function handleLockStudent(sess) {
    const studentName = sess.users?.full_name || sess.users?.name || 'Siswa'
    if (!confirm(`Kunci sesi ujian ${studentName} sebagai Returnee? Siswa harus memasukkan Token Ujian aktif atau dibuka oleh pengawas untuk melanjutkan.`)) return
    await lockStudentReturnee(sess.id, 'Dikunci secara manual oleh pengawas')
    await load()
  }

  const active = sessionList.filter(s => s.status === 'active' && !s.returnee_token_required).length
  const returnees = sessionList.filter(s => s.returnee_token_required).length
  const done = sessionList.filter(s => s.status === 'submitted' || s.status === 'time_up').length

  function handleSort(key) {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
  }

  const sortedSessions = [...sessionList].sort((a, b) => {
    let aVal = a.users?.[sortConfig.key] || a.users?.username || ''
    let bVal = b.users?.[sortConfig.key] || b.users?.username || ''
    
    aVal = String(aVal).toLowerCase()
    bVal = String(bVal).toLowerCase()
    
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher/exams')}>
              <ChevronLeft size={15} />
            </button>
            <div>
              <h2>Monitor: {exam?.title}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                <p className="text-muted text-sm" style={{ margin: 0 }}>Auto-refresh tiap 10 detik</p>
                {exam?.monitoring_level && (
                  <span style={getMonitoringBadgeStyle(exam.monitoring_level)}>
                    <MonitoringIcon level={exam.monitoring_level} size={12} />
                    {MONITORING_LEVELS[exam.monitoring_level]?.name || `Lv.${exam.monitoring_level}`}
                  </span>
                )}
                {exam?.mode === 'quiz' ? (
                  <span className="badge badge-active">⚡ Kuis</span>
                ) : (
                  <span className="badge badge-gold">📝 Ujian</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-gold btn-sm"
              onClick={openQuickEdit}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'linear-gradient(135deg, #059669, #047857)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)'
              }}
              title="Koreksi nomor soal, teks narasi, opsi, atau kunci jawaban secara langsung"
            >
              <Zap size={14} /> Live Edit Soal
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate(`/teacher/edit/${examId}`)}
              title="Buka Question Maker lengkap"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Edit2 size={13} /> Edit Lengkap
            </button>
            <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCcw size={15} /> Refresh</button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Stat Cards */}
        <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--warning-bg)' }}><Activity size={22} color="var(--warning)" /></div>
            <div><div className="stat-value">{active}</div><div className="stat-label">Sedang Ujian</div></div>
          </div>
          <div className="stat-card" style={returnees > 0 ? { borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.05)' } : {}}>
            <div className="stat-icon" style={{ background: returnees > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)' }}>
              <Lock size={22} color="var(--danger)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div className="stat-value" style={returnees > 0 ? { color: 'var(--danger)' } : {}}>{returnees}</div>
                {returnees > 0 && (
                  <button
                    type="button"
                    className="btn btn-success btn-xs"
                    onClick={handleDirectUnlockAll}
                    title="Buka kunci darurat untuk SEMUA siswa terkunci tanpa token"
                    style={{
                      fontSize: '0.72rem',
                      padding: '0.25rem 0.55rem',
                      fontWeight: 700,
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      boxShadow: '0 1px 2px rgba(22, 163, 74, 0.2)'
                    }}
                  >
                    <Unlock size={11} /> Buka Semua ({returnees})
                  </button>
                )}
              </div>
              <div className="stat-label">Peserta Returnee</div>
            </div>
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

        {/* Centralized Exam Token Management Panel (OSN & TKA System) */}
        <div className={`osn-token-card ${tokenInfo.isActive ? 'active' : tokenInfo.isExpired ? 'expired' : ''}`} style={{
          marginBottom: '1.5rem',
          padding: isTokenPanelCollapsed ? '0.85rem 1.25rem' : '1.25rem'
        }}>
          <div 
            className={`card-header-clickable ${isTokenPanelCollapsed ? 'collapsed' : ''}`}
            onClick={() => setIsTokenPanelCollapsed(prev => !prev)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '12px',
                background: tokenInfo.isActive ? 'linear-gradient(135deg, #1e3a8a, #2563eb)' : '#1e293b',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: tokenInfo.isActive ? '0 4px 12px rgba(37,99,235,0.3)' : 'none'
              }}>
                <Key size={20} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e3a8a' }}>
                    Token Ujian Terpusat (OSN &amp; TKA System)
                  </h3>
                  <span className="badge badge-gold" style={{ fontSize: '0.68rem' }}>Lv.3 &amp; Lv.4 Pengawas</span>

                  {/* Status Badge */}
                  {tokenInfo.isActive ? (
                    <span className="badge badge-active" style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span className="pulse-dot-green"></span>
                      AKTIF ({tokenInfo.remainingSeconds}s)
                    </span>
                  ) : tokenInfo.isExpired ? (
                    <span className="badge badge-closed" style={{ fontSize: '0.75rem', background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}>
                      🔴 KADALUARSA (EXPIRED)
                    </span>
                  ) : (
                    <span className="badge badge-draft" style={{ fontSize: '0.75rem' }}>
                      ⚪ BELUM DIRILIS
                    </span>
                  )}
                </div>
                {!isTokenPanelCollapsed && (
                  <p className="text-muted text-xs" style={{ margin: '0.25rem 0 0', maxWidth: 680, lineHeight: 1.4 }}>
                    <strong>1 Token berlaku untuk semua peserta</strong> yang berstatus Returnee/Terkunci dalam batas durasi aktif yang ditentukan guru/pengawas.
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              className={`btn-collapse-toggle ${isTokenPanelCollapsed ? 'collapsed' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setIsTokenPanelCollapsed(prev => !prev)
              }}
              title={isTokenPanelCollapsed ? 'Bentangkan panel token' : 'Ciutkan panel token'}
            >
              <span>{isTokenPanelCollapsed ? 'Bentangkan' : 'Ciutkan'}</span>
              {isTokenPanelCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
          </div>

          {!isTokenPanelCollapsed && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(203, 213, 225, 0.6)' }}>
              
              {/* Token Hero Section (Display + Live Timer) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                
                {/* Active Token Display Box */}
                <div className={`osn-token-hero ${tokenInfo.isActive ? 'active' : tokenInfo.isExpired ? 'expired' : ''}`}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.2rem' }}>
                      Kode Token Ujian:
                    </div>
                    {tokenInfo.token ? (
                      <div className={`osn-token-code ${tokenInfo.isExpired ? 'expired' : ''}`}>
                        {tokenInfo.token}
                      </div>
                    ) : (
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: '#94a3b8', fontStyle: 'italic' }}>
                        (Belum Dirilis)
                      </div>
                    )}
                  </div>

                  {tokenInfo.token && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleCopyExamToken}
                        title="Salin Token ke Clipboard"
                        style={{ padding: '0.4rem 0.65rem', background: '#f8fafc', border: '1px solid #cbd5e1' }}
                      >
                        {examTokenCopied ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
                        <span style={{ fontSize: '0.78rem', marginLeft: '0.3rem' }}>
                          {examTokenCopied ? 'Tersalin' : 'Salin'}
                        </span>
                      </button>
                      <button
                        className="btn btn-ghost btn-sm text-danger"
                        onClick={handleClearExamToken}
                        disabled={examTokenLoading}
                        title="Nonaktifkan Token Sekarang"
                        style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        <Trash2 size={13} /> Nonaktifkan
                      </button>
                    </div>
                  )}
                </div>

                {/* Live Countdown Timer & Progress Bar */}
                <div style={{
                  background: '#ffffff',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '0.85rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}>
                  <div className="osn-token-timer-label">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Timer size={14} /> Sisa Waktu Token:
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>
                      Durasi: {tokenInfo.duration}s
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <div className={`osn-token-timer-value ${tokenInfo.isExpired ? 'danger' : ''}`}>
                      {tokenInfo.token ? formatTokenRemaining(tokenInfo.remainingSeconds) : '—'}
                    </div>
                    {tokenInfo.isActive && (
                      <span style={{ fontSize: '0.75rem', color: tokenInfo.remainingSeconds <= 15 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                        {tokenInfo.percentRemaining}% tersisa
                      </span>
                    )}
                  </div>

                  {/* Progress Bar Track */}
                  <div className="osn-token-progress-track">
                    <div
                      className="osn-token-progress-fill"
                      style={{
                        width: `${tokenInfo.token ? tokenInfo.percentRemaining : 0}%`,
                        backgroundColor: tokenInfo.isExpired
                          ? '#dc2626'
                          : tokenInfo.remainingSeconds > 30
                          ? '#16a34a'
                          : tokenInfo.remainingSeconds > 10
                          ? '#f59e0b'
                          : '#dc2626'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Duration Settings & Presets */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '0.85rem 1rem',
                marginBottom: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Clock size={15} color="#2563eb" /> Pengaturan Durasi Token Aktif:
                  </span>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>Auto-refresh token baru saat waktu habis</span>
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      className={`osn-preset-btn ${tokenDuration === preset.value ? 'active' : ''}`}
                      onClick={() => setTokenDuration(preset.value)}
                    >
                      {preset.label}
                    </button>
                  ))}

                  {/* Custom duration input */}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Kustom:</span>
                    <input
                      type="number"
                      min={10}
                      max={600}
                      value={tokenDuration}
                      onChange={(e) => setTokenDuration(Math.max(10, Math.min(600, Number(e.target.value) || 10)))}
                      style={{
                        width: '75px',
                        padding: '0.3rem 0.5rem',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        textAlign: 'center'
                      }}
                    />
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>detik (maks 600s / 10m)</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-gold btn-sm"
                    onClick={handleAutoGenerateExamToken}
                    disabled={examTokenLoading}
                    title="Rilis token acak 6 digit baru dengan durasi terpilih"
                    style={{ fontWeight: 700 }}
                  >
                    <Sparkles size={15} /> Rilis Token Baru ({tokenDuration}s)
                  </button>

                  {tokenInfo.token && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={handleExtendExamToken}
                      disabled={examTokenLoading}
                      title="Reset timer token ini dengan durasi aktif tanpa mengubah kode token"
                      style={{ background: '#ffffff', border: '1px solid #cbd5e1' }}
                    >
                      <Timer size={14} color="#2563eb" /> Perpanjang Waktu (+{tokenDuration}s)
                    </button>
                  )}

                  <button
                    className={`btn btn-sm ${isManualExamToken ? 'btn-gold' : 'btn-ghost'}`}
                    onClick={() => {
                      setIsManualExamToken(!isManualExamToken)
                      setExamTokenError('')
                      setManualExamTokenInput(tokenInfo.token || '')
                    }}
                    disabled={examTokenLoading}
                    style={!isManualExamToken ? { background: '#ffffff', border: '1px solid #cbd5e1' } : {}}
                  >
                    <Key size={14} /> {isManualExamToken ? 'Batal Manual' : 'Input Manual'}
                  </button>
                </div>

                {tokenInfo.isExpired && (
                  <span style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 600 }}>
                    ⚠️ Token telah habis. Klik "Rilis Token Baru" atau "Perpanjang Waktu".
                  </span>
                )}
              </div>

              {/* Manual Input Form */}
              {isManualExamToken && (
                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: '#ffffff',
                  borderRadius: '10px',
                  border: '1.5px dashed #3b82f6',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                      Ketik 6 Karakter Token Kustom (0-9, A-Z):
                    </span>
                    <input
                      type="text"
                      className="token-digit-input"
                      style={{ maxWidth: 220, padding: '0.45rem 0.75rem', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.25em' }}
                      placeholder="contoh: 7B3X9A"
                      maxLength={6}
                      value={manualExamTokenInput}
                      onChange={(e) => {
                        const clean = sanitizeReturneeToken(e.target.value)
                        setManualExamTokenInput(clean)
                        setExamTokenError('')
                      }}
                      autoFocus
                    />
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      ({manualExamTokenInput.length}/6)
                    </span>
                    <button
                      className="btn btn-gold btn-sm"
                      onClick={handleSaveManualExamToken}
                      disabled={examTokenLoading || manualExamTokenInput.length !== 6}
                    >
                      <Check size={14} /> Terapkan Token ({tokenDuration}s)
                    </button>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    * Karakter otomatis diubah ke huruf kapital. Hanya angka dan alfabet diperbolehkan. Token akan aktif selama {tokenDuration} detik.
                  </div>
                </div>
              )}

              {examTokenError && (
                <div style={{ marginTop: '0.75rem', color: '#ef4444', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <AlertTriangle size={15} /> {examTokenError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sessions Table */}
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
                  <th>Sisa Waktu Ujian</th>
                  <th>Soal ke-</th>
                  <th>Dijawab</th>
                  <th>Pelanggaran</th>
                  <th style={{ textAlign: 'center' }}>Aksi Sesi</th>
                </tr>
              </thead>
              <tbody>
                {sortedSessions.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem' }}>Belum ada siswa yang memulai ujian.</td></tr>
                ) : sortedSessions.map(sess => {
                  const isReturnee = Boolean(sess.returnee_token_required)
                  return (
                    <tr key={sess.id} style={isReturnee ? { background: 'rgba(239, 68, 68, 0.04)' } : {}}>
                      <td style={{ fontWeight: 600 }}>
                        {sess.users?.full_name || sess.users?.name || (sess.student_id ? `Siswa (${sess.student_id.slice(0, 8)})` : 'Siswa')}
                        {sess.users?.username && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                            @{sess.users.username}
                          </div>
                        )}
                      </td>
                      <td>{sess.users?.classes?.name || sess.users?.kelas || '—'}</td>
                      <td>{statusBadge(sess.status, isReturnee, sess.returnee_reason)}</td>
                      <td style={{ fontFamily: 'monospace' }}>{sess.status === 'active' ? getRemaining(sess.end_timestamp) : '—'}</td>
                      <td>{sess.current_question || 1}</td>
                      <td>{sess.answers ? Object.keys(sess.answers).length : 0}</td>
                      <td>
                        {sess.violation_count > 0 ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                            color: '#dc2626',
                            fontWeight: 800,
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem'
                          }}>
                            ⚠ {sess.violation_count}x
                          </span>
                        ) : (
                          <span className="text-muted">0</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {isReturnee && (
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => handleDirectUnlock(sess)}
                              title="Buka kunci langsung tanpa perlu siswa input token (Paksa masuk)"
                              style={{
                                padding: '0.3rem 0.75rem',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                background: '#16a34a',
                                color: '#ffffff',
                                border: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                boxShadow: '0 1px 2px rgba(22, 163, 74, 0.25)'
                              }}
                            >
                              <Unlock size={12} /> Buka Kunci
                            </button>
                          )}

                          {sess.status === 'active' && !isReturnee && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleLockStudent(sess)}
                              title="Kunci sesi siswa sebagai Returnee"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#64748b' }}
                            >
                              <Lock size={12} /> Kunci
                            </button>
                          )}

                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleReset(sess)}
                            title="Reset sesi siswa ini"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            <RotateCcw size={12} /> Reset
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Quick Live Edit Modal */}
      {quickEditOpen && (
        <div className="modal-overlay" style={{ zIndex: 99999, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="modal card" style={{ maxWidth: 840, width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', border: '1.5px solid #10b981', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '1.25rem 1.5rem', background: 'linear-gradient(90deg, #064e3b, #065f46)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #047857' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={20} color="#fef08a" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Quick Live Edit Soal
                    <span className="badge badge-active" style={{ fontSize: '0.68rem', background: '#d1fae5', color: '#065f46' }}>
                      <span className="live-pulse-dot" /> AKTIF
                    </span>
                  </h3>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#a7f3d0' }}>
                    Perbaiki nomor, teks soal, opsi, atau kunci jawaban saat ujian berlangsung tanpa membatalkan publikasi ujian.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setQuickEditOpen(false)}
                style={{ color: '#ffffff', padding: '0.3rem', minHeight: 'auto' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Notification alert */}
            {quickNotice && (
              <div style={{ padding: '0.75rem 1.5rem', background: '#ecfdf5', color: '#065f46', borderBottom: '1px solid #a7f3d0', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={16} color="#059669" />
                <span>{quickNotice}</span>
              </div>
            )}
            {quickError && (
              <div style={{ padding: '0.75rem 1.5rem', background: '#fef2f2', color: '#991b1b', borderBottom: '1px solid #fecaca', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={16} color="#dc2626" />
                <span>{quickError}</span>
              </div>
            )}

            {/* Modal Body */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              
              {/* Question list sidebar */}
              <div style={{ width: 180, borderRight: '1px solid var(--border)', background: 'var(--bg-card)', padding: '0.75rem', overflowY: 'auto' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Daftar Soal ({examQuestions.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {examQuestions.map((q, idx) => {
                    const isSelected = idx === selectedQIndex
                    return (
                      <button
                        key={q.id || idx}
                        type="button"
                        onClick={() => handleSelectQuestion(idx)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.45rem 0.65rem',
                          borderRadius: '6px',
                          border: isSelected ? '1.5px solid #10b981' : '1px solid var(--border)',
                          background: isSelected ? '#ecfdf5' : '#ffffff',
                          color: isSelected ? '#065f46' : 'var(--text)',
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <span>Soal #{q.number || idx + 1}</span>
                        <span style={{ fontSize: '0.65rem', opacity: 0.8, textTransform: 'uppercase' }}>
                          {q.type === 'COMPLEX_MCQ' ? 'Multi' : q.type}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Question editor pane */}
              <div style={{ flex: 1, padding: '1.25rem 1.5rem', overflowY: 'auto' }}>
                {editingQ ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    
                    {/* Top Row: Question Number & Points */}
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <div style={{ width: 140 }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                          Nomor Urut Soal:
                        </label>
                        <input
                          type="number"
                          className="form-control"
                          value={editingQ.number}
                          onChange={e => setEditingQ(prev => ({ ...prev, number: parseInt(e.target.value) || 1 }))}
                          style={{ padding: '0.4rem 0.6rem', fontSize: '0.88rem', fontWeight: 700 }}
                        />
                      </div>
                      <div style={{ width: 120 }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                          Bobot Poin:
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          className="form-control"
                          value={editingQ.points}
                          onChange={e => setEditingQ(prev => ({ ...prev, points: parseFloat(e.target.value) || 1 }))}
                          style={{ padding: '0.4rem 0.6rem', fontSize: '0.88rem' }}
                        />
                      </div>
                      <div style={{ flex: 1, textAlign: 'right' }}>
                        <span className="badge badge-gold" style={{ fontSize: '0.72rem' }}>
                          Tipe: {editingQ.type}
                        </span>
                      </div>
                    </div>

                    {/* Question text */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        Teks / Narasi Pertanyaan:
                      </label>
                      <textarea
                        className="form-control"
                        rows={3}
                        value={editingQ.question_text || ''}
                        onChange={e => setEditingQ(prev => ({ ...prev, question_text: e.target.value }))}
                        placeholder="Ketik teks pertanyaan..."
                        style={{ fontSize: '0.9rem', lineHeight: 1.5, fontFamily: 'inherit' }}
                      />
                    </div>

                    {/* Options editing for MCQ / COMPLEX_MCQ */}
                    {['MCQ', 'COMPLEX_MCQ'].includes(editingQ.type) && editingQ.options && (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                          Pilihan Jawaban (Opsi):
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                          {Object.keys(editingQ.options).map((key) => {
                            const isMcq = editingQ.type === 'MCQ'
                            const isCorrect = isMcq
                              ? editingQ.correct_answer === key
                              : Array.isArray(editingQ.correct_answer) && editingQ.correct_answer.includes(key)

                            return (
                              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isMcq) {
                                      setEditingQ(prev => ({ ...prev, correct_answer: key }))
                                    } else {
                                      const cur = Array.isArray(editingQ.correct_answer) ? [...editingQ.correct_answer] : []
                                      const next = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key]
                                      setEditingQ(prev => ({ ...prev, correct_answer: next }))
                                    }
                                  }}
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: '6px',
                                    fontWeight: 800,
                                    fontSize: '0.85rem',
                                    border: isCorrect ? '2px solid #059669' : '1px solid var(--border)',
                                    background: isCorrect ? '#10b981' : '#f1f5f9',
                                    color: isCorrect ? '#ffffff' : 'var(--text)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                  }}
                                  title={isCorrect ? 'Kunci jawaban benar' : 'Klik untuk jadikan kunci jawaban benar'}
                                >
                                  {key}
                                </button>
                                <input
                                  type="text"
                                  className="form-control"
                                  value={editingQ.options[key] || ''}
                                  onChange={e => {
                                    const val = e.target.value
                                    setEditingQ(prev => ({
                                      ...prev,
                                      options: { ...prev.options, [key]: val }
                                    }))
                                  }}
                                  placeholder={`Teks pilihan ${key}...`}
                                  style={{ flex: 1, padding: '0.4rem 0.65rem', fontSize: '0.88rem' }}
                                />
                                {isCorrect && (
                                  <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700, flexShrink: 0 }}>
                                    ✓ KUNCI BENAR
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* True / False correct answer selector */}
                    {editingQ.type === 'TRUE_FALSE' && editingQ.options && (
                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                          Pernyataan & Kunci Benar / Salah:
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                          {Object.keys(editingQ.options).map((key, i) => {
                            const curAns = editingQ.correct_answer?.[key] || 'true'
                            return (
                              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f8fafc', padding: '0.5rem', borderRadius: 8 }}>
                                <span style={{ fontWeight: 700, fontSize: '0.8rem', width: 24 }}>#{i + 1}</span>
                                <input
                                  type="text"
                                  className="form-control"
                                  value={editingQ.options[key] || ''}
                                  onChange={e => {
                                    const val = e.target.value
                                    setEditingQ(prev => ({
                                      ...prev,
                                      options: { ...prev.options, [key]: val }
                                    }))
                                  }}
                                  style={{ flex: 1, padding: '0.35rem 0.55rem', fontSize: '0.85rem' }}
                                />
                                <div style={{ display: 'flex', gap: '0.25rem' }}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingQ(prev => ({
                                        ...prev,
                                        correct_answer: { ...(prev.correct_answer || {}), [key]: 'true' }
                                      }))
                                    }}
                                    className={`btn btn-xs ${curAns === 'true' ? 'btn-success' : 'btn-ghost'}`}
                                    style={{ fontSize: '0.72rem', fontWeight: 700 }}
                                  >
                                    Benar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingQ(prev => ({
                                        ...prev,
                                        correct_answer: { ...(prev.correct_answer || {}), [key]: 'false' }
                                      }))
                                    }}
                                    className={`btn btn-xs ${curAns === 'false' ? 'btn-danger' : 'btn-ghost'}`}
                                    style={{ fontSize: '0.72rem', fontWeight: 700 }}
                                  >
                                    Salah
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Image URL (Optional) */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                        URL Gambar Soal (Google Drive / Link langsung):
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        value={editingQ.image_url || ''}
                        onChange={e => setEditingQ(prev => ({ ...prev, image_url: e.target.value }))}
                        placeholder="https://drive.google.com/file/d/..."
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.82rem' }}
                      />
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                    Pilih butir soal di samping untuk mulai mengedit.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div style={{ padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => navigate(`/teacher/edit/${examId}`)}
                style={{ fontSize: '0.82rem' }}
              >
                <Edit2 size={13} /> Buka Question Maker Lengkap
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setQuickEditOpen(false)}
                >
                  Tutup
                </button>
                <button
                  type="button"
                  className="btn btn-gold btn-sm"
                  onClick={handleQuickApply}
                  disabled={quickSaving || !editingQ}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    background: 'linear-gradient(135deg, #059669, #047857)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    padding: '0.45rem 1rem',
                    boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)'
                  }}
                >
                  <Zap size={14} />
                  <span>{quickSaving ? 'Menerapkan...' : '⚡ Terapkan Langsung ke Siswa'}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
