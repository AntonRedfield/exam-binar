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
import { BookOpen, Send, ChevronLeft, ChevronRight, ShieldCheck, ShieldAlert, AlertTriangle, Zap, Lock } from 'lucide-react'

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
  const [timeUp, setTimeUp] = useState(false)
  const [mobileTab, setMobileTab] = useState('answer')
  const [lockedQuestions, setLockedQuestions] = useState({})
  const [questionTimeWarning, setQuestionTimeWarning] = useState(false)

  const sessionRef = useRef(null)
  const answersRef = useRef({})
  const violationsRef = useRef(0)
  const autoSaveTimer = useRef(null)
  const submitLock = useRef(false)

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
    // Don't allow answers on locked questions
    if (lockedQuestions[String(qNum)]) return
    const updated = { ...answersRef.current, [String(qNum)]: value }
    answersRef.current = updated
    setAnswers(updated)
  }

  // Quiz per-question timer expired
  const handleQuestionTimerExpire = useCallback(() => {
    const totalQ = questionList.length
    // Lock current question
    setLockedQuestions(prev => ({ ...prev, [String(currentQ)]: true }))
    setQuestionTimeWarning(false)

    // Auto-advance to next question or auto-submit if last
    if (currentQ < totalQ) {
      setCurrentQ(prev => prev + 1)
    } else {
      // Last question — auto-submit
      handleTimerExpire()
    }
  }, [currentQ, questionList.length])

  const handleQuestionTimeWarning = useCallback(() => {
    setQuestionTimeWarning(true)
    setTimeout(() => setQuestionTimeWarning(false), 3000)
  }, [])

  async function handleTimerExpire() {
    setTimeUp(true)
    // Small delay so the student sees the overlay before navigation
    await submitExam(true)
  }

  async function submitExam(isAuto = false) {
    // Prevent double-submit from both manual click and timer expiry
    if (submitLock.current) return
    submitLock.current = true
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
      const existingRes = await results.get(user.id, examId)
      let result = null
      if (existingRes?.data) {
        const { data } = await results.update(existingRes.data.id, {
          session_id: sessionRef.current.id,
          auto_score: autoScore,
          max_auto_score: maxAutoScore,
          violation_count: violationsRef.current,
          breakdown: JSON.stringify(breakdown),
        })
        result = data
      } else {
        const { data } = await results.create({
          student_id: user.id,
          exam_id: examId,
          session_id: sessionRef.current.id,
          auto_score: autoScore,
          max_auto_score: maxAutoScore,
          essay_score: 0,
          violation_count: violationsRef.current,
          breakdown: JSON.stringify(breakdown),
        })
        result = data
      }

      // If auto-submit, show the overlay briefly before navigating
      if (isAuto) {
        await new Promise(resolve => setTimeout(resolve, 2500))
      }

      navigate(`/results/${result.id}`)
    } catch (err) {
      console.error('Submit error', err)
      submitLock.current = false
      setSubmitting(false)
      setTimeUp(false)
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
  const isQuiz = exam?.mode === 'quiz'
  const hasPdf = Boolean(exam?.pdf_url)
  const isCurrentLocked = lockedQuestions[String(currentQ)]

  return (
    <div className="exam-layout">
      {violationMsg && <ViolationWarning message={violationMsg} />}

      {/* Per-question time warning */}
      {questionTimeWarning && (
        <div style={{
          position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9998, background: 'rgba(245,158,11,0.95)', color: '#000',
          padding: '0.625rem 1.25rem', borderRadius: 10, fontWeight: 700,
          fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
          boxShadow: '0 4px 20px rgba(245,158,11,0.3)', animation: 'fadeInScale 0.3s ease-out'
        }}>
          <AlertTriangle size={18} /> Waktu soal hampir habis!
        </div>
      )}

      {/* Header */}
      <div className="exam-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isQuiz ? <Zap size={18} color="var(--gold)" /> : <BookOpen size={18} color="var(--gold)" />}
          <span style={{ fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>{exam?.title}</span>
          {isQuiz && <span className="badge badge-active" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>KUIS</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flex: 1, justifyContent: 'center' }}>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>{user?.name}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kelas {user?.kelas || '-'}</span>
          </div>
          {/* Timer: per-question for quiz, global for exam */}
          {isQuiz ? (
            <Timer
              durationSeconds={q?.time_limit || 30}
              questionKey={`q-${currentQ}`}
              onExpire={handleQuestionTimerExpire}
              onWarning={handleQuestionTimeWarning}
            />
          ) : (
            <Timer endTimestamp={session?.end_timestamp} onExpire={handleTimerExpire} />
          )}
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
      {/* Mobile tab switcher - only show PDF tab if PDF exists */}
      {hasPdf && (
        <div className="exam-mobile-tabs">
          <button className={mobileTab === 'pdf' ? 'active' : ''} onClick={() => setMobileTab('pdf')}>📄 Soal PDF</button>
          <button className={mobileTab === 'answer' ? 'active' : ''} onClick={() => setMobileTab('answer')}>✏️ Jawaban</button>
        </div>
      )}

      <div className="exam-body">
        {/* Navigator - only show in exam mode (not quiz mode) */}
        {!isQuiz && (
          <QuestionNavigator
            questions={questionList}
            answers={answers}
            currentQ={currentQ}
            onSelect={setCurrentQ}
          />
        )}

        {/* PDF Pane - only show if PDF URL exists */}
        {hasPdf && (
          <div className={`pdf-pane ${mobileTab !== 'pdf' ? 'mobile-hidden' : ''}`}>
            <iframe
              src={getDriveEmbedUrl(exam.pdf_url)}
              title="Soal Ujian"
              allow="autoplay"
            />
          </div>
        )}

        {/* Answer Pane */}
        <div className={`answer-pane ${hasPdf && mobileTab !== 'answer' ? 'mobile-hidden' : ''}`} style={!hasPdf && !isQuiz ? {} : !hasPdf ? { flex: 1 } : {}}>
          <div className="answer-scroll">
            {q && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div>
                    <span className="text-muted text-xs">Soal {currentQ} dari {totalQ}</span>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <QuestionTypeBadge type={q.type} />
                      <span className="badge badge-draft">{q.points || 1} poin</span>
                      {isQuiz && <span className="badge badge-draft">⏱ {q.time_limit || 30}s</span>}
                      {isCurrentLocked && <span className="badge badge-closed" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Lock size={11} /> Terkunci</span>}
                    </div>
                  </div>
                  {/* Quiz progress indicator */}
                  {isQuiz && (
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {questionList.map((_, i) => (
                        <div key={i} style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: i + 1 === currentQ ? 'var(--gold)'
                            : i + 1 < currentQ ? 'var(--success)'
                            : 'var(--border)'
                        }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Question text - display if available */}
                {q.question_text && (
                  <div style={{
                    padding: '1rem', marginBottom: '1rem',
                    background: 'var(--surface)', borderRadius: 10,
                    border: '1px solid var(--border)',
                    fontSize: '0.95rem', lineHeight: 1.6,
                    whiteSpace: 'pre-wrap'
                  }}>
                    {q.question_text}
                  </div>
                )}

                {/* Locked question overlay */}
                {isCurrentLocked ? (
                  <div style={{
                    padding: '2rem', textAlign: 'center',
                    background: 'rgba(239,68,68,0.05)', borderRadius: 10,
                    border: '1px solid rgba(239,68,68,0.2)'
                  }}>
                    <Lock size={32} color="var(--danger)" style={{ margin: '0 auto 0.75rem', display: 'block', opacity: 0.5 }} />
                    <p style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: '0.25rem' }}>Waktu soal habis</p>
                    <p className="text-muted text-sm">Jawaban Anda telah dikunci.</p>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer nav */}
          <div className="answer-footer">
            {/* Quiz mode: no back button */}
            {isQuiz ? (
              <>
                <div style={{ flex: 1 }} />
                {currentQ < totalQ ? (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => {
                      // Lock current question when moving forward in quiz mode
                      setLockedQuestions(prev => ({ ...prev, [String(currentQ)]: true }))
                      setCurrentQ(q => q + 1)
                    }}
                  >
                    Selanjutnya <ChevronRight size={15} />
                  </button>
                ) : (
                  <button
                    className="btn btn-gold btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => setShowSubmitConfirm(true)}
                    disabled={submitting}
                  >
                    <Send size={14} /> Kumpulkan
                  </button>
                )}
              </>
            ) : (
              <>
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
              </>
            )}
          </div>

          {/* Status bar */}
          <div style={{ padding: '0.625rem 1.25rem', background: 'var(--navy)', fontSize: '0.75rem', color: 'white', display: 'flex', gap: '1rem', borderTop: '1px solid var(--border)' }}>
            <span>✅ {Object.keys(answers).length} Dijawab</span>
            <span>⬜ {totalQ - Object.keys(answers).length} Belum</span>
            {isQuiz && <span>🔒 {Object.keys(lockedQuestions).length} Terkunci</span>}
          </div>
        </div>
      </div>

      {/* Time's Up overlay */}
      {timeUp && (
        <div className="modal-overlay" style={{ zIndex: 9999, background: 'rgba(10,22,40,0.95)', backdropFilter: 'blur(8px)' }}>
          <div style={{ textAlign: 'center', animation: 'fadeInScale 0.4s ease-out' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'rgba(239,68,68,0.15)', border: '3px solid var(--danger)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 1.5rem',
              animation: 'pulse 1.5s ease-in-out infinite'
            }}>
              <AlertTriangle size={36} color="var(--danger)" />
            </div>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--danger)', fontFamily: 'Outfit, sans-serif' }}>
              Waktu Habis!
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
              {isQuiz ? 'Kuis' : 'Ujian'} Anda sedang dikumpulkan secara otomatis...
            </p>
            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto', borderColor: 'rgba(239,68,68,0.2)', borderTopColor: 'var(--danger)' }} />
          </div>
        </div>
      )}

      {/* Submit confirm modal */}
      {showSubmitConfirm && !timeUp && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(79,142,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
              <Send size={24} color="var(--accent)" />
            </div>
            <h3 style={{ marginBottom: '0.5rem' }}>Kumpulkan {isQuiz ? 'Kuis' : 'Ujian'}?</h3>
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
