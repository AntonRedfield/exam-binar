import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { exams, sessions } from '../../lib/db'
import {
  RefreshCcw,
  ChevronLeft,
  RotateCcw,
  Activity,
  Key,
  Lock,
  Unlock,
  Copy,
  Check,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  X,
  Trash2,
  CheckCircle2,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { MONITORING_LEVELS } from '../../lib/monitoringConfig'
import { MonitoringIcon, getMonitoringBadgeStyle } from '../../lib/monitoringUI'
import {
  generateReturneeToken,
  isValidReturneeToken,
  sanitizeReturneeToken,
  setExamReturneeToken,
  clearExamReturneeToken,
  setStudentReturneeToken,
  unlockStudentReturnee,
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

export default function Monitor() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [sessionList, setSessionList] = useState([])
  const [loading, setLoading] = useState(true)
  const [, forceUpdate] = useState(0)
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })

  // Exam-level token management state
  const [isTokenPanelCollapsed, setIsTokenPanelCollapsed] = useState(false)
  const [examTokenCopied, setExamTokenCopied] = useState(false)
  const [isManualExamToken, setIsManualExamToken] = useState(false)
  const [manualExamTokenInput, setManualExamTokenInput] = useState('')
  const [examTokenError, setExamTokenError] = useState('')
  const [examTokenLoading, setExamTokenLoading] = useState(false)

  // Student-level token modal state
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentTokenInput, setStudentTokenInput] = useState('')
  const [studentTokenError, setStudentTokenError] = useState('')
  const [studentTokenCopied, setStudentTokenCopied] = useState(false)
  const [studentModalLoading, setStudentModalLoading] = useState(false)

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
    const studentName = sess.users?.full_name || sess.users?.name || 'Siswa'
    if (!confirm(`Reset ujian ${studentName}? Jawaban akan terhapus.`)) return
    await sessions.reset(sess.student_id, examId)
    await load()
  }

  // ─── Exam Returnee Token Handlers ──────────────────────────────────────────
  async function handleAutoGenerateExamToken() {
    setExamTokenLoading(true)
    setExamTokenError('')
    const { token, error } = await setExamReturneeToken(examId)
    if (error) {
      setExamTokenError(error.message || 'Gagal membuat token')
    } else {
      setExam(prev => prev ? { ...prev, returnee_token: token } : prev)
      setIsManualExamToken(false)
      setManualExamTokenInput('')
    }
    setExamTokenLoading(false)
    await load()
  }

  async function handleSaveManualExamToken() {
    const clean = sanitizeReturneeToken(manualExamTokenInput)
    if (!isValidReturneeToken(clean)) {
      setExamTokenError('Token harus terdiri dari tepat 6 karakter angka & huruf kecil (0-9, a-z).')
      return
    }
    setExamTokenLoading(true)
    setExamTokenError('')
    const { token, error } = await setExamReturneeToken(examId, clean)
    if (error) {
      setExamTokenError(error.message || 'Gagal menyimpan token')
    } else {
      setExam(prev => prev ? { ...prev, returnee_token: token } : prev)
      setIsManualExamToken(false)
      setManualExamTokenInput('')
    }
    setExamTokenLoading(false)
    await load()
  }

  async function handleClearExamToken() {
    if (!confirm('Hapus Token Returnee Ujian ini? Siswa yang belum masuk harus menunggu token baru.')) return
    setExamTokenLoading(true)
    await clearExamReturneeToken(examId)
    setExam(prev => prev ? { ...prev, returnee_token: null } : prev)
    setExamTokenLoading(false)
    await load()
  }

  function handleCopyExamToken() {
    if (!exam?.returnee_token) return
    navigator.clipboard.writeText(exam.returnee_token)
    setExamTokenCopied(true)
    setTimeout(() => setExamTokenCopied(false), 2000)
  }

  // ─── Student Returnee Handlers ─────────────────────────────────────────────
  function handleOpenStudentModal(sess) {
    setSelectedStudent(sess)
    setStudentTokenInput(sess.returnee_token || '')
    setStudentTokenError('')
    setStudentTokenCopied(false)
  }

  function handleCloseStudentModal() {
    setSelectedStudent(null)
    setStudentTokenInput('')
    setStudentTokenError('')
    setStudentTokenCopied(false)
  }

  async function handleDirectUnlock(sess) {
    const studentName = sess.users?.full_name || sess.users?.name || 'Siswa'
    if (!confirm(`Buka kunci ujian untuk ${studentName} tanpa memerlukan input token?`)) return
    await unlockStudentReturnee(sess.id)
    if (selectedStudent?.id === sess.id) {
      handleCloseStudentModal()
    }
    await load()
  }

  async function handleLockStudent(sess) {
    const studentName = sess.users?.full_name || sess.users?.name || 'Siswa'
    if (!confirm(`Kunci sesi ujian ${studentName} sebagai Returnee? Siswa harus memasukkan token untuk melanjutkan.`)) return
    await lockStudentReturnee(sess.id, 'Dikunci secara manual oleh pengawas')
    await load()
  }

  async function handleAutoGenerateStudentToken() {
    if (!selectedStudent) return
    setStudentModalLoading(true)
    setStudentTokenError('')
    const { token, error } = await setStudentReturneeToken(selectedStudent.id)
    if (error) {
      setStudentTokenError(error.message || 'Gagal membuat token')
    } else {
      setSelectedStudent(prev => prev ? { ...prev, returnee_token: token, returnee_token_required: true } : prev)
      setStudentTokenInput(token)
    }
    setStudentModalLoading(false)
    await load()
  }

  async function handleSaveManualStudentToken() {
    if (!selectedStudent) return
    const clean = sanitizeReturneeToken(studentTokenInput)
    if (!isValidReturneeToken(clean)) {
      setStudentTokenError('Token harus tepat 6 karakter angka & huruf kecil (contoh: 7b3x9a).')
      return
    }
    setStudentModalLoading(true)
    setStudentTokenError('')
    const { token, error } = await setStudentReturneeToken(selectedStudent.id, clean)
    if (error) {
      setStudentTokenError(error.message || 'Gagal menyimpan token')
    } else {
      setSelectedStudent(prev => prev ? { ...prev, returnee_token: token, returnee_token_required: true } : prev)
    }
    setStudentModalLoading(false)
    await load()
  }

  function handleCopyStudentToken() {
    if (!selectedStudent?.returnee_token) return
    navigator.clipboard.writeText(selectedStudent.returnee_token)
    setStudentTokenCopied(true)
    setTimeout(() => setStudentTokenCopied(false), 2000)
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
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCcw size={15} /> Refresh</button>
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
            <div>
              <div className="stat-value" style={returnees > 0 ? { color: 'var(--danger)' } : {}}>{returnees}</div>
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

        {/* Exam Returnee Token Management Panel */}
        <div className={`card card-collapsible ${isTokenPanelCollapsed ? 'collapsed' : ''}`} style={{
          marginBottom: '1.5rem',
          border: '1px solid rgba(27, 51, 97, 0.15)',
          background: 'linear-gradient(135deg, rgba(27, 51, 97, 0.03) 0%, rgba(245, 166, 35, 0.04) 100%)',
          borderRadius: '14px',
          padding: isTokenPanelCollapsed ? '0.85rem 1.25rem' : '1.25rem'
        }}>
          <div 
            className={`card-header-clickable ${isTokenPanelCollapsed ? 'collapsed' : ''}`}
            onClick={() => setIsTokenPanelCollapsed(prev => !prev)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{
                width: 38,
                height: 38,
                borderRadius: '10px',
                background: '#1b3361',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Key size={18} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1b3361' }}>
                    Token Masuk Kembali (Returnee Token)
                  </h3>
                  <span className="badge badge-gold" style={{ fontSize: '0.68rem' }}>Lv.3 &amp; Lv.4 User</span>
                  {isTokenPanelCollapsed && (
                    <span className="section-summary-preview">
                      {exam?.returnee_token ? `Token: ${exam.returnee_token}` : 'Belum Ada Token'}
                    </span>
                  )}
                </div>
                {!isTokenPanelCollapsed && (
                  <p className="text-muted text-xs" style={{ margin: '0.25rem 0 0', maxWidth: 620, lineHeight: 1.4 }}>
                    Siswa yang terputus, logout, atau ganti perangkat diwajibkan memasukkan token 6 karakter (angka &amp; huruf kecil) untuk melanjutkan ujian.
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
            <div className="card-collapsible-body" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(27, 51, 97, 0.1)' }}>
              {/* Token Action Controls */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {exam?.returnee_token ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ffffff', padding: '0.4rem 0.6rem', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
                      <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Token Ujian:</span>
                      <span className="token-display-badge">
                        {exam.returnee_token}
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleCopyExamToken}
                        title="Salin Token"
                        style={{ padding: '0.25rem 0.5rem' }}
                      >
                        {examTokenCopied ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm text-danger"
                        onClick={handleClearExamToken}
                        disabled={examTokenLoading}
                        title="Hapus Token"
                        style={{ padding: '0.25rem 0.5rem' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <span className="badge badge-draft" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                      Belum ada token ujian aktif
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleAutoGenerateExamToken}
                    disabled={examTokenLoading}
                    title="Generate token acak 6 digit"
                    style={{ background: '#ffffff', border: '1px solid #cbd5e1' }}
                  >
                    <Sparkles size={14} color="#f59e0b" /> Auto-Generate
                  </button>

                  <button
                    className={`btn btn-sm ${isManualExamToken ? 'btn-gold' : 'btn-ghost'}`}
                    onClick={() => {
                      setIsManualExamToken(!isManualExamToken)
                      setExamTokenError('')
                      setManualExamTokenInput(exam?.returnee_token || '')
                    }}
                    disabled={examTokenLoading}
                    style={!isManualExamToken ? { background: '#ffffff', border: '1px solid #cbd5e1' } : {}}
                  >
                    <Key size={14} /> {isManualExamToken ? 'Batal Manual' : 'Input Manual'}
                  </button>
                </div>
              </div>

              {/* Manual Input Form */}
              {isManualExamToken && (
                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: '#ffffff',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>
                      Ketik 6 Karakter Token (0-9, a-z):
                    </span>
                    <input
                      type="text"
                      className="token-digit-input"
                      style={{ maxWidth: 220, padding: '0.4rem 0.6rem', fontSize: '1.2rem' }}
                      placeholder="contoh: 7b3x9a"
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
                      <Check size={14} /> Terapkan Token
                    </button>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    * Karakter otomatis diubah ke huruf kecil dan simbol dibersihkan. Hanya angka dan huruf alfabet kecil diperbolehkan.
                  </div>
                  {examTokenError && (
                    <div style={{ color: '#ef4444', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <AlertTriangle size={14} /> {examTokenError}
                    </div>
                  )}
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
                  <th>Token Siswa</th>
                  <th>Sisa Waktu</th>
                  <th>Soal ke-</th>
                  <th>Dijawab</th>
                  <th>Pelanggaran</th>
                  <th style={{ textAlign: 'center' }}>Aksi Returnee &amp; Sesi</th>
                </tr>
              </thead>
              <tbody>
                {sortedSessions.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem' }}>Belum ada siswa yang memulai ujian.</td></tr>
                ) : sortedSessions.map(sess => {
                  const isReturnee = Boolean(sess.returnee_token_required)
                  return (
                    <tr key={sess.id} style={isReturnee ? { background: 'rgba(239, 68, 68, 0.04)' } : {}}>
                      <td style={{ fontWeight: 600 }}>
                        {sess.users?.full_name || sess.users?.name || 'Siswa Dihapus'}
                        {sess.users?.username && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                            @{sess.users.username}
                          </div>
                        )}
                      </td>
                      <td>{sess.users?.classes?.name || sess.users?.kelas || '—'}</td>
                      <td>{statusBadge(sess.status, isReturnee, sess.returnee_reason)}</td>
                      <td>
                        {sess.returnee_token ? (
                          <span className="token-display-badge" style={{ fontSize: '0.85rem', padding: '0.2rem 0.5rem' }}>
                            {sess.returnee_token}
                          </span>
                        ) : isReturnee ? (
                          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {exam?.returnee_token ? `Token Ujian (${exam.returnee_token})` : 'Perlu Token'}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{sess.status === 'active' ? getRemaining(sess.end_timestamp) : '—'}</td>
                      <td>{sess.current_question || 1}</td>
                      <td>{sess.answers ? Object.keys(sess.answers).length : 0}</td>
                      <td>
                        {sess.violation_count > 0
                          ? <span style={{ color: 'var(--warning)', fontWeight: 700 }}>⚠ {sess.violation_count}</span>
                          : <span className="text-muted">0</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {isReturnee ? (
                            <>
                              <button
                                className="btn btn-warning btn-sm"
                                onClick={() => handleOpenStudentModal(sess)}
                                title="Beri atau ubah token returnee khusus siswa ini"
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                              >
                                <Key size={12} /> Token
                              </button>
                              <button
                                className="btn btn-success btn-sm"
                                onClick={() => handleDirectUnlock(sess)}
                                title="Buka kunci langsung tanpa perlu input token"
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                              >
                                <Unlock size={12} /> Buka Kunci
                              </button>
                            </>
                          ) : sess.status === 'active' ? (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleLockStudent(sess)}
                              title="Kunci sesi siswa sebagai Returnee"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#64748b' }}
                            >
                              <Lock size={12} /> Kunci
                            </button>
                          ) : null}

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

      {/* Individual Student Returnee Modal */}
      {selectedStudent && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 22, 40, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div className="card" style={{
            maxWidth: 500,
            width: '100%',
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            padding: '1.75rem',
            position: 'relative'
          }}>
            <button
              onClick={handleCloseStudentModal}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#64748b',
                padding: '0.25rem'
              }}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: '12px',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Lock size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>
                  Kelola Returnee Siswa
                </h3>
                <p className="text-muted text-xs" style={{ margin: '0.15rem 0 0' }}>
                  {selectedStudent.users?.full_name || selectedStudent.users?.name} — {selectedStudent.users?.kelas || 'Kelas'}
                </p>
              </div>
            </div>

            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '0.85rem',
              marginBottom: '1.25rem',
              fontSize: '0.85rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: '#64748b' }}>Status:</span>
                <span style={{ fontWeight: 700, color: '#dc2626' }}>Terkunci (Returnee)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Alasan Terdeteksi:</span>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>{selectedStudent.returnee_reason || 'Logout terdeteksi'}</span>
              </div>
            </div>

            {/* Current Token Display */}
            <div style={{ marginBottom: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem', fontWeight: 600 }}>
                Token Returnee Khusus Siswa Ini:
              </div>
              {selectedStudent.returnee_token ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <span className="token-display-badge" style={{ fontSize: '1.35rem', padding: '0.4rem 1rem' }}>
                    {selectedStudent.returnee_token}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleCopyStudentToken}
                    title="Salin Token Siswa"
                  >
                    {studentTokenCopied ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
                  Belum ada token khusus. Siswa dapat menggunakan Token Ujian: <strong>{exam?.returnee_token || '(belum dibuat)'}</strong>
                </div>
              )}
            </div>

            {/* Token Generation Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-ghost w-full"
                  onClick={handleAutoGenerateStudentToken}
                  disabled={studentModalLoading}
                  style={{ border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                >
                  <Sparkles size={14} color="#f59e0b" /> Auto-Generate (6 Digit)
                </button>
              </div>

              {/* Manual Input for Student */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  className="token-digit-input"
                  placeholder="manual (6 digit)"
                  maxLength={6}
                  value={studentTokenInput}
                  onChange={(e) => {
                    setStudentTokenInput(sanitizeReturneeToken(e.target.value))
                    setStudentTokenError('')
                  }}
                  style={{ flex: 1, padding: '0.45rem 0.6rem', fontSize: '1rem' }}
                />
                <button
                  className="btn btn-gold btn-sm"
                  onClick={handleSaveManualStudentToken}
                  disabled={studentModalLoading || studentTokenInput.length !== 6}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Simpan Token
                </button>
              </div>
              {studentTokenError && (
                <div style={{ color: '#ef4444', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <AlertTriangle size={13} /> {studentTokenError}
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-success"
                onClick={() => handleDirectUnlock(selectedStudent)}
                style={{ flex: 1 }}
              >
                <Unlock size={15} /> Buka Kunci Langsung
              </button>
              <button className="btn btn-ghost" onClick={handleCloseStudentModal}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
