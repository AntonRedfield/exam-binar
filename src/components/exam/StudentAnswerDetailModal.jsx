import React, { useState, useMemo } from 'react'
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
  Sparkles
} from 'lucide-react'
import FormattedText from '../common/FormattedText'
import AdaptiveExamImage from './AdaptiveExamImage'

export default function StudentAnswerDetailModal({
  result,
  exam,
  questions = [],
  onClose,
  onOpenEssayGrading
}) {
  const [filterType, setFilterType] = useState('all') // 'all' | 'correct' | 'wrong' | 'partial' | 'pending'

  // Student Profile Data
  const student = result?.users || result?.student || result?.profiles || {}
  const studentName = student.full_name || student.display_name || student.name || 'Siswa'
  const studentClass = student.kelas || student.class_section || student.classes?.name || '—'
  const studentUsername = student.username || ''

  // Score metrics
  const autoScore = Number(result?.auto_score || 0)
  const essayScore = Number(result?.essay_score || 0)
  const totalScore = autoScore + essayScore
  const maxPossible = Number(result?.max_auto_score || 0)
  const passingGrade = exam?.passing_grade ?? 60
  const pct = maxPossible > 0 ? (totalScore / maxPossible) * 100 : 0
  const isPassed = pct >= passingGrade
  const pctStr = pct.toLocaleString('id-ID', { maximumFractionDigits: 1 })

  // Question lookup map by number
  const questionMap = useMemo(() => {
    const map = new Map()
    questions.forEach(q => {
      map.set(Number(q.number), q)
    })
    return map
  }, [questions])

  // Parse breakdown
  const breakdownList = useMemo(() => {
    let bd = []
    try {
      bd = JSON.parse(result?.breakdown || '[]')
    } catch {
      bd = []
    }

    // Merge with questions list to ensure all questions appear even if not in breakdown
    const fullList = questions.map(q => {
      const existing = bd.find(b => Number(b.number) === Number(q.number))
      if (existing) {
        return {
          ...existing,
          questionObj: q,
        }
      }
      return {
        number: q.number,
        type: q.type,
        status: (q.type === 'ESSAY' || q.type === 'PARAGRAPH') ? 'pending' : 'wrong',
        earned: 0,
        max: q.points || 1,
        correct: q.correct_answer,
        given: null,
        questionObj: q,
      }
    })

    return fullList
  }, [result?.breakdown, questions])

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
        background: 'rgba(15, 23, 42, 0.82)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <div
        className="modal"
        style={{
          maxWidth: 920,
          width: '100%',
          maxHeight: '92vh',
          background: 'var(--surface, #ffffff)',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          border: '1px solid var(--border)',
        }}
      >
        {/* ─── Modal Header ─────────────────────────────────────────── */}
        <div
          style={{
            padding: '1.25rem 1.75rem',
            background: 'var(--navy, #1b3361)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.2rem',
                color: 'var(--gold, #dfae34)',
                border: '1.5px solid rgba(223, 174, 52, 0.4)',
              }}
            >
              {studentName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                  {studentName}
                </h3>
                <span
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    fontSize: '0.72rem',
                    padding: '0.15rem 0.55rem',
                    borderRadius: 999,
                    fontWeight: 600,
                  }}
                >
                  Kelas {studentClass}
                </span>
                {studentUsername && (
                  <span style={{ fontSize: '0.75rem', opacity: 0.75 }}>
                    ({studentUsername})
                  </span>
                )}
              </div>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', opacity: 0.85 }}>
                Rincian Lembar Jawaban: <strong>{exam?.title || 'Ujian'}</strong>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.25)' }}
              onClick={() => window.print()}
              title="Cetak Lembar Jawaban Siswa"
            >
              <Printer size={15} /> Cetak
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: '#ffffff', padding: '0.4rem', borderRadius: '50%' }}
              onClick={onClose}
              title="Tutup Modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ─── Score Overview & Filter Card ─────────────────────────── */}
        <div
          style={{
            padding: '1.25rem 1.75rem',
            background: 'var(--navy-light, #f8fafc)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '1rem',
              marginBottom: '1rem',
            }}
          >
            {/* Total Nilai */}
            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: 10,
                background: '#ffffff',
                border: '1px solid var(--border)',
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
                  background: isPassed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isPassed ? 'var(--success)' : 'var(--danger)',
                }}
              >
                <Award size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  NILAI AKHIR
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: isPassed ? 'var(--success)' : 'var(--danger)' }}>
                  {pctStr}%
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, marginLeft: 6 }}>
                    ({totalScore} / {maxPossible})
                  </span>
                </div>
              </div>
            </div>

            {/* Skor Otomatis vs Esai */}
            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: 10,
                background: '#ffffff',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                KOMPONEN SKOR
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, marginTop: 4, display: 'flex', gap: '0.75rem' }}>
                <span title="Skor Pilihan Ganda & Soal Otomatis">
                  Auto: <strong>{autoScore}</strong>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>|</span>
                <span title="Skor Esai Manual">
                  Esai: <strong>{essayScore}</strong>
                </span>
              </div>
            </div>

            {/* Status Kelulusan */}
            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: 10,
                background: '#ffffff',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                STATUS KELULUSAN (KKM {passingGrade})
              </div>
              <div style={{ marginTop: 4 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 6,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    background: isPassed ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                    color: isPassed ? 'var(--success)' : 'var(--danger)',
                  }}
                >
                  {isPassed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  {isPassed ? 'TUNTAS (LULUS)' : 'BELUM TUNTAS'}
                </span>
              </div>
            </div>

            {/* Pelanggaran */}
            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: 10,
                background: '#ffffff',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                INTEGRITAS CBT
              </div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {result?.violation_count > 0 ? (
                  <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <ShieldAlert size={16} /> {result.violation_count} Pelanggaran
                  </span>
                ) : (
                  <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <CheckCircle2 size={16} /> 0 Pelanggaran (Tertib)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.25rem' }}>
              Filter Soal:
            </span>
            <button
              type="button"
              className={`btn btn-xs ${filterType === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilterType('all')}
            >
              Semua ({stats.total})
            </button>
            <button
              type="button"
              className={`btn btn-xs ${filterType === 'correct' ? 'btn-primary' : 'btn-ghost'}`}
              style={filterType === 'correct' ? { background: 'var(--success)', borderColor: 'var(--success)' } : {}}
              onClick={() => setFilterType('correct')}
            >
              ✓ Benar ({stats.correct})
            </button>
            <button
              type="button"
              className={`btn btn-xs ${filterType === 'wrong' ? 'btn-primary' : 'btn-ghost'}`}
              style={filterType === 'wrong' ? { background: 'var(--danger)', borderColor: 'var(--danger)' } : {}}
              onClick={() => setFilterType('wrong')}
            >
              ✗ Salah ({stats.wrong})
            </button>
            {stats.partial > 0 && (
              <button
                type="button"
                className={`btn btn-xs ${filterType === 'partial' ? 'btn-primary' : 'btn-ghost'}`}
                style={filterType === 'partial' ? { background: 'var(--warning)', borderColor: 'var(--warning)' } : {}}
                onClick={() => setFilterType('partial')}
              >
                ~ Parsial ({stats.partial})
              </button>
            )}
            {stats.pending > 0 && (
              <button
                type="button"
                className={`btn btn-xs ${filterType === 'pending' ? 'btn-primary' : 'btn-ghost'}`}
                style={filterType === 'pending' ? { background: '#3b82f6', borderColor: '#3b82f6' } : {}}
                onClick={() => setFilterType('pending')}
              >
                ⏳ Esai Menunggu ({stats.pending})
              </button>
            )}
            {onOpenEssayGrading && stats.pending > 0 && (
              <button
                type="button"
                className="btn btn-gold btn-xs"
                style={{ marginLeft: 'auto', fontWeight: 700 }}
                onClick={() => {
                  onClose()
                  onOpenEssayGrading(result)
                }}
              >
                <Edit3 size={13} /> Nilai Esai Siswa Ini
              </button>
            )}
          </div>
        </div>

        {/* ─── Question Breakdown List (Scrollable) ──────────────────── */}
        <div
          style={{
            padding: '1.5rem 1.75rem',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {displayedItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              Tidak ada soal dengan filter status ini.
            </div>
          ) : (
            displayedItems.map((b) => {
              const qObj = b.questionObj || questionMap.get(Number(b.number)) || {}
              const qNum = b.number
              const qType = b.type || qObj.type || 'MCQ'
              const studentGiven = b.given
              const correctKey = b.correct ?? qObj.correct_answer
              const earnedPts = b.earned !== undefined ? Number(b.earned) : 0
              const maxPts = Number(b.max || qObj.points || 1)

              return (
                <div
                  key={qNum}
                  style={{
                    background: '#ffffff',
                    borderRadius: 12,
                    border: `1.5px solid ${
                      b.status === 'correct'
                        ? 'rgba(16, 185, 129, 0.35)'
                        : b.status === 'wrong'
                        ? 'rgba(239, 68, 68, 0.35)'
                        : b.status === 'partial'
                        ? 'rgba(245, 158, 11, 0.35)'
                        : 'rgba(59, 130, 246, 0.35)'
                    }`,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Question Item Header */}
                  <div
                    style={{
                      padding: '0.75rem 1.15rem',
                      background: 'var(--navy-light, #f8fafc)',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: 'var(--navy)',
                          color: '#ffffff',
                          fontWeight: 800,
                          fontSize: '0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {qNum}
                      </span>
                      <span
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          padding: '0.15rem 0.55rem',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {typeLabel(qType)}
                      </span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        Bobot: {maxPts} poin
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 800,
                          color: earnedPts > 0 ? 'var(--success)' : 'var(--danger)',
                        }}
                      >
                        Skor: {earnedPts} / {maxPts}
                      </span>
                      <StatusBadge status={b.status} />
                    </div>
                  </div>

                  {/* Question Content Body */}
                  <div style={{ padding: '1.25rem 1.35rem' }}>
                    {/* Stimulus Media if present */}
                    {qObj.image_url && (
                      <div style={{ marginBottom: '1rem', maxWidth: 450 }}>
                        <AdaptiveExamImage src={qObj.image_url} alt={`Soal ${qNum}`} maxHeight={260} type="question" />
                      </div>
                    )}

                    {/* Question Text */}
                    {qObj.question_text && (
                      <div
                        style={{
                          fontSize: '0.95rem',
                          lineHeight: 1.6,
                          marginBottom: '1rem',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <FormattedText text={qObj.question_text} />
                      </div>
                    )}

                    {/* Detailed Answer Breakdown based on Question Type */}
                    <div
                      style={{
                        padding: '1rem',
                        borderRadius: 10,
                        background: 'var(--navy-light, #f8fafc)',
                        border: '1px solid var(--border)',
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
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ─── Modal Footer ─────────────────────────────────────────── */}
        <div
          style={{
            padding: '1rem 1.75rem',
            background: 'var(--surface)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Menampilkan {displayedItems.length} dari {breakdownList.length} butir soal
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
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
          padding: '0.2rem 0.55rem',
          borderRadius: 6,
          background: 'rgba(16, 185, 129, 0.12)',
          color: 'var(--success)',
          fontWeight: 700,
          fontSize: '0.75rem',
        }}
      >
        <CheckCircle2 size={13} /> Benar
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
          padding: '0.2rem 0.55rem',
          borderRadius: 6,
          background: 'rgba(239, 68, 68, 0.12)',
          color: 'var(--danger)',
          fontWeight: 700,
          fontSize: '0.75rem',
        }}
      >
        <XCircle size={13} /> Salah
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
          padding: '0.2rem 0.55rem',
          borderRadius: 6,
          background: 'rgba(245, 158, 11, 0.12)',
          color: 'var(--warning)',
          fontWeight: 700,
          fontSize: '0.75rem',
        }}
      >
        <AlertTriangle size={13} /> Parsial
      </span>
    )
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.2rem 0.55rem',
        borderRadius: 6,
        background: 'rgba(59, 130, 246, 0.12)',
        color: '#2563eb',
        fontWeight: 700,
        fontSize: '0.75rem',
      }}
    >
      <Clock size={13} /> Belum Dinilai
    </span>
  )
}

// ─── Question Type Specific Visual Answer Breakdown ─────────────────────────
function RenderQuestionAnswerBreakdown({ qType, question, given, correct, status, earned, max }) {
  const options = question?.options || {}

  // 1. MCQ
  if (qType === 'MCQ' || qType === 'DROPDOWN') {
    const keys = Object.keys(options).filter(k => k !== 'option_images')
    const givenKey = String(Array.isArray(given) ? given[0] : (given || '')).trim().toLowerCase()
    const correctKey = String(Array.isArray(correct) ? correct[0] : (correct || '')).trim().toLowerCase()

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
          Pilihan Jawaban &amp; Respon Siswa:
        </div>
        {keys.map(k => {
          const lk = k.toLowerCase()
          const isStudentPick = givenKey === lk
          const isCorrectOption = correctKey === lk

          let border = '1px solid var(--border)'
          let bg = '#ffffff'
          let label = null

          if (isStudentPick && isCorrectOption) {
            border = '2px solid var(--success)'
            bg = 'rgba(16, 185, 129, 0.08)'
            label = <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.75rem' }}>✓ Jawaban Siswa (Benar)</span>
          } else if (isStudentPick && !isCorrectOption) {
            border = '2px solid var(--danger)'
            bg = 'rgba(239, 68, 68, 0.08)'
            label = <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.75rem' }}>✗ Jawaban Siswa (Salah)</span>
          } else if (!isStudentPick && isCorrectOption) {
            border = '2px dashed var(--success)'
            bg = 'rgba(16, 185, 129, 0.04)'
            label = <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.75rem' }}>★ Kunci Jawaban</span>
          }

          return (
            <div
              key={k}
              style={{
                padding: '0.65rem 0.85rem',
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
                    background: isStudentPick ? (isCorrectOption ? 'var(--success)' : 'var(--danger)') : 'var(--slate)',
                    color: isStudentPick ? '#ffffff' : 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                  }}
                >
                  {k.toUpperCase()}
                </span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  {options[k]}
                </span>
              </div>
              {label}
            </div>
          )
        })}
        {!givenKey && (
          <div style={{ fontSize: '0.8rem', color: 'var(--danger)', fontStyle: 'italic', marginTop: '0.25rem' }}>
            ⚠️ Siswa tidak memilih jawaban untuk soal ini.
          </div>
        )}
      </div>
    )
  }

  // 2. COMPLEX_MCQ
  if (qType === 'COMPLEX_MCQ' || qType === 'CHECKBOXES') {
    const keys = Object.keys(options).filter(k => k !== 'option_images')
    const studentPicks = Array.isArray(given)
      ? given.map(s => String(s).toLowerCase())
      : (given ? [String(given).toLowerCase()] : [])
    const correctPicks = Array.isArray(correct)
      ? correct.map(s => String(s).toLowerCase())
      : (typeof correct === 'string' ? correct.split(',').map(s => s.trim().toLowerCase()) : [])

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
          Pilihan Ganda Kompleks (Pilihan Siswa vs Kunci):
        </div>
        {keys.map(k => {
          const lk = k.toLowerCase()
          const isSelected = studentPicks.includes(lk)
          const isKey = correctPicks.includes(lk)

          let border = '1px solid var(--border)'
          let bg = '#ffffff'
          let badge = null

          if (isSelected && isKey) {
            border = '2px solid var(--success)'
            bg = 'rgba(16, 185, 129, 0.08)'
            badge = <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.75rem' }}>✓ Dipilih Siswa (Benar)</span>
          } else if (isSelected && !isKey) {
            border = '2px solid var(--danger)'
            bg = 'rgba(239, 68, 68, 0.08)'
            badge = <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.75rem' }}>✗ Dipilih Siswa (Salah)</span>
          } else if (!isSelected && isKey) {
            border = '2px dashed var(--warning)'
            bg = 'rgba(245, 158, 11, 0.05)'
            badge = <span style={{ color: 'var(--warning)', fontWeight: 700, fontSize: '0.75rem' }}>⚠ Seharusnya Dipilih</span>
          }

          return (
            <div
              key={k}
              style={{
                padding: '0.65rem 0.85rem',
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
                {isSelected ? <CheckSquare size={18} color={isKey ? 'var(--success)' : 'var(--danger)'} /> : <Square size={18} style={{ opacity: 0.3 }} />}
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{k.toUpperCase()}.</span>
                <span style={{ fontSize: '0.9rem' }}>{options[k]}</span>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
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
                padding: '0.75rem 0.9rem',
                borderRadius: 8,
                background: '#ffffff',
                border: isMatch ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                {idx + 1}. {options[k]}
              </div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.82rem', alignItems: 'center' }}>
                <div>
                  Jawaban Siswa:{' '}
                  <strong style={{ color: isMatch ? 'var(--success)' : 'var(--danger)' }}>
                    {sVal === 'true' ? '✓ Benar' : sVal === 'false' ? '✗ Salah' : '— (Tidak Dijawab)'}
                  </strong>
                </div>
                <div>
                  Kunci:{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {cVal === 'true' ? 'Benar' : cVal === 'false' ? 'Salah' : '—'}
                  </strong>
                </div>
                {isMatch ? (
                  <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.75rem' }}>✓ Tepat</span>
                ) : (
                  <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.75rem' }}>✗ Tidak Tepat</span>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
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
                padding: '0.75rem 0.9rem',
                borderRadius: 8,
                background: '#ffffff',
                border: isMatch ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div style={{ flex: 1, minWidth: 200, fontSize: '0.88rem' }}>
                <strong>{idx + 1}.</strong> {leftItems[lKey]}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                <ArrowRight size={14} color="var(--text-muted)" />
                <div>
                  Pilihan Siswa:{' '}
                  <strong style={{ color: isMatch ? 'var(--success)' : 'var(--danger)' }}>
                    {sRight ? `${sRight}. ${rightItems[sRight] || ''}` : '— (Kosong)'}
                  </strong>
                </div>
                {!isMatch && (
                  <div style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                    (Kunci: <strong style={{ color: 'var(--success)' }}>{cRight}. {rightItems[cRight] || ''}</strong>)
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          Urutan Langkah / Kejadian:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          {/* Urutan Siswa */}
          <div style={{ padding: '0.75rem', borderRadius: 8, background: '#ffffff', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
              Urutan Jawaban Siswa:
            </div>
            {studentOrder.length === 0 ? (
              <span style={{ fontSize: '0.82rem', color: 'var(--danger)', fontStyle: 'italic' }}>
                Tidak ada urutan yang diatur oleh siswa.
              </span>
            ) : (
              studentOrder.map((itId, idx) => {
                const isMatchAtRank = correctOrder[idx] === itId
                return (
                  <div
                    key={idx}
                    style={{
                      fontSize: '0.82rem',
                      padding: '0.35rem 0',
                      borderBottom: '1px dashed #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: isMatchAtRank ? 'var(--success)' : 'var(--danger)' }}>
                      {idx + 1}.
                    </span>
                    <span>{itemMap[itId] || itId}</span>
                    {isMatchAtRank && <span style={{ color: 'var(--success)', fontSize: '0.75rem' }}>✓</span>}
                  </div>
                )
              })
            )}
          </div>

          {/* Urutan Kunci */}
          <div style={{ padding: '0.75rem', borderRadius: 8, background: '#ffffff', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.5rem', color: 'var(--success)' }}>
              Kunci Urutan yang Benar:
            </div>
            {correctOrder.map((itId, idx) => (
              <div
                key={idx}
                style={{
                  fontSize: '0.82rem',
                  padding: '0.35rem 0',
                  borderBottom: '1px dashed #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <strong style={{ color: 'var(--success)' }}>{idx + 1}.</strong>
                <span>{itemMap[itId] || itId}</span>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          Respon Setuju / Tidak Setuju:
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.88rem' }}>
          <div>
            Sikap Siswa:{' '}
            <strong style={{ color: isStanceMatch ? 'var(--success)' : 'var(--danger)' }}>
              {stance === 'agree' ? '👍 Setuju' : stance === 'disagree' ? '👎 Tidak Setuju' : '— (Kosong)'}
            </strong>
          </div>
          <div>
            Kunci Sikap:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {correctStance === 'agree' ? '👍 Setuju' : correctStance === 'disagree' ? '👎 Tidak Setuju' : 'Bebas / Berdasarkan Argumen'}
            </strong>
          </div>
        </div>

        {/* Reasons */}
        {studentVal.reasons && Array.isArray(studentVal.reasons) && studentVal.reasons.length > 0 && (
          <div style={{ fontSize: '0.84rem' }}>
            <span style={{ fontWeight: 600 }}>Alasan Dipilih Siswa: </span>
            {studentVal.reasons.map(rKey => (
              <span key={rKey} style={{ background: '#ffffff', padding: '0.15rem 0.5rem', borderRadius: 4, border: '1px solid var(--border)', marginRight: 6 }}>
                <strong>{rKey}.</strong> {options[rKey] || ''}
              </span>
            ))}
          </div>
        )}

        {studentVal.essay && (
          <div style={{ background: '#ffffff', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.88rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              Argumen / Alasan Tertulis Siswa:
            </div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          Jawaban Esai Siswa:
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '1rem',
            borderRadius: 8,
            border: '1px solid var(--border)',
            minHeight: 80,
            whiteSpace: 'pre-wrap',
            lineHeight: 1.6,
            fontSize: '0.92rem',
            color: studentText ? 'var(--text-primary)' : 'var(--danger)',
            fontStyle: studentText ? 'normal' : 'italic',
          }}
        >
          {studentText || '⚠️ Siswa tidak mengisi jawaban esai ini.'}
        </div>

        {rubric && (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.05)',
              padding: '0.75rem 1rem',
              borderRadius: 8,
              border: '1px solid rgba(245, 158, 11, 0.25)',
              fontSize: '0.82rem',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--warning)', marginBottom: '0.25rem' }}>
              Rubrik / Pedoman Jawaban Guru:
            </div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {rubric}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
          <div>
            Panjang Karakter: <strong>{studentText.length}</strong> karakter
          </div>
          <div style={{ fontWeight: 700, color: status === 'pending' ? '#2563eb' : 'var(--success)' }}>
            {status === 'pending'
              ? '⏳ Belum dinilai guru'
              : `Skor Diberikan: ${earned} / ${max} poin`}
          </div>
        </div>
      </div>
    )
  }

  // Fallback
  return (
    <div style={{ fontSize: '0.85rem' }}>
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
