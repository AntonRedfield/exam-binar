import React, { useState, useMemo, useEffect } from 'react'
import {
  X,
  Printer,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Award,
  BookOpen,
  Filter,
  CheckSquare,
  Square,
  ArrowRight,
  ExternalLink,
  Edit3,
  HelpCircle,
  Sparkles,
  Save
} from 'lucide-react'
import FormattedText from '../common/FormattedText'
import AdaptiveExamImage from './AdaptiveExamImage'
import { formatScore, roundScore } from '../../lib/format'
import { results } from '../../lib/db'

export default function StudentAnswerDetailModal({
  result,
  exam,
  questions = [],
  onClose,
  onOpenEssayGrading,
  onUpdateResult
}) {
  const [localResult, setLocalResult] = useState(result)
  const [filterType, setFilterType] = useState('all') // 'all' | 'correct' | 'wrong' | 'partial' | 'pending'
  const [inlineScores, setInlineScores] = useState({})
  const [inlineSaving, setInlineSaving] = useState(null)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null)

  useEffect(() => {
    setLocalResult(result)
  }, [result])

  // Student Profile Data
  const student = localResult?.users || localResult?.student || localResult?.profiles || {}
  const studentName = student.full_name || student.display_name || student.name || 'Siswa'
  const studentClass = student.kelas || student.class_section || student.classes?.name || '—'
  const studentUsername = student.username || ''

  // Score metrics
  const autoScore = Number(localResult?.auto_score || 0)
  const essayScore = Number(localResult?.essay_score || 0)
  const rawTotal = roundScore(autoScore + essayScore)

  const computedMaxFromQuestions = useMemo(() => {
    return (questions || []).reduce((sum, q) => {
      const pts = (q.points !== undefined && q.points !== null && !isNaN(Number(q.points))) ? Number(q.points) : 1
      return sum + pts
    }, 0)
  }, [questions])

  const maxPossible = computedMaxFromQuestions > 0
    ? computedMaxFromQuestions
    : (Number(localResult?.max_auto_score || 0) > 0 ? Number(localResult.max_auto_score) : 100)

  const totalScore = maxPossible > 0 ? Math.min(rawTotal, maxPossible) : rawTotal
  const passingGrade = exam?.passing_grade ?? 60
  const pct = maxPossible > 0 ? Math.min(100, Math.max(0, (totalScore / maxPossible) * 100)) : 0
  const isPassed = pct >= passingGrade
  const pctStr = formatScore(pct)

  // Question lookup map by number
  const questionMap = useMemo(() => {
    const map = new Map()
    ;(questions || []).forEach(q => {
      map.set(Number(q.number), q)
    })
    return map
  }, [questions])

  // Parse breakdown safely (handles arrays, JSON strings, and double-encoded JSON strings)
  const breakdownList = useMemo(() => {
    let bd = []
    if (Array.isArray(localResult?.breakdown)) {
      bd = localResult.breakdown
    } else if (typeof localResult?.breakdown === 'string') {
      try {
        const parsed = JSON.parse(localResult.breakdown)
        if (Array.isArray(parsed)) {
          bd = parsed
        } else if (typeof parsed === 'string') {
          const doubleParsed = JSON.parse(parsed)
          if (Array.isArray(doubleParsed)) bd = doubleParsed
        }
      } catch {
        bd = []
      }
    }

    if (!Array.isArray(bd)) bd = []

    // If questions prop is provided, merge with questions list
    if (questions && questions.length > 0) {
      const essayCountInExam = questions.filter(x =>
        x.type === 'ESSAY' ||
        x.type === 'PARAGRAPH' ||
        (x.type === 'AGREE_DISAGREE' && (x.options?.reason_type === 'essay' || x.correct_answer?.reason_type === 'essay'))
      ).length

      return questions.map(q => {
        const qNum = Number(q.number)
        const isAD = q.type === 'AGREE_DISAGREE'
        const isEssay = q.type === 'ESSAY' || q.type === 'PARAGRAPH' || (isAD && (q.options?.reason_type === 'essay' || q.correct_answer?.reason_type === 'essay'))
        const configuredPts = (q.points !== undefined && q.points !== null && !isNaN(Number(q.points))) ? Number(q.points) : 1
        const maxPts = (isAD && isEssay) ? roundScore(configuredPts * 0.5) : roundScore(configuredPts)

        const existing = bd.find(b => Number(b.number) === qNum || b.id === q.id)
        if (existing) {
          let earned = existing.earned !== undefined ? Number(existing.earned) : 0
          let status = existing.status || (isEssay ? 'pending' : 'wrong')

          // If there's 1 essay and essay_score > 0, reflect the score
          if (isEssay && (existing.earned === undefined || existing.earned === 0) && essayScore > 0 && essayCountInExam === 1) {
            earned = essayScore
            status = earned === maxPts ? 'correct' : (earned > 0 ? 'partial' : 'wrong')
          }

          return {
            ...existing,
            number: q.number,
            max: maxPts,
            earned,
            status,
            questionObj: q,
          }
        }
        return {
          number: q.number,
          type: q.type,
          status: isEssay ? 'pending' : 'wrong',
          earned: 0,
          max: maxPts,
          correct: q.correct_answer,
          given: null,
          questionObj: q,
        }
      })
    }

    // If questions array is empty, use the breakdown items directly
    return bd.map(b => {
      const qObj = questionMap.get(Number(b.number)) || b.questionObj || {}
      const isAD = b.type === 'AGREE_DISAGREE'
      const isEssay = b.type === 'ESSAY' || b.type === 'PARAGRAPH' || (isAD && (b.reason_type === 'essay' || qObj.options?.reason_type === 'essay'))
      const configuredPts = (qObj?.points !== undefined && qObj?.points !== null && !isNaN(Number(qObj.points)))
        ? Number(qObj.points)
        : (Number(b.max) || 1)
      const maxPts = (isAD && isEssay) ? roundScore(configuredPts * 0.5) : roundScore(configuredPts)

      return {
        ...b,
        max: maxPts,
        questionObj: qObj
      }
    })
  }, [localResult?.breakdown, localResult?.essay_score, questions, questionMap, essayScore])

  // Breakdown statistics
  const stats = useMemo(() => {
    let correct = 0
    let wrong = 0
    let partial = 0
    let pending = 0

    breakdownList.forEach(b => {
      if (b.status === 'correct') correct++
      else if (b.status === 'wrong') wrong++
      else if (b.status === 'partial') partial++
      else if (b.status === 'pending') pending++
    })

    return { total: breakdownList.length, correct, wrong, partial, pending }
  }, [breakdownList])

  // Whether this exam has essay questions
  const hasEssays = useMemo(() => {
    return (questions || []).some(q =>
      q.type === 'ESSAY' ||
      q.type === 'PARAGRAPH' ||
      (q.type === 'AGREE_DISAGREE' && (q.options?.reason_type === 'essay' || q.correct_answer?.reason_type === 'essay'))
    ) || breakdownList.some(b => {
      const qObj = b.questionObj || questionMap.get(Number(b.number)) || {}
      const qType = b.type || qObj.type || 'MCQ'
      return qType === 'ESSAY' || qType === 'PARAGRAPH' || (qType === 'AGREE_DISAGREE' && (b.reason_type === 'essay' || qObj.options?.reason_type === 'essay'))
    })
  }, [questions, breakdownList, questionMap])

  function handleInlineScoreChange(qNum, valueStr, maxPts) {
    if (valueStr === '') {
      setInlineScores(prev => ({ ...prev, [qNum]: '' }))
      return
    }
    let val = parseFloat(valueStr)
    if (isNaN(val)) val = 0
    if (val < 0) val = 0
    if (val > maxPts) val = maxPts
    setInlineScores(prev => ({ ...prev, [qNum]: val }))
  }

  async function handleSaveInlineScore(qNum, maxPts) {
    if (!localResult?.id) return
    setInlineSaving(qNum)
    try {
      const rawVal = inlineScores[qNum]
      const earned = roundScore(Math.min(Math.max(0, isNaN(parseFloat(rawVal)) ? 0 : parseFloat(rawVal)), maxPts))
      let status = 'wrong'
      if (earned === maxPts) status = 'correct'
      else if (earned > 0) status = 'partial'

      const updatedBd = breakdownList.map(b => {
        if (Number(b.number) === Number(qNum)) {
          return {
            ...b,
            earned,
            max: maxPts,
            status
          }
        }
        return b
      })

      // Calculate new total essay score
      const totalEssay = updatedBd
        .filter(b => {
          const qObj = b.questionObj || questionMap.get(Number(b.number)) || {}
          const qType = b.type || qObj.type || 'MCQ'
          return qType === 'ESSAY' || qType === 'PARAGRAPH' || (qType === 'AGREE_DISAGREE' && (b.reason_type === 'essay' || qObj.options?.reason_type === 'essay' || qObj.correct_answer?.reason_type === 'essay'))
        })
        .reduce((sum, b) => sum + (Number(b.earned) || 0), 0)

      const rawEssayScore = roundScore(totalEssay)
      const finalMaxScore = computedMaxFromQuestions > 0 ? computedMaxFromQuestions : Number(localResult?.max_auto_score || 0)
      const autoScoreCurrent = Number(localResult?.auto_score || 0)
      const finalEssayScore = finalMaxScore > 0 && (autoScoreCurrent + rawEssayScore) > finalMaxScore
        ? Math.max(0, roundScore(finalMaxScore - autoScoreCurrent))
        : rawEssayScore
      const cleanBd = updatedBd.map(({ questionObj, ...rest }) => rest)

      const { data, error } = await results.update(localResult.id, {
        essay_score: finalEssayScore,
        max_auto_score: finalMaxScore,
        breakdown: JSON.stringify(cleanBd)
      })

      if (error) {
        alert('Gagal menyimpan nilai: ' + (error.message || 'Terjadi kesalahan'))
        return
      }

      const updatedRes = {
        ...localResult,
        essay_score: finalEssayScore,
        max_auto_score: finalMaxScore,
        breakdown: JSON.stringify(cleanBd)
      }
      setLocalResult(updatedRes)
      onUpdateResult?.(updatedRes)
      setSaveSuccessMsg(`Skor soal #${qNum} berhasil disimpan: ${formatScore(earned)} poin!`)
      setTimeout(() => setSaveSuccessMsg(null), 3000)
    } catch (err) {
      console.error('Error saving inline score:', err)
      alert('Terjadi kesalahan saat menyimpan nilai')
    } finally {
      setInlineSaving(null)
    }
  }

  // Filtered questions
  const displayedItems = useMemo(() => {
    if (filterType === 'all') return breakdownList
    return breakdownList.filter(b => b.status === filterType)
  }, [breakdownList, filterType])

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="modal"
        style={{
          maxWidth: 940,
          width: '95vw',
          height: '92vh',
          maxHeight: '92vh',
          background: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
      >
        {/* ─── Modal Header ─────────────────────────────────────────── */}
        <div
          style={{
            padding: '1.15rem 1.5rem',
            background: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.15rem',
                color: '#dfae34',
                border: '1.5px solid rgba(223, 174, 52, 0.5)',
                flexShrink: 0,
              }}
            >
              {studentName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
                  {studentName}
                </h3>
                <span
                  style={{
                    background: 'rgba(255, 255, 255, 0.14)',
                    color: '#f8fafc',
                    fontSize: '0.72rem',
                    padding: '0.15rem 0.55rem',
                    borderRadius: 999,
                    fontWeight: 600,
                  }}
                >
                  Kelas {studentClass}
                </span>
                {studentUsername && (
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    ({studentUsername})
                  </span>
                )}
              </div>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#cbd5e1' }}>
                Rincian Lembar Jawaban: <strong style={{ color: '#ffffff' }}>{exam?.title || 'Ujian'}</strong>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{
                color: '#f8fafc',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.05)',
                fontSize: '0.8rem',
                borderRadius: 8,
              }}
              onClick={() => window.print()}
              title="Cetak Lembar Jawaban Siswa"
            >
              <Printer size={14} /> Cetak
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{
                color: '#f8fafc',
                padding: '0.45rem',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={onClose}
              title="Tutup Modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ─── Score Overview & Filter Card ─────────────────────────── */}
        <div
          style={{
            padding: '1rem 1.5rem',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            flexShrink: 0,
          }}
        >
          {/* KPI Metrics */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '0.75rem',
              marginBottom: '0.875rem',
            }}
          >
            {/* Total Nilai */}
            <div
              style={{
                padding: '0.75rem 0.95rem',
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 8,
                  background: isPassed ? '#dcfce7' : '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isPassed ? '#16a34a' : '#dc2626',
                  flexShrink: 0,
                }}
              >
                <Award size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.3px' }}>
                  NILAI AKHIR
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: isPassed ? '#16a34a' : '#dc2626', lineHeight: 1.2 }}>
                  {pctStr}%
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b', marginLeft: 6 }}>
                    ({formatScore(totalScore)} / {formatScore(maxPossible)})
                  </span>
                </div>
              </div>
            </div>

            {/* Skor Otomatis vs Esai */}
            <div
              style={{
                padding: '0.75rem 0.95rem',
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.3px' }}>
                KOMPONEN SKOR
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: 4, display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <span style={{ color: '#0f172a' }} title="Skor Pilihan Ganda & Soal Otomatis">
                  Auto: <strong>{formatScore(autoScore)}</strong>
                </span>
                <span style={{ color: '#cbd5e1' }}>|</span>
                <span style={{ color: '#0f172a' }} title="Skor Esai Manual">
                  Esai: <strong>{formatScore(essayScore)}</strong>
                </span>
              </div>
            </div>

            {/* Status Kelulusan */}
            <div
              style={{
                padding: '0.75rem 0.95rem',
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.3px' }}>
                STATUS KELULUSAN (KKM {passingGrade})
              </div>
              <div style={{ marginTop: 4 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.2rem 0.55rem',
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: isPassed ? '#dcfce7' : '#fee2e2',
                    color: isPassed ? '#15803d' : '#b91c1c',
                  }}
                >
                  {isPassed ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {isPassed ? 'TUNTAS (LULUS)' : 'BELUM TUNTAS'}
                </span>
              </div>
            </div>

            {/* Integritas CBT */}
            <div
              style={{
                padding: '0.75rem 0.95rem',
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.3px' }}>
                INTEGRITAS CBT
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center' }}>
                {result?.violation_count > 0 ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.2rem 0.55rem',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: '#fee2e2',
                      color: '#b91c1c',
                    }}
                  >
                    <ShieldAlert size={14} /> {result.violation_count} Pelanggaran
                  </span>
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.2rem 0.55rem',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: '#dcfce7',
                      color: '#15803d',
                    }}
                  >
                    <CheckCircle2 size={14} /> 0 Pelanggaran (Tertib)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginRight: '0.25rem' }}>
              Filter:
            </span>
            <button
              type="button"
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '0.3rem 0.65rem',
                borderRadius: 6,
                border: filterType === 'all' ? '1px solid #0f172a' : '1px solid #e2e8f0',
                background: filterType === 'all' ? '#0f172a' : '#ffffff',
                color: filterType === 'all' ? '#ffffff' : '#475569',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onClick={() => setFilterType('all')}
            >
              Semua ({stats.total})
            </button>
            <button
              type="button"
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '0.3rem 0.65rem',
                borderRadius: 6,
                border: filterType === 'correct' ? '1px solid #16a34a' : '1px solid #e2e8f0',
                background: filterType === 'correct' ? '#16a34a' : '#ffffff',
                color: filterType === 'correct' ? '#ffffff' : '#15803d',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onClick={() => setFilterType('correct')}
            >
              ✓ Benar ({stats.correct})
            </button>
            <button
              type="button"
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '0.3rem 0.65rem',
                borderRadius: 6,
                border: filterType === 'wrong' ? '1px solid #dc2626' : '1px solid #e2e8f0',
                background: filterType === 'wrong' ? '#dc2626' : '#ffffff',
                color: filterType === 'wrong' ? '#ffffff' : '#b91c1c',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onClick={() => setFilterType('wrong')}
            >
              ✗ Salah ({stats.wrong})
            </button>
            {stats.partial > 0 && (
              <button
                type="button"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '0.3rem 0.65rem',
                  borderRadius: 6,
                  border: filterType === 'partial' ? '1px solid #d97706' : '1px solid #e2e8f0',
                  background: filterType === 'partial' ? '#d97706' : '#ffffff',
                  color: filterType === 'partial' ? '#ffffff' : '#b45309',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => setFilterType('partial')}
              >
                ~ Parsial ({stats.partial})
              </button>
            )}
            {stats.pending > 0 && (
              <button
                type="button"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '0.3rem 0.65rem',
                  borderRadius: 6,
                  border: filterType === 'pending' ? '1px solid #2563eb' : '1px solid #e2e8f0',
                  background: filterType === 'pending' ? '#2563eb' : '#ffffff',
                  color: filterType === 'pending' ? '#ffffff' : '#1d4ed8',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => setFilterType('pending')}
              >
                ⏳ Esai Menunggu ({stats.pending})
              </button>
            )}

            {onOpenEssayGrading && hasEssays && (
              <button
                type="button"
                className="btn btn-gold btn-xs"
                style={{
                  marginLeft: 'auto',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
                onClick={() => {
                  onClose()
                  onOpenEssayGrading(localResult)
                }}
              >
                <Edit3 size={13} /> {stats.pending > 0 ? 'Nilai Esai Siswa Ini' : 'Ubah Nilai Esai'}
              </button>
            )}
          </div>
        </div>

        {saveSuccessMsg && (
          <div style={{ margin: '0 1.5rem 0.5rem', padding: '0.45rem 0.85rem', background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600 }}>
            ✓ {saveSuccessMsg}
          </div>
        )}

        {/* ─── Question Breakdown List (Scrollable) ──────────────────── */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            overflowY: 'auto',
            flex: '1 1 0',
            minHeight: 0,
            background: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {displayedItems.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '3.5rem 1rem',
                color: '#64748b',
                background: '#ffffff',
                borderRadius: 12,
                border: '1px solid #e2e8f0',
              }}
            >
              Tidak ada butir soal dengan status filter ini.
            </div>
          ) : (
            displayedItems.map((b) => {
              const qObj = b.questionObj || questionMap.get(Number(b.number)) || {}
              const qNum = b.number
              const qType = b.type || qObj.type || 'MCQ'
              const studentGiven = b.given
              const correctKey = b.correct ?? qObj.correct_answer
              const isAD = qType === 'AGREE_DISAGREE'
              const isEssay = qType === 'ESSAY' || qType === 'PARAGRAPH' || (isAD && (b.reason_type === 'essay' || qObj.options?.reason_type === 'essay' || qObj.correct_answer?.reason_type === 'essay'))
              const configuredPts = (qObj?.points !== undefined && qObj?.points !== null && !isNaN(Number(qObj.points)))
                ? Number(qObj.points)
                : (Number(b.max) || 1)
              const maxPts = (isAD && isEssay) ? roundScore(configuredPts * 0.5) : roundScore(configuredPts)
              const earnedPts = b.earned !== undefined ? Number(b.earned) : 0

              const borderAccentColor =
                b.status === 'correct'
                  ? '#10b981'
                  : b.status === 'wrong'
                  ? '#ef4444'
                  : b.status === 'partial'
                  ? '#f59e0b'
                  : '#3b82f6'

              return (
                <div
                  key={qNum}
                  style={{
                    flexShrink: 0,
                    width: '100%',
                    background: '#ffffff',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    borderLeft: `4px solid ${borderAccentColor}`,
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Question Item Header */}
                  <div
                    style={{
                      padding: '0.75rem 1.15rem',
                      background: '#ffffff',
                      borderBottom: '1px solid #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.65rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          background: '#0f172a',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {qNum}
                      </span>
                      <span
                        style={{
                          background: '#f1f5f9',
                          border: '1px solid #e2e8f0',
                          padding: '0.15rem 0.5rem',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: '#475569',
                        }}
                      >
                        {typeLabel(qType)}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>
                        Bobot: {formatScore(maxPts)} poin
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          color: earnedPts > 0 ? '#15803d' : '#b91c1c',
                        }}
                      >
                        Skor: {formatScore(earnedPts)} / {formatScore(maxPts)}
                      </span>
                      <StatusBadge status={b.status} />
                    </div>
                  </div>

                  {/* Question Content Body */}
                  <div style={{ padding: '1.15rem 1.25rem' }}>
                    {/* Stimulus Media if present */}
                    {qObj.image_url && (
                      <div style={{ marginBottom: '0.875rem', maxWidth: 450 }}>
                        <AdaptiveExamImage src={qObj.image_url} alt={`Soal ${qNum}`} maxHeight={240} type="question" />
                      </div>
                    )}

                    {/* Question Text */}
                    <div
                      style={{
                        fontSize: '0.92rem',
                        lineHeight: 1.6,
                        marginBottom: '0.875rem',
                        color: '#1e293b',
                      }}
                    >
                      {qObj.question_text ? (
                        <FormattedText text={qObj.question_text} />
                      ) : (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                          (Soal Butir #{qNum})
                        </span>
                      )}
                    </div>

                    {/* Detailed Answer Breakdown based on Question Type */}
                    <div
                      style={{
                        padding: '0.875rem 1rem',
                        borderRadius: 10,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      <RenderQuestionAnswerBreakdown
                        qType={qType}
                        question={qObj}
                        given={studentGiven}
                        correct={correctKey}
                        status={b.status}
                        earned={earnedPts}
                        max={maxPts}
                      />
                    </div>

                    {/* Inline Essay Grading Control directly inside Detailed Function */}
                    {isEssay && (
                      <div
                        style={{
                          marginTop: '0.85rem',
                          padding: '0.75rem 1rem',
                          borderRadius: 10,
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '0.75rem',
                        }}
                      >
                        <div>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', display: 'block' }}>
                            Penilaian Soal Esai No. {qNum}:
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Maksimal <strong>{formatScore(maxPts)}</strong> poin sesuai pengaturan ujian
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <input
                            type="number"
                            min="0"
                            max={maxPts}
                            step="any"
                            style={{
                              width: 75,
                              padding: '0.35rem 0.5rem',
                              fontSize: '0.88rem',
                              fontWeight: 700,
                              textAlign: 'center',
                              borderRadius: 6,
                              border: '1px solid #94a3b8',
                              background: '#ffffff',
                              color: '#0f172a',
                            }}
                            value={inlineScores[qNum] !== undefined ? inlineScores[qNum] : (b.status !== 'pending' ? earnedPts : '')}
                            placeholder="0"
                            onChange={e => handleInlineScoreChange(qNum, e.target.value, maxPts)}
                          />
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>/ {formatScore(maxPts)}</span>

                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', height: 28, background: '#e2e8f0' }}
                              onClick={() => handleInlineScoreChange(qNum, 0, maxPts)}
                              title="Beri Skor 0"
                            >
                              0
                            </button>
                            {maxPts > 1 && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', height: 28, background: '#e2e8f0' }}
                                onClick={() => handleInlineScoreChange(qNum, roundScore(maxPts / 2), maxPts)}
                                title="Beri Skor 50%"
                              >
                                50%
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', height: 28 }}
                              onClick={() => handleInlineScoreChange(qNum, maxPts, maxPts)}
                              title={`Beri Skor Penuh (${formatScore(maxPts)})`}
                            >
                              Penuh
                            </button>
                          </div>

                          <button
                            type="button"
                            className="btn btn-gold btn-sm"
                            style={{
                              padding: '0.25rem 0.75rem',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              height: 28,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                            }}
                            disabled={inlineSaving === qNum}
                            onClick={() => handleSaveInlineScore(qNum, maxPts)}
                          >
                            <Save size={13} /> {inlineSaving === qNum ? 'Menyimpan...' : 'Simpan Nilai'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ─── Modal Footer ─────────────────────────────────────────── */}
        <div
          style={{
            padding: '0.875rem 1.5rem',
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Menampilkan {displayedItems.length} dari {breakdownList.length} butir soal
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              padding: '0.35rem 1.15rem',
              borderRadius: 8,
            }}
            onClick={onClose}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Status Badge Component ──────────────────────────────────────────────────
function StatusBadge({ status }) {
  if (status === 'correct') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: '0.15rem 0.5rem',
          borderRadius: 6,
          background: '#dcfce7',
          color: '#15803d',
          fontWeight: 700,
          fontSize: '0.72rem',
        }}
      >
        <CheckCircle2 size={12} /> Benar
      </span>
    )
  }
  if (status === 'wrong') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: '0.15rem 0.5rem',
          borderRadius: 6,
          background: '#fee2e2',
          color: '#b91c1c',
          fontWeight: 700,
          fontSize: '0.72rem',
        }}
      >
        <XCircle size={12} /> Salah
      </span>
    )
  }
  if (status === 'partial') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: '0.15rem 0.5rem',
          borderRadius: 6,
          background: '#fef3c7',
          color: '#b45309',
          fontWeight: 700,
          fontSize: '0.72rem',
        }}
      >
        <AlertTriangle size={12} /> Parsial
      </span>
    )
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.15rem 0.5rem',
        borderRadius: 6,
        background: '#dbeafe',
        color: '#1d4ed8',
        fontWeight: 700,
        fontSize: '0.72rem',
      }}
    >
      <Clock size={12} /> Belum Dinilai
    </span>
  )
}

// ─── Question Type Specific Visual Answer Breakdown ─────────────────────────
function RenderQuestionAnswerBreakdown({ qType, question, given, correct, status, earned, max }) {
  const options = question?.options || {}

  // 1. MCQ & DROPDOWN
  if (qType === 'MCQ' || qType === 'DROPDOWN') {
    const keys = Object.keys(options).filter(k => k !== 'option_images')
    const givenKey = String(Array.isArray(given) ? given[0] : (given || '')).trim().toLowerCase()
    const correctKey = String(Array.isArray(correct) ? correct[0] : (correct || '')).trim().toLowerCase()

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.15rem' }}>
          Pilihan Jawaban &amp; Respon Siswa:
        </div>
        {keys.map(k => {
          const lk = k.toLowerCase()
          const isStudentPick = givenKey === lk
          const isCorrectOption = correctKey === lk

          let border = '1px solid #e2e8f0'
          let bg = '#ffffff'
          let label = null

          if (isStudentPick && isCorrectOption) {
            border = '1.5px solid #16a34a'
            bg = '#f0fdf4'
            label = <span style={{ color: '#15803d', fontWeight: 700, fontSize: '0.72rem' }}>✓ Jawaban Siswa (Benar)</span>
          } else if (isStudentPick && !isCorrectOption) {
            border = '1.5px solid #ef4444'
            bg = '#fef2f2'
            label = <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: '0.72rem' }}>✗ Jawaban Siswa (Salah)</span>
          } else if (!isStudentPick && isCorrectOption) {
            border = '1.5px dashed #16a34a'
            bg = '#f0fdf4'
            label = <span style={{ color: '#15803d', fontWeight: 700, fontSize: '0.72rem' }}>★ Kunci Jawaban</span>
          }

          return (
            <div
              key={k}
              style={{
                padding: '0.6rem 0.85rem',
                borderRadius: 8,
                border,
                background: bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: isStudentPick
                      ? (isCorrectOption ? '#16a34a' : '#ef4444')
                      : '#f1f5f9',
                    color: isStudentPick ? '#ffffff' : '#334155',
                    border: isStudentPick ? 'none' : '1px solid #cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {k.toUpperCase()}
                </span>
                <span style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                  {options[k]}
                </span>
              </div>
              {label}
            </div>
          )
        })}
        {!givenKey && (
          <div style={{ fontSize: '0.75rem', color: '#b91c1c', fontStyle: 'italic', marginTop: '0.2rem' }}>
            ⚠️ Siswa tidak memilih jawaban untuk soal ini.
          </div>
        )}
      </div>
    )
  }

  // 2. COMPLEX_MCQ & CHECKBOXES
  if (qType === 'COMPLEX_MCQ' || qType === 'CHECKBOXES') {
    const keys = Object.keys(options).filter(k => k !== 'option_images')
    const studentPicks = Array.isArray(given)
      ? given.map(s => String(s).toLowerCase())
      : (given ? [String(given).toLowerCase()] : [])
    const correctPicks = Array.isArray(correct)
      ? correct.map(s => String(s).toLowerCase())
      : (typeof correct === 'string' ? correct.split(',').map(s => s.trim().toLowerCase()) : [])

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.15rem' }}>
          Pilihan Ganda Kompleks (Pilihan Siswa vs Kunci):
        </div>
        {keys.map(k => {
          const lk = k.toLowerCase()
          const isSelected = studentPicks.includes(lk)
          const isKey = correctPicks.includes(lk)

          let border = '1px solid #e2e8f0'
          let bg = '#ffffff'
          let badge = null

          if (isSelected && isKey) {
            border = '1.5px solid #16a34a'
            bg = '#f0fdf4'
            badge = <span style={{ color: '#15803d', fontWeight: 700, fontSize: '0.72rem' }}>✓ Dipilih Siswa (Benar)</span>
          } else if (isSelected && !isKey) {
            border = '1.5px solid #ef4444'
            bg = '#fef2f2'
            badge = <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: '0.72rem' }}>✗ Dipilih Siswa (Salah)</span>
          } else if (!isSelected && isKey) {
            border = '1.5px dashed #d97706'
            bg = '#fffbeb'
            badge = <span style={{ color: '#b45309', fontWeight: 700, fontSize: '0.72rem' }}>⚠ Seharusnya Dipilih</span>
          }

          return (
            <div
              key={k}
              style={{
                padding: '0.6rem 0.85rem',
                borderRadius: 8,
                border,
                background: bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                {isSelected ? (
                  <CheckSquare size={16} color={isKey ? '#16a34a' : '#ef4444'} />
                ) : (
                  <Square size={16} style={{ color: '#94a3b8' }} />
                )}
                <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1e293b' }}>{k.toUpperCase()}.</span>
                <span style={{ fontSize: '0.85rem', color: '#1e293b' }}>{options[k]}</span>
              </div>
              {badge}
            </div>
          )
        })}
      </div>
    )
  }

  // 3. TRUE_FALSE
  if (qType === 'TRUE_FALSE') {
    const keys = Object.keys(options)
    const studentMap = (given && typeof given === 'object') ? given : {}
    const correctMap = (correct && typeof correct === 'object') ? correct : {}

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
          Pernyataan Benar / Salah:
        </div>
        {keys.map((k, idx) => {
          const sVal = studentMap[k]
          const cVal = correctMap[k]
          const isMatch = sVal !== undefined && String(sVal).toLowerCase() === String(cVal).toLowerCase()

          return (
            <div
              key={k}
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                background: '#ffffff',
                border: isMatch ? '1px solid #bbf7d0' : '1px solid #fecaca',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>
                {idx + 1}. {options[k]}
              </div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  Jawaban Siswa:{' '}
                  <strong style={{ color: isMatch ? '#15803d' : '#b91c1c' }}>
                    {sVal === 'true' ? '✓ Benar' : sVal === 'false' ? '✗ Salah' : '— (Tidak Dijawab)'}
                  </strong>
                </div>
                <div>
                  Kunci:{' '}
                  <strong style={{ color: '#0f172a' }}>
                    {cVal === 'true' ? 'Benar' : cVal === 'false' ? 'Salah' : '—'}
                  </strong>
                </div>
                {isMatch ? (
                  <span style={{ color: '#15803d', fontWeight: 700, fontSize: '0.72rem' }}>✓ Tepat</span>
                ) : (
                  <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: '0.72rem' }}>✗ Tidak Tepat</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // 4. MATCHING
  if (qType === 'MATCHING') {
    const leftItems = options.left || {}
    const rightItems = options.right || {}
    const leftKeys = Object.keys(leftItems)
    const studentPairs = (given && typeof given === 'object') ? given : {}
    const correctPairs = (correct && typeof correct === 'object') ? correct : {}

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
          Pasangan Menjodohkan:
        </div>
        {leftKeys.map((lKey, idx) => {
          const sRight = studentPairs[lKey]
          const cRight = correctPairs[lKey]
          const isMatch = sRight && sRight === cRight

          return (
            <div
              key={lKey}
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: 8,
                background: '#ffffff',
                border: isMatch ? '1px solid #bbf7d0' : '1px solid #fecaca',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div style={{ flex: 1, minWidth: 180, fontSize: '0.85rem', color: '#1e293b' }}>
                <strong>{idx + 1}.</strong> {leftItems[lKey]}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
                <ArrowRight size={13} color="#94a3b8" />
                <div>
                  Pilihan Siswa:{' '}
                  <strong style={{ color: isMatch ? '#15803d' : '#b91c1c' }}>
                    {sRight ? `${sRight}. ${rightItems[sRight] || ''}` : '— (Kosong)'}
                  </strong>
                </div>
                {!isMatch && (
                  <div style={{ color: '#64748b', marginLeft: 6 }}>
                    (Kunci: <strong style={{ color: '#15803d' }}>{cRight}. {rightItems[cRight] || ''}</strong>)
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // 5. SEQUENCING
  if (qType === 'SEQUENCING') {
    const rawItems = options.items || (Array.isArray(options) ? options : [])
    const itemMap = {}
    rawItems.forEach((it, i) => {
      const id = it.id || `seq_${i + 1}`
      itemMap[id] = it.text || it.label || String(it)
    })

    const studentOrder = Array.isArray(given) ? given : []
    const correctOrder = Array.isArray(correct) ? correct : []

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
          Urutan Langkah / Kejadian:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
          {/* Urutan Siswa */}
          <div style={{ padding: '0.75rem', borderRadius: 8, background: '#ffffff', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, fontSize: '0.78rem', marginBottom: '0.4rem', color: '#475569' }}>
              Urutan Jawaban Siswa:
            </div>
            {studentOrder.length === 0 ? (
              <span style={{ fontSize: '0.78rem', color: '#b91c1c', fontStyle: 'italic' }}>
                Tidak ada urutan yang diatur oleh siswa.
              </span>
            ) : (
              studentOrder.map((itId, idx) => {
                const isMatchAtRank = correctOrder[idx] === itId
                return (
                  <div
                    key={idx}
                    style={{
                      fontSize: '0.78rem',
                      padding: '0.3rem 0',
                      borderBottom: '1px dashed #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: isMatchAtRank ? '#15803d' : '#b91c1c' }}>
                      {idx + 1}.
                    </span>
                    <span style={{ color: '#1e293b' }}>{itemMap[itId] || itId}</span>
                    {isMatchAtRank && <span style={{ color: '#15803d', fontSize: '0.72rem' }}>✓</span>}
                  </div>
                )
              })
            )}
          </div>

          {/* Urutan Kunci */}
          <div style={{ padding: '0.75rem', borderRadius: 8, background: '#ffffff', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, fontSize: '0.78rem', marginBottom: '0.4rem', color: '#15803d' }}>
              Kunci Urutan yang Benar:
            </div>
            {correctOrder.map((itId, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: '0.78rem',
                  padding: '0.3rem 0',
                  borderBottom: '1px dashed #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <strong style={{ color: '#15803d' }}>{idx + 1}.</strong>
                <span style={{ color: '#1e293b' }}>{itemMap[itId] || itId}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // 6. AGREE_DISAGREE
  if (qType === 'AGREE_DISAGREE') {
    const studentVal = (given && typeof given === 'object') ? given : {}
    const correctVal = (correct && typeof correct === 'object') ? correct : {}

    const stance = studentVal.stance || ''
    const correctStance = correctVal.stance || ''
    const isStanceMatch = stance && stance === correctStance

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
          Respon Setuju / Tidak Setuju:
        </div>
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.82rem' }}>
          <div>
            Sikap Siswa:{' '}
            <strong style={{ color: isStanceMatch ? '#15803d' : '#b91c1c' }}>
              {stance === 'agree' ? '👍 Setuju' : stance === 'disagree' ? '👎 Tidak Setuju' : '— (Kosong)'}
            </strong>
          </div>
          <div>
            Kunci Sikap:{' '}
            <strong style={{ color: '#0f172a' }}>
              {correctStance === 'agree' ? '👍 Setuju' : correctStance === 'disagree' ? '👎 Tidak Setuju' : 'Bebas / Berdasarkan Argumen'}
            </strong>
          </div>
        </div>

        {/* Reasons */}
        {studentVal.reasons && Array.isArray(studentVal.reasons) && studentVal.reasons.length > 0 && (
          <div style={{ fontSize: '0.78rem' }}>
            <span style={{ fontWeight: 600, color: '#475569' }}>Alasan Dipilih Siswa: </span>
            {studentVal.reasons.map(rKey => (
              <span key={rKey} style={{ background: '#ffffff', padding: '0.15rem 0.45rem', borderRadius: 4, border: '1px solid #cbd5e1', marginRight: 6, color: '#1e293b' }}>
                <strong>{rKey}.</strong> {options[rKey] || ''}
              </span>
            ))}
          </div>
        )}

        {studentVal.essay && (
          <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.72rem', color: '#64748b', marginBottom: '0.2rem' }}>
              Argumen / Alasan Tertulis Siswa:
            </div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, color: '#1e293b' }}>
              {studentVal.essay}
            </div>
          </div>
        )}
      </div>
    )
  }

  // 7. ESSAY / PARAGRAPH
  if (qType === 'ESSAY' || qType === 'PARAGRAPH') {
    const studentText = typeof given === 'string' ? given : (given?.essay || '')
    const rubric = question?.rubric || question?.options?.rubric || ''

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
          Jawaban Esai Siswa:
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '0.875rem 1rem',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            minHeight: 70,
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
            fontSize: '0.88rem',
            color: studentText ? '#1e293b' : '#b91c1c',
            fontStyle: studentText ? 'normal' : 'italic',
          }}
        >
          {studentText || '⚠️ Siswa tidak mengisi jawaban esai ini.'}
        </div>

        {rubric && (
          <div
            style={{
              background: '#fffbeb',
              padding: '0.65rem 0.85rem',
              borderRadius: 8,
              border: '1px solid #fde68a',
              fontSize: '0.78rem',
              color: '#92400e',
            }}
          >
            <div style={{ fontWeight: 700, color: '#b45309', marginBottom: '0.2rem' }}>
              Rubrik / Pedoman Jawaban Guru:
            </div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {rubric}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ color: '#64748b' }}>
            Panjang Karakter: <strong style={{ color: '#0f172a' }}>{studentText.length}</strong> karakter
          </div>
          <div style={{ fontWeight: 700, color: status === 'pending' ? '#2563eb' : '#15803d' }}>
            {status === 'pending'
              ? '⏳ Belum dinilai guru'
              : `Skor Diberikan: ${formatScore(earned)} / ${formatScore(max)} poin`}
          </div>
        </div>
      </div>
    )
  }

  // Fallback
  return (
    <div style={{ fontSize: '0.8rem', color: '#1e293b' }}>
      <div>Jawaban Siswa: <code>{JSON.stringify(given)}</code></div>
      <div>Kunci: <code>{JSON.stringify(correct)}</code></div>
    </div>
  )
}

function typeLabel(t) {
  return {
    MCQ: 'Pilihan Ganda',
    COMPLEX_MCQ: 'Multi PG',
    TRUE_FALSE: 'Benar / Salah',
    MATCHING: 'Menjodohkan',
    SEQUENCING: 'Mengurutkan',
    AGREE_DISAGREE: 'Setuju / Tidak Setuju',
    ESSAY: 'Esai',
    PARAGRAPH: 'Esai Paragraf',
  }[t] || t
}
