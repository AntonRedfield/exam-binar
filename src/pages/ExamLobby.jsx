import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCurrentUser } from '../lib/auth'
import { exams, questions, sessions } from '../lib/db'
import { BookOpen, Clock, Users, ShieldAlert, Play, RotateCcw, Zap, Camera, AlertTriangle, CheckCircle } from 'lucide-react'
import { MONITORING_LEVELS } from '../lib/monitoringConfig'
import { MonitoringIcon, getMonitoringBadgeStyle } from '../lib/monitoringUI'

export default function ExamLobby() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const user = getCurrentUser()

  const [exam, setExam] = useState(null)
  const [questionCount, setQuestionCount] = useState(0)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [cameraGranted, setCameraGranted] = useState(false)
  const [cameraChecking, setCameraChecking] = useState(false)
  const [cameraError, setCameraError] = useState('')

  useEffect(() => {
    if (!user) return
    async function load() {
      const [{ data: examData }, { data: qs }, { data: sess }] = await Promise.all([
        exams.getById(examId),
        questions.listByExam(examId),
        sessions.get(user.id, examId),
      ])
      setExam(examData)
      setQuestionCount(qs?.length || 0)
      setSession(sess)
      setLoading(false)
    }
    load()
  }, [examId, user?.id])

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
    setStarting(true)
    setError('')
    try {
      const durationMs = exam.mode === 'quiz'
        ? exam.duration_minutes * 1000
        : exam.duration_minutes * 60 * 1000
      const endTimestamp = new Date(Date.now() + durationMs).toISOString()

      if (!session || session.status === 'reset') {
        if (session) {
          await sessions.update(session.id, {
            status: 'active',
            end_timestamp: endTimestamp,
            answers: {},
            violation_count: 0,
            current_question: 1,
          })
        } else {
          await sessions.create({
            student_id: user.id,
            exam_id: examId,
            variant: 'A',
            end_timestamp: endTimestamp,
            answers: {},
            violation_count: 0,
            current_question: 1,
            status: 'active',
          })
        }
      }
      navigate(`/exam/${examId}/room`)
    } catch (err) {
      setError('Gagal memulai ujian: ' + err.message)
      setStarting(false)
    }
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  )

  if (!exam) return (
    <div className="loading-screen">
      <p className="text-muted">Ujian tidak ditemukan.</p>
    </div>
  )

  const isDone = session?.status === 'submitted' || session?.status === 'time_up'
  const isActive = session?.status === 'active'
  const canStart = !needsCamera || cameraGranted

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)', padding: '1rem' }}>
      <div style={{ maxWidth: 560, width: '100%' }}>
        {/* Header icon */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img src={`${import.meta.env.BASE_URL}binar-logo.png`} alt="BINAR Logo" style={{ height: 160, objectFit: 'contain', margin: '0 auto 1rem' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{exam.title}</h1>
            <span className={`badge ${exam.mode === 'quiz' ? 'badge-active' : 'badge-draft'}`} style={{ fontSize: '0.75rem' }}>
              {exam.mode === 'quiz' ? '⚡ Kuis' : '📝 Ujian'}
            </span>
          </div>
          <p className="text-muted text-sm">Baca ketentuan sebelum memulai {exam.mode === 'quiz' ? 'kuis' : 'ujian'}</p>
        </div>

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
              {monitorLevel === 4 && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {MONITORING_LEVELS[4].fullName}
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
              <Camera size={22} color={cameraGranted ? 'var(--success)' : 'var(--danger)'} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: cameraGranted ? 'var(--success)' : 'var(--danger)' }}>
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

        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        {isDone ? (
          <div className="alert alert-success" style={{ textAlign: 'center', justifyContent: 'center' }}>
            <CheckCircle size={16} /> Anda telah menyelesaikan ujian ini.
          </div>
        ) : (
          <button
            className="btn btn-gold btn-lg w-full"
            onClick={handleStart}
            disabled={starting || !canStart}
            style={!canStart ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            {starting
              ? <><div className="spinner" style={{ width: 20, height: 20, borderColor: 'rgba(0,0,0,0.2)', borderTopColor: '#0A1628' }} /> Memulai...</>
              : isActive
              ? <><RotateCcw size={18} /> Lanjutkan Ujian</>
              : <><Play size={18} /> Mulai {exam.mode === 'quiz' ? 'Kuis' : 'Ujian'}</>
            }
          </button>
        )}

        {!canStart && !isDone && (
          <p className="text-danger text-xs" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            Aktifkan kamera terlebih dahulu untuk memulai ujian Level 4.
          </p>
        )}

        <p className="text-muted text-xs" style={{ textAlign: 'center', marginTop: '1rem' }}>
          Masuk sebagai: <strong>{user.name}</strong> ({user.id})
        </p>
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
