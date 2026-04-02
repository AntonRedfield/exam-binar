import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { exams, results, questions } from '../../lib/db'
import { ChevronLeft, AlertTriangle, CheckCircle, XCircle, TrendingUp, TrendingDown, HelpCircle } from 'lucide-react'

export default function QuestionAnalytics() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('difficulty') // 'difficulty' | 'number'

  useEffect(() => {
    async function load() {
      const [{ data: examData }, { data: resultList }, { data: questionList }] = await Promise.all([
        exams.getById(examId),
        results.listByExam(examId),
        questions.listByExam(examId),
      ])
      setExam(examData)

      if (!resultList?.length || !questionList?.length) {
        setAnalytics({ questions: [], totalStudents: 0, questionMap: {} })
        setLoading(false)
        return
      }

      // Build question lookup
      const qMap = {}
      questionList.forEach(q => {
        qMap[q.number] = q
      })

      // Parse all breakdowns
      const allBreakdowns = resultList.map(r => {
        try { return JSON.parse(r.breakdown || '[]') }
        catch { return [] }
      }).filter(b => b.length > 0)

      const totalStudents = allBreakdowns.length

      // Compute per-question stats
      const qStats = {}
      questionList.forEach(q => {
        qStats[q.number] = {
          number: q.number,
          type: q.type,
          correct_answer: q.correct_answer,
          points: q.points || 1,
          correct: 0,
          partial: 0,
          wrong: 0,
          unanswered: 0,
          total: totalStudents,
          wrongAnswers: {}, // track which wrong answers students give
        }
      })

      allBreakdowns.forEach(breakdown => {
        breakdown.forEach(b => {
          const stat = qStats[b.number]
          if (!stat) return

          if (b.status === 'correct') stat.correct++
          else if (b.status === 'partial') stat.partial++
          else if (b.status === 'wrong') stat.wrong++
          else if (b.status === 'pending') return // essay, skip

          // Track wrong answer patterns for MCQ
          if (b.status === 'wrong' && b.given && (b.type === 'MCQ' || b.type === 'COMPLEX_MCQ')) {
            const givenStr = Array.isArray(b.given) ? b.given.sort().join(',') : String(b.given)
            if (givenStr && givenStr !== '—') {
              stat.wrongAnswers[givenStr] = (stat.wrongAnswers[givenStr] || 0) + 1
            }
          }

          // Count unanswered (given is null/undefined/empty)
          if (!b.given && b.given !== 0 && b.status !== 'pending') {
            stat.unanswered++
          }
        })
      })

      // Calculate success rate and difficulty
      const questionsAnalysis = Object.values(qStats)
        .filter(s => s.type !== 'ESSAY')
        .map(s => {
          const successRate = s.total > 0 ? ((s.correct / s.total) * 100) : 0
          let difficulty = 'Sedang'
          let difficultyColor = 'var(--warning)'
          if (successRate > 75) { difficulty = 'Mudah'; difficultyColor = 'var(--success)' }
          else if (successRate < 40) { difficulty = 'Sulit'; difficultyColor = 'var(--danger)' }

          // Find most common wrong answer
          const wrongEntries = Object.entries(s.wrongAnswers).sort((a, b) => b[1] - a[1])
          const topWrongAnswer = wrongEntries.length > 0 ? wrongEntries[0] : null

          return {
            ...s,
            successRate: Math.round(successRate * 10) / 10,
            difficulty,
            difficultyColor,
            topWrongAnswer, // [answer, count]
          }
        })

      setAnalytics({ questions: questionsAnalysis, totalStudents, questionMap: qMap })
      setLoading(false)
    }
    load()
  }, [examId])

  if (loading) return <div className="loading-screen"><div className="spinner" style={{ width: 32, height: 32 }} /></div>

  const { questions: qAnalysis, totalStudents } = analytics

  // Sort
  const sorted = [...qAnalysis].sort((a, b) => {
    if (sortKey === 'difficulty') return a.successRate - b.successRate // hardest first
    return a.number - b.number
  })

  const easiest = qAnalysis.length > 0 ? [...qAnalysis].sort((a, b) => b.successRate - a.successRate)[0] : null
  const hardest = qAnalysis.length > 0 ? [...qAnalysis].sort((a, b) => a.successRate - b.successRate)[0] : null

  const difficultyDistrib = {
    easy: qAnalysis.filter(q => q.difficulty === 'Mudah').length,
    medium: qAnalysis.filter(q => q.difficulty === 'Sedang').length,
    hard: qAnalysis.filter(q => q.difficulty === 'Sulit').length,
  }

  // Questions with notable error patterns (MCQ only, with significant wrong answer concentration)
  const errorPatterns = sorted.filter(q =>
    q.topWrongAnswer && q.topWrongAnswer[1] >= 2 && (q.type === 'MCQ' || q.type === 'COMPLEX_MCQ')
  )

  const typeLabel = (t) => ({ MCQ: 'PG', COMPLEX_MCQ: 'Multi', TRUE_FALSE: 'B/S', ESSAY: 'Esai' }[t] || t)
  const formatAnswer = (val) => {
    if (val === undefined || val === null) return '—'
    if (Array.isArray(val)) return val.join(', ')
    if (typeof val === 'object') return Object.entries(val).map(([k, v]) => `${v}`).join(', ')
    return String(val)
  }

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/teacher/results/${examId}`)}><ChevronLeft size={15} /></button>
          <div>
            <h2>Analisis Soal: {exam?.title}</h2>
            <p className="text-muted text-sm">{totalStudents} siswa · {qAnalysis.length} soal dianalisis · KKM: {exam?.passing_grade ?? 60}</p>
          </div>
        </div>
      </div>

      <div className="page-body">
        {totalStudents === 0 ? (
          <div className="card empty-state">
            <p>Belum ada hasil ujian untuk dianalisis.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'var(--danger-bg)' }}>
                  <TrendingDown size={22} color="var(--danger)" />
                </div>
                <div>
                  <div className="stat-value" style={{ color: 'var(--danger)', fontSize: '1.3rem' }}>#{hardest?.number}</div>
                  <div className="stat-label">Soal Tersulit ({hardest?.successRate}% benar)</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'var(--success-bg)' }}>
                  <TrendingUp size={22} color="var(--success)" />
                </div>
                <div>
                  <div className="stat-value" style={{ color: 'var(--success)', fontSize: '1.3rem' }}>#{easiest?.number}</div>
                  <div className="stat-label">Soal Termudah ({easiest?.successRate}% benar)</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'var(--danger-bg)', fontSize: '1.1rem' }}>🔴</div>
                <div>
                  <div className="stat-value" style={{ fontSize: '1.3rem' }}>{difficultyDistrib.hard}</div>
                  <div className="stat-label">Soal Sulit (&lt;40%)</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'var(--warning-bg)', fontSize: '1.1rem' }}>🟡</div>
                <div>
                  <div className="stat-value" style={{ fontSize: '1.3rem' }}>{difficultyDistrib.medium}</div>
                  <div className="stat-label">Soal Sedang (40-75%)</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'var(--success-bg)', fontSize: '1.1rem' }}>🟢</div>
                <div>
                  <div className="stat-value" style={{ fontSize: '1.3rem' }}>{difficultyDistrib.easy}</div>
                  <div className="stat-label">Soal Mudah (&gt;75%)</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: 'rgba(79,142,247,0.1)', fontSize: '1.1rem' }}>📊</div>
                <div>
                  <div className="stat-value" style={{ fontSize: '1.3rem' }}>{totalStudents}</div>
                  <div className="stat-label">Total Peserta</div>
                </div>
              </div>
            </div>

            {/* Error Pattern Analysis */}
            {errorPatterns.length > 0 && (
              <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--warning)' }}>
                <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertTriangle size={18} color="var(--warning)" />
                  <h3 style={{ margin: 0 }}>Identifikasi Kesalahan (Error Patterns)</h3>
                </div>
                <p className="text-muted text-sm" style={{ marginBottom: '1rem' }}>
                  Soal-soal berikut menunjukkan pola jawaban salah yang dominan. Ini menandakan miskonsepsi yang perlu dibahas ulang.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {errorPatterns.map(q => {
                    const wrongPct = q.total > 0 ? Math.round((q.topWrongAnswer[1] / q.total) * 100) : 0
                    return (
                      <div key={q.number} style={{ background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                          <span style={{ fontWeight: 700 }}>
                            Soal #{q.number} <span className="text-muted text-xs">({typeLabel(q.type)})</span>
                          </span>
                          <span className="badge badge-closed" style={{ fontSize: '0.7rem' }}>
                            {wrongPct}% memilih jawaban salah yang sama
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          <span>{q.topWrongAnswer[1]} dari {q.total} siswa memilih </span>
                          <strong style={{ color: 'var(--danger)' }}>{q.topWrongAnswer[0]}</strong>
                          <span> (jawaban benar: </span>
                          <strong style={{ color: 'var(--success)' }}>{formatAnswer(q.correct_answer)}</strong>
                          <span>)</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                          → Topik terkait soal #{q.number} perlu penjelasan ulang
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Per Question Table */}
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Detail Per Soal</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className={`btn btn-sm ${sortKey === 'difficulty' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setSortKey('difficulty')}
                  >
                    Urutkan: Tersulit
                  </button>
                  <button
                    className={`btn btn-sm ${sortKey === 'number' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setSortKey('number')}
                  >
                    Urutkan: Nomor
                  </button>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Tipe</th>
                      <th>Kunci</th>
                      <th>Benar</th>
                      <th>Parsial</th>
                      <th>Salah</th>
                      <th>% Benar</th>
                      <th>Tingkat</th>
                      <th>Jawaban Salah Terbanyak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(q => (
                      <tr key={q.number}>
                        <td style={{ fontWeight: 700 }}>{q.number}</td>
                        <td><span className="question-type-badge">{typeLabel(q.type)}</span></td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{formatAnswer(q.correct_answer)}</td>
                        <td>
                          <span style={{ color: 'var(--success)', fontWeight: 600 }}>{q.correct}</span>
                          <span className="text-muted text-xs"> /{q.total}</span>
                        </td>
                        <td>
                          {q.partial > 0
                            ? <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{q.partial}</span>
                            : <span className="text-muted">—</span>
                          }
                        </td>
                        <td>
                          <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{q.wrong}</span>
                        </td>
                        <td>
                          {/* Visual bar */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: 60, height: 6, background: 'var(--navy-light)', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{
                                width: `${q.successRate}%`,
                                height: '100%',
                                borderRadius: 99,
                                background: q.difficultyColor
                              }} />
                            </div>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: q.difficultyColor }}>
                              {q.successRate}%
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="badge" style={{
                            background: q.difficulty === 'Mudah' ? 'var(--success-bg)' : q.difficulty === 'Sulit' ? 'var(--danger-bg)' : 'var(--warning-bg)',
                            color: q.difficultyColor,
                            border: `1px solid ${q.difficultyColor}30`,
                          }}>
                            {q.difficulty}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>
                          {q.topWrongAnswer ? (
                            <span>
                              <strong style={{ color: 'var(--danger)' }}>{q.topWrongAnswer[0]}</strong>
                              <span className="text-muted"> ({q.topWrongAnswer[1]}x)</span>
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
