import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCurrentUser } from '../lib/auth'
import { exams, questions, sessions, results } from '../lib/db'
import { isNetworkError, isOffline } from '../lib/network'
import { loadOffline, saveOffline, slimSession } from '../lib/offlineCache'
import {
  BookOpen,
  Clock,
  Users,
  ShieldAlert,
  Play,
  RotateCcw,
  Zap,
  Camera,
  AlertTriangle,
  CheckCircle,
  Info,
  Lock,
  Unlock,
  Key,
  ArrowLeft
} from 'lucide-react'
import { MONITORING_LEVELS } from '../lib/monitoringConfig'
import { MonitoringIcon } from '../lib/monitoringUI'
import {
  verifyAndUnlockReturnee,
  sanitizeReturneeToken,
  markSessionAsReturnee
} from '../lib/returnee'
// passiveSelfie capture is now handled inside ExamRoom (deferred, non-blocking)

export default function ExamLobby() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const user = getCurrentUser()
  const isPrivileged = user?.role === 'SUPERADMIN' || user?.role === 'MODERATOR' || user?.level >= 3

  const [exam, setExam] = useState(null)
  const [questionCount, setQuestionCount] = useState(0)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [cameraGranted, setCameraGranted] = useState(false)
  const [cameraChecking, setCameraChecking] = useState(false)
  const [cameraError, setCameraError] = useState('')

  // Returnee verification state
  const [returneeTokenInput, setReturneeTokenInput] = useState('')
  const [verifyingToken, setVerifyingToken] = useState(false)
  const [returneeError, setReturneeError] = useState('')
  const [returneeSuccess, setReturneeSuccess] = useState('')
  // Set when the server could not be reached: the lobby shows the last saved
  // exam info, keeps retrying, and blocks entering until the lock state can
  // be checked again.
  const [connectionIssue, setConnectionIssue] = useState('')
  const [reloadTick, setReloadTick] = useState(0)
  // One session id per lobby visit, so pressing "Mulai" again after a lost
  // response can never create a second session row.
  const newSessionIdRef = useRef(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      const [examRes, countRes, sessRes] = await Promise.all([
        exams.getById(examId),
        questions.countByExam(examId),
        sessions.get(user.id, examId),
      ])
      if (cancelled) return
      const examData = examRes.data
      const qCount = countRes.count
      const sess = sessRes.data

      const networkFailed = isOffline() ||
        (!examData && isNetworkError(examRes.error)) ||
        Boolean(sessRes.error && isNetworkError(sessRes.error))
      if (networkFailed) {
        const saved = loadOffline(user.id, `lobby_${examId}`)
        if (saved?.data?.exam) {
          setExam(saved.data.exam)
          setQuestionCount(saved.data.questionCount || 0)
          setSession(saved.data.session || null)
        }
        setConnectionIssue('Koneksi internet bermasalah. Menampilkan data ujian terakhir yang tersimpan di perangkat — halaman dimuat ulang otomatis saat koneksi kembali.')
        setLoading(false)
        return
      }
      setConnectionIssue('')

      // Redirect surveys to SurveyRoom — no lobby needed
      if (examData?.mode === 'survey') {
        navigate(`/survey/${examId}`, { replace: true })
        return
      }

      let currentSess = sess

      // Guard: if exam is not published (closed or draft), redirect student
      if (!isPrivileged && examData && examData.status !== 'published') {
        const { data: res } = await results.get(user.id, examId)
        if (res?.id) {
          navigate(`/results/${res.id}`, { replace: true })
        } else {
          alert(
            examData.status === 'closed'
              ? 'Ujian ini telah ditutup secara resmi oleh guru pengawas.'
              : 'Ujian ini sedang tidak aktif / berstatus draft.'
          )
          navigate('/home', { replace: true })
        }
        return
      }

      // Check if time has expired for this student, automatically lock them and sync score
      if (!isPrivileged && sess) {
        const isExpired = sess.end_timestamp && new Date(sess.end_timestamp).getTime() <= Date.now()
        if (isExpired && sess.status === 'active') {
          currentSess = { ...sess, status: 'time_up' }
          sessions.syncMinimal(sess.id, { status: 'time_up' }).catch(() => {})
        }
      }

      // Check if student has active session that was interrupted / from outside the room
      if (!isPrivileged && currentSess && currentSess.status === 'active') {
        const inRoom = sessionStorage.getItem('binar_exam_active_room') === examId
        const isRecentlyUnlocked = sess.returnee_unlocked_at && 
          (Date.now() - new Date(sess.returnee_unlocked_at).getTime() < 15 * 60 * 1000)

        if (sess.returnee_token_required) {
          currentSess = sess
        } else if (!inRoom && !isRecentlyUnlocked) {
          await markSessionAsReturnee(sess.id, 'Sesi terputus / login ulang')
          currentSess = { ...sess, returnee_token_required: true, returnee_reason: 'Sesi terputus / login ulang' }
        } else if (!sess.returnee_token_required && isRecentlyUnlocked) {
          // Proctor unlocked them! Auto-grant active room permission and proceed
          sessionStorage.setItem('binar_exam_active_room', examId)
        }
      } else if (isPrivileged) {
        // Auto-grant active room access for admin & teachers testing/previewing
        sessionStorage.setItem('binar_exam_active_room', examId)
      }

      setExam(examData)
      setQuestionCount(qCount || 0)
      setSession(currentSess)
      setLoading(false)
      if (examData) {
        saveOffline(user.id, `lobby_${examId}`, {
          exam: examData,
          questionCount: qCount || 0,
          session: slimSession(currentSess),
        })
      }
    }
    load()
    return () => { cancelled = true }
  }, [examId, user?.id, navigate, reloadTick])

  // ─── Reload automatically once the connection is back ──────────────────────
  useEffect(() => {
    if (!connectionIssue) return
    const retry = () => setReloadTick(t => t + 1)
    window.addEventListener('online', retry)
    const timer = setInterval(() => { if (!isOffline()) retry() }, 20000)
    return () => {
      window.removeEventListener('online', retry)
      clearInterval(timer)
    }
  }, [connectionIssue])

  // ─── Auto-listen for proctor unlock while student is locked in lobby ────────
  useEffect(() => {
    if (!session?.returnee_token_required || !user?.id || !examId) return
    let inFlight = false
    const interval = setInterval(async () => {
      // Light status-only query, one at a time, nothing while offline
      if (inFlight || isOffline()) return
      inFlight = true
      try {
        const { data: latestSess } = await sessions.getStatus(user.id, examId)
        if (latestSess && !latestSess.returnee_token_required && latestSess.status === 'active') {
          setSession(prev => ({ ...(prev || {}), ...latestSess }))
          setReturneeSuccess('Pengawas telah membuka kunci ujian Anda! Mengalihkan ke ruang ujian...')
          sessionStorage.setItem('binar_exam_active_room', examId)
          setTimeout(() => {
            navigate(`/exam/${examId}/room`)
          }, 1000)
        }
      } finally {
        inFlight = false
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [session?.returnee_token_required, user?.id, examId, navigate])

  // ─── Passive Selfie ─────────────────────────────────────────────────────
  // Selfie capture is now done inside ExamRoom after the student has entered.
  // The lobby never blocks start or waits for camera.


  const monitorLevel = exam?.monitoring_level || 1
  const levelConfig = MONITORING_LEVELS[monitorLevel] || MONITORING_LEVELS[1]
  const needsCamera = monitorLevel === 4

  // Camera check for Level 4
  async function handleCameraCheck() {
    setCameraChecking(true)
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false,
      })
      // Immediately stop — we just needed permission
      stream.getTracks().forEach(t => t.stop())
      setCameraGranted(true)
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Akses kamera ditolak. Izinkan kamera di pengaturan browser untuk memulai ujian.'
        : err.name === 'NotFoundError'
        ? 'Kamera tidak ditemukan. Pastikan perangkat memiliki kamera yang berfungsi.'
        : `Gagal mengakses kamera: ${err.message}`
      setCameraError(msg)
    }
    setCameraChecking(false)
  }

  async function handleStart() {
    if (needsCamera && !cameraGranted) {
      setCameraError('Kamera harus diaktifkan sebelum memulai ujian Level 4.')
      return
    }

    // If student's time already expired, prevent start, lock, and show message
    if (!isPrivileged && session) {
      const isExpired = session.end_timestamp && new Date(session.end_timestamp).getTime() <= Date.now()
      if (isExpired || session.status === 'time_up' || session.status === 'submitted') {
        await sessions.autoLockAndSyncExam(examId)
        setSession(prev => ({ ...prev, status: 'time_up' }))
        setError('Waktu ujian Anda telah habis dan ujian telah dikumpulkan secara otomatis.')
        return
      }
    }

    setStarting(true)
    setError('')
    try {
      const durationMs = exam.mode === 'quiz'
        ? exam.duration_minutes * 1000
        : exam.duration_minutes * 60 * 1000
      const endTimestamp = new Date(Date.now() + durationMs).toISOString()

      if (!session || session.status === 'reset') {
        const initialAnswers = isPrivileged ? { _try_mode: true, _try_started_at: new Date().toISOString() } : {}
        if (session) {
          const { error: upErr } = await sessions.update(session.id, {
            status: 'active',
            end_timestamp: endTimestamp,
            answers: initialAnswers,
            violation_count: 0,
            current_question: 1,
            returnee_token_required: false,
            returnee_token: null,
            returnee_reason: null,
          })
          if (upErr) throw new Error(upErr.message)
        } else {
          if (!newSessionIdRef.current) {
            newSessionIdRef.current = `sess-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`
          }
          const { error: crErr } = await sessions.create({
            id: newSessionIdRef.current,
            student_id: user.id,
            exam_id: examId,
            variant: 'A',
            end_timestamp: endTimestamp,
            answers: initialAnswers,
            violation_count: 0,
            current_question: 1,
            status: 'active',
            returnee_token_required: false,
          })
          if (crErr) {
            // Same id already stored = an earlier attempt did succeed
            const alreadyCreated = crErr.code === '23505' || /duplicate key/i.test(crErr.message || '')
            if (!alreadyCreated) {
              // The response may have been lost after the row was created: check before failing
              const { data: existing } = isNetworkError(crErr)
                ? await sessions.getStatus(user.id, examId)
                : { data: null }
              if (!existing) throw crErr
            }
          }
        }
      }

      sessionStorage.setItem('binar_exam_active_room', examId)
      navigate(`/exam/${examId}/room`)
    } catch (err) {
      setError(
        isOffline() || isNetworkError(err)
          ? 'Gagal memulai ujian karena koneksi terputus. Jawaban belum ada yang hilang — tunggu sinyal stabil lalu tekan tombol lagi.'
          : 'Gagal memulai ujian: ' + (err.message || err)
      )
      setStarting(false)
    }
  }

  // ─── Returnee Token Verification ───────────────────────────────────────────
  async function handleVerifyReturneeToken() {
    if (needsCamera && !cameraGranted) {
      setCameraError('Kamera harus diaktifkan sebelum memulai ujian Level 4.')
      return
    }

    const clean = sanitizeReturneeToken(returneeTokenInput)
    if (clean.length !== 6) {
      setReturneeError('Token harus terdiri dari 6 karakter angka atau huruf.')
      return
    }

    setVerifyingToken(true)
    setReturneeError('')
    setReturneeSuccess('')

    const res = await verifyAndUnlockReturnee({
      sessionId: session.id,
      examId,
      token: clean
    })

    if (res.success) {
      setReturneeSuccess('Token valid! Mengalihkan ke ruang ujian...')
      sessionStorage.setItem('binar_exam_active_room', examId)
      setSession(prev => prev ? { ...prev, returnee_token_required: false } : prev)
      setTimeout(() => {
        navigate(`/exam/${examId}/room`)
      }, 700)
    } else {
      setReturneeError(res.error || 'Token tidak valid.')
      setVerifyingToken(false)
    }
  }

  async function handleRecheckUnlock() {
    const { data: updatedSess } = await sessions.getStatus(user.id, examId)
    if (updatedSess && !updatedSess.returnee_token_required) {
      setSession(prev => ({ ...(prev || {}), ...updatedSess }))
      setReturneeSuccess('Kunci telah dibuka oleh pengawas! Mengalihkan...')
      sessionStorage.setItem('binar_exam_active_room', examId)
      setTimeout(() => {
        navigate(`/exam/${examId}/room`)
      }, 700)
    } else {
      setReturneeError('Sesi masih terkunci. Silakan masukkan token atau minta pengawas membuka kunci.')
    }
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  )

  if (!exam) return (
    <div className="loading-screen" style={{ padding: '1.5rem', textAlign: 'center' }}>
      {connectionIssue ? (
        <div style={{ maxWidth: 420 }}>
          <div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 1rem' }} />
          <p style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Menunggu koneksi internet…</p>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            Data ujian belum bisa dimuat. Halaman akan terbuka otomatis saat koneksi kembali.
          </p>
        </div>
      ) : (
        <p className="text-muted">Ujian tidak ditemukan.</p>
      )}
    </div>
  )

  const isDone = session?.status === 'submitted' || session?.status === 'time_up'
  const isActive = session?.status === 'active'
  const isReturneeRequired = !isPrivileged && Boolean(isActive && session?.returnee_token_required)
  const canStart = !needsCamera || cameraGranted
  const backPath = user?.role === 'SUPERADMIN' ? '/admin/exams' : (user?.role === 'MODERATOR' ? '/teacher/exams' : '/home')

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)', padding: '1rem' }}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        {/* Top Back Navigation */}
        <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(backPath)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              color: '#334155',
              fontWeight: 600,
              fontSize: '0.82rem',
              background: '#ffffff',
              border: '1.5px solid #cbd5e1',
              borderRadius: '8px',
              padding: '0.45rem 0.85rem',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            <ArrowLeft size={15} />
            <span>Kembali ke Beranda Ujian</span>
          </button>
        </div>

        {/* Header brand & icon */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            fontSize: '0.88rem',
            fontWeight: 700,
            color: '#1b3361',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: '0.65rem'
          }}>
            Sistem Asesmen Terpadu
          </div>
          <img
            src={`${import.meta.env.BASE_URL}Logo_SNT.webp`}
            alt="Logo SNT 10 Kupang"
            style={{
              height: 100,
              width: 100,
              objectFit: 'contain',
              margin: '0 auto 0.65rem',
              background: '#ffffff',
              borderRadius: '20px',
              padding: '8px',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
              border: '1px solid rgba(27, 51, 97, 0.1)',
              display: 'block'
            }}
          />
          <div style={{
            fontSize: '1.25rem',
            fontWeight: 800,
            color: '#1b3361',
            marginBottom: '1rem'
          }}>
            SNT 10 Kupang
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{exam.title}</h1>
            <span className={`badge ${exam.mode === 'quiz' ? 'badge-active' : 'badge-draft'}`} style={{ fontSize: '0.75rem' }}>
              {exam.mode === 'quiz' ? '⚡ Kuis' : '📝 Ujian'}
            </span>
          </div>
          <p className="text-muted text-sm">Baca ketentuan sebelum memulai {exam.mode === 'quiz' ? 'kuis' : 'ujian'}</p>
        </div>

        {/* Custom Exam Information / Rules */}
        {exam.information && (
          <div className="card" style={{ marginBottom: '1.25rem', borderColor: 'rgba(79,142,247,0.3)', background: 'rgba(79,142,247,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#000', fontWeight: 600 }}>
              <Info size={16} />
              <span>Informasi Tambahan</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {exam.information}
            </div>
          </div>
        )}

        {/* Exam info card */}
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Stat icon={<Clock size={18} />} label="Durasi" value={
              exam.mode === 'quiz'
                ? 'Timer per soal'
                : `${exam.duration_minutes} Menit`
            } />
            <Stat icon={<Users size={18} />} label="Soal" value={`${questionCount} Pertanyaan`} />
          </div>
        </div>

        {/* Monitoring Level Badge */}
        <div className="card" style={{
          marginBottom: '1.25rem',
          borderColor: levelConfig.colorBorder,
          background: levelConfig.colorBg,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: `${levelConfig.color}20`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MonitoringIcon level={monitorLevel} size={28} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: levelConfig.color }}>
                Level {monitorLevel} — {levelConfig.name}
              </div>
              {monitorLevel === 4 && levelConfig.fullName && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {levelConfig.fullName}
                </div>
              )}
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                {levelConfig.tagline}
              </div>
            </div>
          </div>
        </div>

        {/* Rules — specific to monitoring level */}
        <div className="card" style={{ marginBottom: '1.25rem', borderColor: `${levelConfig.color}40` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
            <ShieldAlert size={18} color={levelConfig.color} />
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: levelConfig.color }}>
              Peraturan {exam.mode === 'quiz' ? 'Kuis' : 'Ujian'} — {levelConfig.name}
            </span>
          </div>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '1rem' }}>
            {levelConfig.briefRules.map((rule, i) => (
              <li key={i} style={rule.startsWith('⚠️') || rule.startsWith('🔴') || rule.startsWith('⏰') ? { color: levelConfig.color, fontWeight: 600 } : {}}>
                {rule}
              </li>
            ))}
            {exam.mode === 'quiz' && (
              <li style={{ color: 'var(--warning)', fontWeight: 600 }}>Mode Kuis: Anda hanya dapat maju ke soal berikutnya, tidak bisa kembali.</li>
            )}
            <li style={{ color: '#b91c1c', fontWeight: 600 }}>
              🌐 Larangan Terjemahan: Dilarang menggunakan fitur terjemahan otomatis browser (Google/Edge Translate). Halaman soal akan otomatis diblokir dan dicatat sebagai pelanggaran jika terjemahan aktif.
            </li>
            <li style={{ color: '#dc2626', fontWeight: 600 }}>
              Ketentuan Returnee: Jika Anda keluar atau terdeteksi logout, Anda membutuhkan Token Masuk Kembali dari Pengawas (Guru/Admin) untuk dapat melanjutkan.
            </li>
            <li>Jawaban disimpan otomatis setiap 10 detik.</li>
          </ul>
        </div>

        {/* Camera check for Level 4 */}
        {needsCamera && !isDone && (
          <div className="card" style={{
            marginBottom: '1.25rem',
            borderColor: cameraGranted ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
            background: cameraGranted ? 'var(--success-bg)' : 'var(--danger-bg)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Camera size={22} color={cameraGranted ? '#fff' : 'var(--danger)'} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: cameraGranted ? '#fff' : 'var(--danger)' }}>
                  {cameraGranted ? '✅ Kamera Aktif' : '🔴 Kamera Diperlukan'}
                </div>
                <p className="text-muted text-sm" style={{ margin: '0.15rem 0 0' }}>
                  {cameraGranted
                    ? 'Kamera siap. Sistem deteksi wajah akan aktif selama ujian.'
                    : 'Ujian Level 4 memerlukan akses kamera untuk deteksi wajah.'}
                </p>
              </div>
              {!cameraGranted && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleCameraCheck}
                  disabled={cameraChecking}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {cameraChecking
                    ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Memeriksa...</>
                    : <><Camera size={14} /> Izinkan Kamera</>}
                </button>
              )}
            </div>
            {cameraError && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <AlertTriangle size={14} /> {cameraError}
              </div>
            )}
          </div>
        )}

        {connectionIssue && (
          <div className="alert alert-warning" role="status" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
            {connectionIssue} Masuk ke ruang ujian membutuhkan koneksi untuk memeriksa status ujian Anda.
          </div>
        )}
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        {isDone ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="alert alert-success" style={{ textAlign: 'center', justifyContent: 'center' }}>
              <CheckCircle size={16} /> Anda telah menyelesaikan ujian ini.
            </div>
            <button
              type="button"
              className="btn btn-secondary w-full"
              onClick={() => navigate(backPath)}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}
            >
              <ArrowLeft size={16} /> Kembali ke Daftar Ujian
            </button>
          </div>
        ) : isReturneeRequired ? (
          /* Returnee Token Verification Card */
          <div className="card" style={{
            marginBottom: '1.25rem',
            border: '2px solid rgba(239, 68, 68, 0.4)',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.06) 0%, rgba(245, 166, 35, 0.05) 100%)',
            borderRadius: '14px',
            padding: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem', color: '#dc2626' }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Lock size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                  Status: Peserta Ujian Kembali (Returnee)
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Alasan: {session.returnee_reason || 'Logout terdeteksi'}
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#334155', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
              Sesi ujian Anda terputus atau terdeteksi logout. Sistem ujian menggunakan <strong>Token Ujian Terpusat (OSN/TKA System)</strong>. Masukkan Token Ujian yang sedang aktif dari Pengawas di ruangan untuk melanjutkan.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <input
                type="text"
                className="token-digit-input"
                placeholder="6 DIGIT TOKEN"
                maxLength={6}
                value={returneeTokenInput}
                onChange={(e) => {
                  setReturneeTokenInput(sanitizeReturneeToken(e.target.value))
                  setReturneeError('')
                }}
                disabled={verifyingToken}
                style={{ textTransform: 'uppercase', letterSpacing: '0.25em', fontWeight: 800, textAlign: 'center', fontSize: '1.25rem' }}
                autoFocus
              />
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Hanya angka &amp; huruf alfabet ({returneeTokenInput.length}/6)
              </span>
            </div>

            {returneeError && (
              <div className="alert alert-error" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                <AlertTriangle size={15} /> {returneeError}
              </div>
            )}

            {returneeSuccess && (
              <div className="alert alert-success" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                <CheckCircle size={15} /> {returneeSuccess}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <button
                className="btn btn-gold btn-lg w-full"
                onClick={handleVerifyReturneeToken}
                disabled={verifyingToken || returneeTokenInput.length !== 6 || !canStart || Boolean(connectionIssue)}
                style={(!canStart || returneeTokenInput.length !== 6) ? { opacity: 0.6 } : {}}
              >
                {verifyingToken ? (
                  <><div className="spinner" style={{ width: 18, height: 18 }} /> Memverifikasi Token...</>
                ) : (
                  <><Unlock size={18} /> Verifikasi Token &amp; Lanjutkan Ujian</>
                )}
              </button>

              <button
                className="btn btn-ghost btn-sm w-full"
                onClick={handleRecheckUnlock}
                style={{ fontSize: '0.8rem', color: '#64748b' }}
              >
                <RotateCcw size={13} /> Periksa Ulang (Jika Dibuka Langsung oleh Pengawas)
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-sm w-full"
                onClick={() => navigate('/home')}
                style={{ fontSize: '0.8rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
              >
                <ArrowLeft size={14} /> Kembali ke Daftar Ujian
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <button
              className="btn btn-gold btn-lg w-full"
              onClick={handleStart}
              disabled={starting || !canStart || Boolean(connectionIssue)}
              style={!canStart ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              {starting
                ? <><div className="spinner" style={{ width: 20, height: 20, borderColor: 'rgba(0,0,0,0.2)', borderTopColor: '#0A1628' }} /> Memulai...</>
                : isActive
                ? <><RotateCcw size={18} /> Lanjutkan Ujian</>
                : <><Play size={18} /> Mulai {exam.mode === 'quiz' ? 'Kuis' : 'Ujian'}</>
              }
            </button>

            <button
              type="button"
              className="btn btn-ghost w-full"
              onClick={() => navigate('/home')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                color: '#475569',
                fontWeight: 600,
                fontSize: '0.85rem',
                border: '1.5px solid #cbd5e1',
                background: '#ffffff',
                borderRadius: '8px',
                padding: '0.6rem 1rem',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={16} /> Kembali ke Daftar Ujian
            </button>
          </div>
        )}

        {!canStart && !isDone && (
          <p className="text-danger text-xs" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            Aktifkan kamera terlebih dahulu untuk memulai ujian Level 4.
          </p>
        )}

        <p className="text-muted text-xs" style={{ textAlign: 'center', marginTop: '1rem' }}>
          Masuk sebagai: <strong>{user.name}</strong>
        </p>
        <div className="app-footer">
          <div>&copy;2026 SNT 10 Kupang. All rights reserved.</div>
          <div>System Engineered &amp; Maintain by Maulana Sulthoni.</div>
        </div>
      </div>
    </div>
  )
}

function Stat({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(79,142,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>{icon}</div>
      <div>
        <div className="text-muted text-xs">{label}</div>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{value}</div>
      </div>
    </div>
  )
}
