import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCurrentUser } from '../lib/auth'
import { exams, questions, sessions, results } from '../lib/db'
import { gradeExam, getDriveEmbedUrl } from '../lib/grader'
import { useAntiCheat } from '../hooks/useAntiCheat'
import { useFaceDetection } from '../hooks/useFaceDetection'
import QuestionMCQ from '../components/exam/QuestionMCQ'
import QuestionComplexMCQ from '../components/exam/QuestionComplexMCQ'
import QuestionTrueFalse from '../components/exam/QuestionTrueFalse'
import QuestionEssay from '../components/exam/QuestionEssay'
import Timer from '../components/exam/Timer'
import QuestionNavigator from '../components/exam/QuestionNavigator'
import ViolationWarning from '../components/exam/ViolationWarning'
import ScreenFreezeOverlay from '../components/exam/ScreenFreezeOverlay'
import FaceDetectionStatus from '../components/exam/FaceDetectionStatus'
import { 
  MONITORING_LEVELS,
  shouldTriggerFreeze,
  getOffenseNumber,
  getFreezeDuration,
  shouldTriggerTimeReduction,
  getTimeReduction
} from '../lib/monitoringConfig'
import { MonitoringIcon, getMonitoringBadgeStyle } from '../lib/monitoringUI'
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

  // Monitoring-specific state
  const [freezeActive, setFreezeActive] = useState(false)
  const [freezeDuration, setFreezeDuration] = useState(0)
  const [freezeOffense, setFreezeOffense] = useState(0)
  const [timeReductionMsg, setTimeReductionMsg] = useState('')
  const [bonusTimeReduction, setBonusTimeReduction] = useState(0) // seconds removed from global timer

  const sessionRef = useRef(null)
  const answersRef = useRef({})
  const violationsRef = useRef(0)
  const autoSaveTimer = useRef(null)
  const submitLock = useRef(false)

  useEffect(() => {
    if (!user) return
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
  }, [examId, user?.id, navigate])

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

  const monitorLevel = exam?.monitoring_level || 1
  const isQuiz = exam?.mode === 'quiz'

  // ─── Anti-cheat callbacks ──────────────────────────────────────────
  const handleFreeze = useCallback((duration, offenseNumber) => {
    setFreezeDuration(duration)
    setFreezeOffense(offenseNumber)
    setFreezeActive(true)
  }, [])

  const handleFreezeComplete = useCallback(() => {
    setFreezeActive(false)
    setFreezeDuration(0)
    setFreezeOffense(0)
  }, [])

  const handleTimeReduction = useCallback((amount, isQuizMode) => {
    if (isQuizMode) {
      setTimeReductionMsg(`⏰ Waktu soal dikurangi 20% karena pelanggaran!`)
    } else {
      const mins = Math.floor(amount / 60)
      setTimeReductionMsg(`⏰ Waktu ujian dikurangi ${mins} menit karena pelanggaran!`)
      setBonusTimeReduction(prev => prev + amount)
    }
    setTimeout(() => setTimeReductionMsg(''), 5000)
  }, [])

  const handleViolation = useCallback(async (reason) => {
    if (freezeActive) return // Pause accumulation during screen freeze

    violationsRef.current += 1
    const currentCount = violationsRef.current
    
    setViolations(currentCount)
    setViolationMsg(`Pelanggaran #${currentCount}: ${reason}`)
    setTimeout(() => setViolationMsg(''), 4000)

    // Check for freeze penalty
    if (monitorLevel >= 3 && shouldTriggerFreeze(monitorLevel, currentCount)) {
      const offenseNum = getOffenseNumber(currentCount)
      const duration = getFreezeDuration(monitorLevel, offenseNum, isQuiz)
      handleFreeze(duration, offenseNum)
    }

    // Check for time reduction penalty
    if (shouldTriggerTimeReduction(monitorLevel, currentCount)) {
      const reduction = getTimeReduction(isQuiz)
      handleTimeReduction(reduction, isQuiz)
    }

    if (sessionRef.current) {
      await sessions.update(sessionRef.current.id, {
        violation_count: currentCount,
        answers: answersRef.current,
        current_question: currentQ,
      })
    }
  }, [currentQ, monitorLevel, isQuiz, handleFreeze, handleTimeReduction, freezeActive])

  // ─── Anti-cheat hook ──────────────────────────────────────────────
  useAntiCheat({
    enabled: !loading && !submitting && !freezeActive,
    monitoringLevel: monitorLevel,
    isQuiz,
    onViolation: handleViolation,
  })

  // ─── Face detection (Level 4 only) ────────────────────────────────
  const faceDetection = useFaceDetection({
    enabled: !loading && !submitting && !freezeActive && monitorLevel === 4,
    onViolation: handleViolation,
  })

  // Initialize camera for Level 4
  useEffect(() => {
    if (monitorLevel === 4 && !loading && !faceDetection.cameraReady && !faceDetection.cameraError) {
      faceDetection.requestCamera()
    }
  }, [monitorLevel, loading])

  // Cleanup face detection on unmount
  useEffect(() => {
    return () => {
      if (monitorLevel === 4) faceDetection.stopCamera()
    }
  }, [])

  function handleAnswer(qNum, value) {
    if (lockedQuestions[String(qNum)]) return
    const updated = { ...answersRef.current, [String(qNum)]: value }
    answersRef.current = updated
    setAnswers(updated)
  }

  // Quiz per-question timer expired
  const handleQuestionTimerExpire = useCallback(() => {
    const totalQ = questionList.length
    setLockedQuestions(prev => ({ ...prev, [String(currentQ)]: true }))
    setQuestionTimeWarning(false)
    if (currentQ < totalQ) {
      setCurrentQ(prev => prev + 1)
    } else {
      handleTimerExpire()
    }
  }, [currentQ, questionList.length])

  const handleQuestionTimeWarning = useCallback(() => {
    setQuestionTimeWarning(true)
    setTimeout(() => setQuestionTimeWarning(false), 3000)
  }, [])

  async function handleTimerExpire() {
    setTimeUp(true)
    await submitExam(true)
  }

  async function submitExam(isAuto = false) {
    if (submitLock.current) return
    submitLock.current = true
    setSubmitting(true)
    clearInterval(autoSaveTimer.current)

    // Stop face detection
    if (monitorLevel === 4) faceDetection.stopCamera()

    try {
      await sessions.update(sessionRef.current.id, {
        answers: answersRef.current,
        violation_count: violationsRef.current,
        current_question: currentQ,
        status: isAuto ? 'time_up' : 'submitted',
      })

      const { autoScore, maxAutoScore, essayPending, breakdown } = gradeExam(answersRef.current, questionList)

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
  const hasPdf = Boolean(exam?.pdf_url)
  const isCurrentLocked = lockedQuestions[String(currentQ)]
  const levelConfig = MONITORING_LEVELS[monitorLevel] || MONITORING_LEVELS[1]

  // Calculate adjusted end timestamp for time reduction (Level 4)
  const adjustedEndTimestamp = session?.end_timestamp && bonusTimeReduction > 0
    ? new Date(new Date(session.end_timestamp).getTime() - bonusTimeReduction * 1000).toISOString()
    : session?.end_timestamp

  return (
    <div className="exam-layout">
      {violationMsg && <ViolationWarning message={violationMsg} />}

      {/* Screen Freeze Overlay (Level 3+) */}
      {freezeActive && (
        <ScreenFreezeOverlay
          duration={freezeDuration}
          offenseNumber={freezeOffense}
          onComplete={handleFreezeComplete}
        />
      )}

      {/* Time reduction notification */}
      {timeReductionMsg && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          zIndex: 9997, background: 'rgba(239,68,68,0.95)', color: 'white',
          padding: '1.5rem 2.5rem', borderRadius: 15, fontWeight: 700,
          fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
          boxShadow: '0 10px 40px rgba(239,68,68,0.5)', animation: 'fadeInScale 0.3s ease-out',
        }}>
          <AlertTriangle size={24} /> {timeReductionMsg}
        </div>
      )}

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

      {/* Face Detection PiP (Level 4) */}
      {monitorLevel === 4 && !loading && (
        <FaceDetectionStatus
          videoRef={faceDetection.videoRef}
          cameraReady={faceDetection.cameraReady}
          lookAwayCount={faceDetection.lookAwayCount}
          cameraError={faceDetection.cameraError}
        />
      )}

      {/* Header */}
      <div className="exam-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isQuiz ? <Zap size={18} color="var(--gold)" /> : <BookOpen size={18} color="var(--gold)" />}
          <span style={{ fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>{exam?.title}</span>
          {isQuiz && <span className="badge badge-active" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>KUIS</span>}
          {/* Monitoring level badge */}
          <span style={{ ...getMonitoringBadgeStyle(monitorLevel), fontSize: '0.65rem', padding: '0.15rem 0.45rem' }}>
            <MonitoringIcon level={monitorLevel} size={12} />
            Lv.{monitorLevel}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flex: 1, justifyContent: 'center' }}>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>{user?.name}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kelas {user?.kelas || '-'}</span>
          </div>
          {/* Timer */}
          {isQuiz ? (
            <Timer
              durationSeconds={q?.time_limit || 30}
              questionKey={`q-${currentQ}`}
              onExpire={handleQuestionTimerExpire}
              onWarning={handleQuestionTimeWarning}
            />
          ) : (
            <Timer endTimestamp={adjustedEndTimestamp} onExpire={handleTimerExpire} />
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
      {hasPdf && (
        <div className="exam-mobile-tabs">
          <button className={mobileTab === 'pdf' ? 'active' : ''} onClick={() => setMobileTab('pdf')}>📄 Soal PDF</button>
          <button className={mobileTab === 'answer' ? 'active' : ''} onClick={() => setMobileTab('answer')}>✏️ Jawaban</button>
        </div>
      )}

      <div className="exam-body">
        {!isQuiz && (
          <QuestionNavigator
            questions={questionList}
            answers={answers}
            currentQ={currentQ}
            onSelect={setCurrentQ}
          />
        )}

        {hasPdf && (
          <div className={`pdf-pane ${mobileTab !== 'pdf' ? 'mobile-hidden' : ''}`}>
            <iframe
              src={getDriveEmbedUrl(exam.pdf_url)}
              title="Soal Ujian"
              allow="autoplay"
            />
          </div>
        )}

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
                    {q.type === 'MCQ' && <QuestionMCQ question={q} value={answers[String(q.number)]} onChange={val => handleAnswer(q.number, val)} />}
                    {q.type === 'COMPLEX_MCQ' && <QuestionComplexMCQ question={q} value={answers[String(q.number)]} onChange={val => handleAnswer(q.number, val)} />}
                    {q.type === 'TRUE_FALSE' && <QuestionTrueFalse question={q} value={answers[String(q.number)]} onChange={val => handleAnswer(q.number, val)} />}
                    {q.type === 'ESSAY' && <QuestionEssay value={answers[String(q.number)]} onChange={val => handleAnswer(q.number, val)} />}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="answer-footer">
            {isQuiz ? (
              <>
                <div style={{ flex: 1 }} />
                {currentQ < totalQ ? (
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => {
                    setLockedQuestions(prev => ({ ...prev, [String(currentQ)]: true }))
                    setCurrentQ(q => q + 1)
                  }}>
                    Selanjutnya <ChevronRight size={15} />
                  </button>
                ) : (
                  <button className="btn btn-gold btn-sm" style={{ flex: 1 }} onClick={() => setShowSubmitConfirm(true)} disabled={submitting}>
                    <Send size={14} /> Kumpulkan
                  </button>
                )}
              </>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setCurrentQ(q => Math.max(1, q - 1))} disabled={currentQ <= 1}>
                  <ChevronLeft size={15} /> Sebelumnya
                </button>
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => setCurrentQ(q => Math.min(totalQ, q + 1))} disabled={currentQ >= totalQ}>
                  Selanjutnya <ChevronRight size={15} />
                </button>
              </>
            )}
          </div>

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
              margin: '0 auto 1.5rem', animation: 'pulse 1.5s ease-in-out infinite'
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
