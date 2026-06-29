import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCurrentUser } from '../lib/auth'
import { exams, questions, sessions } from '../lib/db'
import { saveLocal, loadLocal, clearLocal } from '../lib/localAutosave'
import { ClipboardList, Send, ChevronLeft, ChevronRight, CheckCircle, Info, Edit3 } from 'lucide-react'
import QuestionShortAnswer from '../components/survey/QuestionShortAnswer'
import QuestionParagraph from '../components/survey/QuestionParagraph'
import QuestionLinearScale from '../components/survey/QuestionLinearScale'
import QuestionMCQGrid from '../components/survey/QuestionMCQGrid'
import QuestionCheckboxGrid from '../components/survey/QuestionCheckboxGrid'
import QuestionMultipleChoice from '../components/survey/QuestionMultipleChoice'
import QuestionCheckboxes from '../components/survey/QuestionCheckboxes'
import QuestionDropdown from '../components/survey/QuestionDropdown'

export default function SurveyRoom() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const user = getCurrentUser()

  const [exam, setExam] = useState(null)
  const [questionList, setQuestionList] = useState([])
  const [session, setSession] = useState(null)
  const [answers, setAnswers] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  const answersRef = useRef({})

  useEffect(() => {
    if (!user) return
    async function load() {
      const [{ data: examData }, { data: qs }, { data: sess }] = await Promise.all([
        exams.getById(examId),
        questions.listByExam(examId),
        sessions.get(user.id, examId),
      ])

      if (!examData || examData.mode !== 'survey') {
        navigate('/home')
        return
      }

      setExam(examData)
      setQuestionList(qs || [])

      // Try to recover answers from IndexedDB (local safety net)
      const localDraft = await loadLocal(user.id, examId)

      if (sess && (sess.status === 'submitted' || sess.status === 'time_up')) {
        setSubmitted(true)
        setAnswers(sess.answers || {})
        answersRef.current = sess.answers || {}
        setSession(sess)
        // Clear local draft since it's already submitted
        clearLocal(user.id, examId)
      } else if (sess) {
        // Merge: prefer server answers, but if empty fall back to local draft
        const serverAnswers = sess.answers || {}
        const hasServerAnswers = Object.keys(serverAnswers).length > 0
        const merged = hasServerAnswers ? serverAnswers : (localDraft?.answers || {})
        setAnswers(merged)
        answersRef.current = merged
        setSession(sess)
      } else if (examData.status === 'published') {
        // Create session immediately so auto-save works for first-time respondents
        const initialAnswers = localDraft?.answers || {}
        const { data: newSess } = await sessions.create({
          student_id: user.id,
          exam_id: examId,
          variant: 'A',
          answers: initialAnswers,
          violation_count: 0,
          current_question: 0,
          status: 'active',
        })
        if (newSess) {
          setSession(newSess)
          setAnswers(initialAnswers)
          answersRef.current = initialAnswers
        }
      }
      setLoading(false)
    }
    load()
  }, [examId, user?.id, navigate])

  // Auto-save to Supabase every 15 seconds
  useEffect(() => {
    if (!session || submitted) return
    const timer = setInterval(async () => {
      if (session) {
        await sessions.update(session.id, {
          answers: answersRef.current,
        })
      }
    }, 15000)
    return () => clearInterval(timer)
  }, [session, submitted])

  // Auto-save to IndexedDB every 25 seconds (local device backup)
  useEffect(() => {
    if (!user || submitted) return
    const timer = setInterval(() => {
      saveLocal(user.id, examId, answersRef.current)
    }, 25000)
    return () => clearInterval(timer)
  }, [user?.id, examId, submitted])

  function handleAnswer(qNum, value) {
    const updated = { ...answersRef.current, [String(qNum)]: value }
    answersRef.current = updated
    setAnswers(updated)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')

    try {
      if (session) {
        await sessions.update(session.id, {
          answers: answersRef.current,
          status: 'submitted',
        })
      } else {
        await sessions.create({
          student_id: user.id,
          exam_id: examId,
          variant: 'A',
          end_timestamp: new Date().toISOString(),
          answers: answersRef.current,
          violation_count: 0,
          current_question: questionList.length,
          status: 'submitted',
        })
      }
      setSubmitted(true)
      setShowSubmitConfirm(false)
      // Clear local draft after successful submit
      clearLocal(user.id, examId)
    } catch (err) {
      setError('Gagal mengirim survei: ' + err.message)
    }
    setSubmitting(false)
  }

  async function handleEdit() {
    if (!exam?.survey_allow_edit) return
    setIsEditing(true)
    setSubmitted(false)
    // Reactivate the session
    if (session) {
      await sessions.update(session.id, { status: 'active' })
    }
  }

  function renderQuestionInput(q, disabled) {
    const val = answers[String(q.number)]
    const onChange = (v) => handleAnswer(q.number, v)

    switch (q.type) {
      case 'SHORT_ANSWER':
        return <QuestionShortAnswer value={val} onChange={onChange} disabled={disabled} />
      case 'PARAGRAPH':
        return <QuestionParagraph value={val} onChange={onChange} disabled={disabled} />
      case 'LINEAR_SCALE':
        return <QuestionLinearScale question={q} value={val} onChange={onChange} disabled={disabled} />
      case 'MCQ_GRID':
        return <QuestionMCQGrid question={q} value={val} onChange={onChange} disabled={disabled} />
      case 'CHECKBOX_GRID':
        return <QuestionCheckboxGrid question={q} value={val} onChange={onChange} disabled={disabled} />
      case 'MCQ':
        return <QuestionMultipleChoice question={q} value={val} onChange={onChange} disabled={disabled} />
      case 'CHECKBOXES':
        return <QuestionCheckboxes question={q} value={val} onChange={onChange} disabled={disabled} />
      case 'DROPDOWN':
        return <QuestionDropdown question={q} value={val} onChange={onChange} disabled={disabled} />
      default:
        return <div className="text-muted text-sm">Tipe pertanyaan tidak dikenali: {q.type}</div>
    }
  }

  const answeredCount = Object.keys(answers).filter(k => {
    const v = answers[k]
    if (v === null || v === undefined || v === '') return false
    if (Array.isArray(v) && v.length === 0) return false
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false
    return true
  }).length

  const requiredCount = questionList.filter(q => q.required !== false).length
  const requiredAnswered = questionList.filter(q => {
    if (q.required === false) return true
    const v = answers[String(q.number)]
    if (v === null || v === undefined || v === '') return false
    if (Array.isArray(v) && v.length === 0) return false
    if (typeof v === 'object' && !Array.isArray(v)) {
      if (v.selected === undefined && Object.keys(v).length === 0) return false
    }
    return true
  }).length
  const allRequiredFilled = requiredAnswered >= requiredCount

  const progressPct = questionList.length > 0 ? (answeredCount / questionList.length) * 100 : 0

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" style={{ width: 40, height: 40 }} />
      <p className="text-muted">Memuat survei...</p>
    </div>
  )

  if (!exam) return (
    <div className="loading-screen">
      <p className="text-muted">Survei tidak ditemukan.</p>
    </div>
  )

  // Submitted view
  if (submitted && !isEditing) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--navy)', padding: '1rem' }}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(16,185,129,0.15)', border: '3px solid var(--success)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}>
            <CheckCircle size={40} color="var(--success)" />
          </div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontFamily: 'Cambria, "Times New Roman", serif' }}>Terima Kasih!</h1>
          <p className="text-muted" style={{ marginBottom: '1.5rem', fontSize: '0.95rem' }}>
            Jawaban survei "{exam.title}" telah berhasil dikirim.
          </p>
          {exam.survey_allow_edit && (
            <button className="btn btn-ghost" onClick={handleEdit} style={{ marginBottom: '1rem' }}>
              <Edit3 size={15} /> Edit Jawaban
            </button>
          )}
          <button className="btn btn-gold" onClick={() => navigate('/home')}>
            Kembali ke Beranda
          </button>
          <div className="app-footer" style={{ marginTop: '2rem' }}>
            Dibuat dan Dikembangkan oleh Tim IT BINAR &copy;2025
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)' }}>
      {/* Header */}
      <header className="survey-header" style={{
        background: 'var(--glass)', borderBottom: '1px solid var(--border)',
        padding: '0.875rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(20px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/home')}>
            <ChevronLeft size={15} />
          </button>
          <ClipboardList size={20} color="var(--accent)" />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{exam.title}</div>
            <div className="text-muted text-xs">{questionList.length} pertanyaan · {answeredCount} dijawab</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className="text-sm text-muted">{user.name}</span>
          <button
            className="btn btn-gold btn-sm"
            onClick={() => setShowSubmitConfirm(true)}
            disabled={submitting || !allRequiredFilled}
            style={!allRequiredFilled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            <Send size={14} /> Kirim Survei
          </button>
        </div>
      </header>

      {/* Progress bar */}
      <div className="survey-progress">
        <div className="survey-progress-bar" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Survey info */}
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' }}>
        {/* Title card */}
        <div className="card survey-title-card" style={{ marginBottom: '1.5rem', borderTop: '4px solid var(--accent)' }}>
          <h1 style={{ fontSize: '1.35rem', marginBottom: '0.25rem', fontFamily: 'Cambria, "Times New Roman", serif' }}>{exam.title}</h1>
          {exam.information && (
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {exam.information}
            </div>
          )}
          <div className="text-xs text-muted" style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Info size={12} />
            {requiredCount > 0 ? `* Pertanyaan bertanda wajib (${requiredCount} dari ${questionList.length})` : 'Tidak ada pertanyaan wajib'}
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        {/* Questions — all visible, vertical layout */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {questionList.map((q, idx) => (
            <div key={q.id || idx} className="card survey-question-card">
              <div style={{ marginBottom: '0.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <span className="text-muted text-sm" style={{ flexShrink: 0, marginTop: '0.1rem' }}>{q.number}.</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {q.question_text}
                      {q.required !== false && <span style={{ color: 'var(--danger)', marginLeft: '0.25rem' }}>*</span>}
                    </div>
                  </div>
                </div>
              </div>
              {renderQuestionInput(q, false)}
            </div>
          ))}
        </div>

        {/* Bottom submit */}
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          {!allRequiredFilled && (
            <p className="text-danger text-sm" style={{ marginBottom: '0.75rem' }}>
              Anda belum menjawab semua pertanyaan wajib ({requiredAnswered}/{requiredCount}).
            </p>
          )}
          <button
            className="btn btn-gold btn-lg"
            onClick={() => setShowSubmitConfirm(true)}
            disabled={submitting || !allRequiredFilled}
            style={{ minWidth: 200, ...(allRequiredFilled ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}
          >
            <Send size={18} /> Kirim Survei
          </button>
        </div>

        <div className="app-footer" style={{ marginTop: '2rem' }}>
          Dibuat dan Dikembangkan oleh Tim IT BINAR &copy;2025
        </div>
      </main>

      {/* Submit confirmation modal */}
      {showSubmitConfirm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(79,142,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
              <Send size={24} color="var(--accent)" />
            </div>
            <h3 style={{ marginBottom: '0.5rem' }}>Kirim Survei?</h3>
            <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>
              Anda telah menjawab <strong>{answeredCount}</strong> dari <strong>{questionList.length}</strong> pertanyaan.
              {exam.survey_allow_edit
                ? ' Anda dapat mengedit jawaban setelah mengirim.'
                : ' Setelah dikirim, jawaban tidak dapat diubah.'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowSubmitConfirm(false)} disabled={submitting}>Batal</button>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Mengirim...' : 'Ya, Kirim'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
