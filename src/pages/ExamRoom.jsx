import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCurrentUser } from '../lib/auth'
import { exams, questions, sessions, results } from '../lib/db'
import { gradeExam, getDriveEmbedUrl } from '../lib/grader'
import { useAntiCheat } from '../hooks/useAntiCheat'
import QuestionMCQ from '../components/exam/QuestionMCQ'
import QuestionComplexMCQ from '../components/exam/QuestionComplexMCQ'
import QuestionTrueFalse from '../components/exam/QuestionTrueFalse'
import QuestionEssay from '../components/exam/QuestionEssay'
import Timer from '../components/exam/Timer'
import QuestionNavigator from '../components/exam/QuestionNavigator'
import ViolationWarning from '../components/exam/ViolationWarning'
import { BookOpen, Send, ChevronLeft, ChevronRight, ShieldCheck, ShieldAlert } from 'lucide-react'

export default function ExamRoom() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const user = getCurrentUser()

  const [exam, setExam] = useState(null)
  const [questionList, setQuestionList] = useState([])
  const [session, setSession] = useState(null)
  const [answers, setAnswers] = useState({})
  const [currentQ, setCurrentQ] = useState(1)
  const [violations, setViolations] = useState(0)
  const [violationMsg, setViolationMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [mobileTab, setMobileTab] = useState('answer')

  const sessionRef = useRef(null)
  const answersRef = useRef({})
  const violationsRef = useRef(0)
  const autoSaveTimer = useRef(null)

  useEffect(() => {
    async function load() {
      const [{ data: examData }, { data: qs }, { data: sess }] = await Promise.all([
        exams.getById(examId),
        questions.listByExam(examId),
        sessions.get(user.id, examId),
      ])
      if (!sess || sess.status === 'submitted' || sess.status === 'time_up') {
        navigate(`/exam/${examId}/lobby`)
        return
      }
      setExam(examData)
      setQuestionList(qs || [])
      setSession(sess)
      sessionRef.current = sess
      const savedAnswers = sess.answers || {}
      setAnswers(savedAnswers)
      answersRef.current = savedAnswers
      setCurrentQ(sess.current_question || 1)
      setViolations(sess.violation_count || 0)
      violationsRef.current = sess.violation_count || 0
      setLoading(false)
    }
    load()
  }, [examId, user.id, navigate])

  // Auto-save every 10s
  useEffect(() => {
    if (!session) return
    autoSaveTimer.current = setInterval(async () => {
      if (sessionRef.current) {
        await sessions.update(sessionRef.current.id, {
          answers: answersRef.current,
          violation_count: violationsRef.current,
          current_question: currentQ,
        })
      }
    }, 10000)
    return () => clearInterval(autoSaveTimer.current)
  }, [session, currentQ])

  const handleViolation = useCallback(async (reason) => {
    violationsRef.current += 1
    setViolations(v => v + 1)
    setViolationMsg(`Pelanggaran #${violationsRef.current}: ${reason}`)
    setTimeout(() => setViolationMsg(''), 4000)
    // Immediately save violation
    if (sessionRef.current) {
      await sessions.update(sessionRef.current.id, {
        violation_count: violationsRef.current,
        answers: answersRef.current,
        current_question: currentQ,
      })
    }
  }, [currentQ])

  useAntiCheat({ enabled: !loading && !submitting, onViolation: handleViolation })

  function handleAnswer(qNum, value) {
    const updated = { ...answersRef.current, [String(qNum)]: value }
    answersRef.current = updated
    setAnswers(updated)
  }

  async function handleTimerExpire() {
    await submitExam(true)
  }

  async function submitExam(isAuto = false) {
    if (submitting) return
    setSubmitting(true)
    clearInterval(autoSaveTimer.current)

    try {
      // Final save
      await sessions.update(sessionRef.current.id, {
        answers: answersRef.current,
        violation_count: violationsRef.current,
        current_question: currentQ,
        status: isAuto ? 'time_up' : 'submitted',
      })

      // Grade
      const { autoScore, maxAutoScore, essayPending, breakdown } = gradeExam(answersRef.current, questionList)

      // Save result
      const { data: result } = await results.create({
        student_id: user.id,
        exam_id: examId,
        session_id: sessionRef.current.id,
        auto_score: autoScore,
        max_auto_score: maxAutoScore,
        essay_score: 0,
        violation_count: violationsRef.current,
        breakdown: JSON.stringify(breakdown),
      })

      navigate(`/results/${result.id}`)
    } catch (err) {
      console.error('Submit error', err)
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" style={{ width: 40, height: 40 }} />
      <p className="text-muted">Memuat ruang ujian...</p>
    </div>
  )

  const q = questionList.find(q => q.number === currentQ) || questionList[0]
  const totalQ = questionList.length

  return (
    <div className="exam-layout">
      {violationMsg && <ViolationWarning message={violationMsg} />}

      {/* Header */}
      <div className="exam-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <BookOpen size={18} color="var(--gold)" />
          <span style={{ fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>{exam?.title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flex: 1, justifyContent: 'center' }}>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>{user?.name}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kelas {user?.kelas || '-'}</span>
          </div>
          <Timer endTimestamp={session?.end_timestamp} onExpire={handleTimerExpire} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
            {violations === 0
              ? <><ShieldCheck size={15} color="var(--success)" /> <span style={{ color: 'var(--success)' }}>0 Pelanggaran</span></>
              : <><ShieldAlert size={15} color="var(--danger)" /> <span style={{ color: 'var(--danger)' }}>{violations} Pelanggaran</span></>
            }
          </div>
          <button
            className="btn btn-gold btn-sm no-print"
            onClick={() => setShowSubmitConfirm(true)}
            disabled={submitting}
          >
            <Send size={14} /> Kumpulkan
          </button>
        </div>
      </div>

      {/* Body */}
      {/* Mobile tab switcher */}
      <div className="exam-mobile-tabs">
        <button className={mobileTab === 'pdf' ? 'active' : ''} onClick={() => setMobileTab('pdf')}>📄 Soal PDF</button>
        <button className={mobileTab === 'answer' ? 'active' : ''} onClick={() => setMobileTab('answer')}>✏️ Jawaban</button>
      </div>

      <div className="exam-body">
        {/* Navigator */}
        <QuestionNavigator
          questions={questionList}
          answers={answers}
          currentQ={currentQ}
          onSelect={setCurrentQ}
        />

        {/* PDF Pane */}
        <div className={`pdf-pane ${mobileTab !== 'pdf' ? 'mobile-hidden' : ''}`}>
          {exam?.pdf_url ? (
            <iframe
              src={getDriveEmbedUrl(exam.pdf_url)}
              title="Soal Ujian"
              allow="autoplay"
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
              <p style={{ color: '#888' }}>PDF tidak tersedia</p>
            </div>
          )}
        </div>

        {/* Answer Pane */}
        <div className={`answer-pane ${mobileTab !== 'answer' ? 'mobile-hidden' : ''}`}>
          <div className="answer-scroll">
            {q && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div>
                    <span className="text-muted text-xs">Soal {currentQ} dari {totalQ}</span>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <QuestionTypeBadge type={q.type} />
                      <span className="badge badge-draft">{q.points || 1} poin</span>
                    </div>
                  </div>
                </div>

                {q.type === 'MCQ' && (
                  <QuestionMCQ
                    question={q}
                    value={answers[String(q.number)]}
                    onChange={val => handleAnswer(q.number, val)}
                  />
                )}
                {q.type === 'COMPLEX_MCQ' && (
                  <QuestionComplexMCQ
                    question={q}
                    value={answers[String(q.number)]}
                    onChange={val => handleAnswer(q.number, val)}
                  />
                )}
                {q.type === 'TRUE_FALSE' && (
                  <QuestionTrueFalse
                    question={q}
                    value={answers[String(q.number)]}
                    onChange={val => handleAnswer(q.number, val)}
                  />
                )}
                {q.type === 'ESSAY' && (
                  <QuestionEssay
                    value={answers[String(q.number)]}
                    onChange={val => handleAnswer(q.number, val)}
                  />
                )}
              </div>
            )}
          </div>

          {/* Footer nav */}
          <div className="answer-footer">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setCurrentQ(q => Math.max(1, q - 1))}
              disabled={currentQ <= 1}
            >
              <ChevronLeft size={15} /> Sebelumnya
            </button>
            <button
              className="btn btn-primary btn-sm"
              style={{ flex: 1 }}
              onClick={() => setCurrentQ(q => Math.min(totalQ, q + 1))}
              disabled={currentQ >= totalQ}
            >
              Selanjutnya <ChevronRight size={15} />
            </button>
          </div>

          {/* Status bar */}
          <div style={{ padding: '0.625rem 1.25rem', background: 'var(--navy)', fontSize: '0.75rem', color: 'white', display: 'flex', gap: '1rem', borderTop: '1px solid var(--border)' }}>
            <span>✅ {Object.keys(answers).length} Dijawab</span>
            <span>⬜ {totalQ - Object.keys(answers).length} Belum</span>
          </div>
        </div>
      </div>

      {/* Submit confirm modal */}
      {showSubmitConfirm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(79,142,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
              <Send size={24} color="var(--accent)" />
            </div>
            <h3 style={{ marginBottom: '0.5rem' }}>Kumpulkan Ujian?</h3>
            <p className="text-muted text-sm" style={{ marginBottom: '1.5rem' }}>
              Anda telah menjawab <strong>{Object.keys(answers).length}</strong> dari <strong>{totalQ}</strong> soal.
              Tindakan ini tidak dapat dibatalkan.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowSubmitConfirm(false)} disabled={submitting}>Batal</button>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={() => submitExam(false)} disabled={submitting}>
                {submitting ? 'Mengumpulkan...' : 'Ya, Kumpulkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function QuestionTypeBadge({ type }) {
  const labels = { MCQ: 'Pilihan Ganda', COMPLEX_MCQ: 'Multi-Jawab', TRUE_FALSE: 'Benar/Salah', ESSAY: 'Esai' }
  return <span className="question-type-badge">{labels[type] || type}</span>
}
