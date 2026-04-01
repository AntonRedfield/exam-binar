import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCurrentUser } from '../lib/auth'
import { exams, questions, sessions } from '../lib/db'
import { BookOpen, Clock, Users, ShieldAlert, Play, RotateCcw } from 'lucide-react'

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

  useEffect(() => {
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
  }, [examId, user.id])

  async function handleStart() {
    setStarting(true)
    setError('')
    try {
      const endTimestamp = new Date(Date.now() + exam.duration_minutes * 60 * 1000).toISOString()

      if (!session || session.status === 'reset') {
        // Create or re-create session
        if (session) {
          // Update existing reset session
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)', padding: '1rem' }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        {/* Header icon */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img src="/binar-logo.png" alt="BINAR Logo" style={{ height: 160, objectFit: 'contain', margin: '0 auto 1rem' }} />
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>{exam.title}</h1>
          <p className="text-muted text-sm">Baca ketentuan sebelum memulai ujian</p>
        </div>

        {/* Exam info card */}
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Stat icon={<Clock size={18} />} label="Durasi" value={`${exam.duration_minutes} Menit`} />
            <Stat icon={<Users size={18} />} label="Soal" value={`${questionCount} Pertanyaan`} />
          </div>
        </div>

        {/* Rules */}
        <div className="card" style={{ marginBottom: '1.25rem', borderColor: 'rgba(245,158,11,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
            <ShieldAlert size={18} color="var(--warning)" />
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--warning)' }}>Peraturan Ujian</span>
          </div>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '1rem' }}>
            <li>Jangan berpindah tab atau jendela browser selama ujian.</li>
            <li>Klik kanan, copy, dan paste dinonaktifkan selama ujian.</li>
            <li>Timer berjalan di server — terus berjalan meskipun koneksi terputus.</li>
            <li>Jawaban disimpan otomatis setiap 10 detik.</li>
            <li>Setiap pelanggaran akan tercatat dalam laporan hasil.</li>
          </ul>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        {isDone ? (
          <div className="alert alert-success" style={{ textAlign: 'center', justifyContent: 'center' }}>
            <CheckCircle size={16} /> Anda telah menyelesaikan ujian ini.
          </div>
        ) : (
          <button className="btn btn-gold btn-lg w-full" onClick={handleStart} disabled={starting}>
            {starting
              ? <><div className="spinner" style={{ width: 20, height: 20, borderColor: 'rgba(0,0,0,0.2)', borderTopColor: '#0A1628' }} /> Memulai...</>
              : isActive
              ? <><RotateCcw size={18} /> Lanjutkan Ujian</>
              : <><Play size={18} /> Mulai Ujian</>
            }
          </button>
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
