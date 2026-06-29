import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { exams, questions, sessions, surveys } from '../../lib/db'
import { ChevronLeft, Printer, Users, UserX, ClipboardList, BarChart2, Eye, X, Download, Clock, CheckCircle } from 'lucide-react'

const SURVEY_TYPE_LABELS = {
  SHORT_ANSWER: 'Jawaban Singkat',
  PARAGRAPH: 'Paragraf',
  LINEAR_SCALE: 'Skala Linear',
  MCQ_GRID: 'Kisi Pilihan Ganda',
  CHECKBOX_GRID: 'Kisi Kotak Centang',
  MCQ: 'Pilihan Ganda',
  CHECKBOXES: 'Kotak Centang',
  DROPDOWN: 'Dropdown',
}

export default function SurveyResponses() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [questionList, setQuestionList] = useState([])
  const [sessionList, setSessionList] = useState([])
  const [missingUsers, setMissingUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('summary') // 'summary' | 'individual' | 'missing'
  const [selectedUser, setSelectedUser] = useState(null)

  async function load() {
    const [{ data: examData }, { data: qs }, { data: sess }] = await Promise.all([
      exams.getById(examId),
      questions.listByExam(examId),
      sessions.listByExam(examId),
    ])
    setExam(examData)
    setQuestionList(qs || [])
    setSessionList((sess || []).filter(s => s.status === 'submitted'))

    const { data: missing } = await surveys.getMissingRespondents(examId)
    setMissingUsers(missing || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [examId])

  if (loading) return <div className="loading-screen"><div className="spinner" style={{ width: 32, height: 32 }} /></div>

  const respondedCount = sessionList.length
  const totalTarget = respondedCount + missingUsers.length
  const responsePct = totalTarget > 0 ? ((respondedCount / totalTarget) * 100).toFixed(1) : 0

  // Build aggregated data for each question
  function getAggregation(q) {
    const allAnswers = sessionList.map(s => s.answers?.[String(q.number)]).filter(a => a !== undefined && a !== null && a !== '')

    if (['MCQ', 'DROPDOWN'].includes(q.type)) {
      const counts = {}
      const options = q.options || {}
      Object.keys(options).forEach(k => { counts[k] = 0 })
      let otherCount = 0
      const otherTexts = []

      allAnswers.forEach(a => {
        if (typeof a === 'object' && a?.selected) {
          if (a.selected === '__other__') {
            otherCount++
            if (a.otherText) otherTexts.push(a.otherText)
          } else {
            counts[a.selected] = (counts[a.selected] || 0) + 1
          }
        } else {
          counts[a] = (counts[a] || 0) + 1
        }
      })
      return { type: 'bar', counts, options, otherCount, otherTexts, total: allAnswers.length }
    }

    if (q.type === 'CHECKBOXES') {
      const counts = {}
      const options = q.options || {}
      Object.keys(options).forEach(k => { counts[k] = 0 })

      allAnswers.forEach(a => {
        if (Array.isArray(a)) a.forEach(k => { counts[k] = (counts[k] || 0) + 1 })
      })
      return { type: 'bar', counts, options, total: allAnswers.length }
    }

    if (q.type === 'LINEAR_SCALE') {
      const counts = {}
      const min = q.scale_min ?? 1
      const max = q.scale_max ?? 5
      for (let i = min; i <= max; i++) counts[i] = 0

      allAnswers.forEach(a => {
        const num = Number(a)
        if (!isNaN(num)) counts[num] = (counts[num] || 0) + 1
      })

      const sum = allAnswers.reduce((s, a) => s + Number(a), 0)
      const avg = allAnswers.length > 0 ? (sum / allAnswers.length).toFixed(2) : '—'
      return { type: 'scale', counts, min, max, avg, minLabel: q.scale_min_label, maxLabel: q.scale_max_label, total: allAnswers.length }
    }

    if (['SHORT_ANSWER', 'PARAGRAPH'].includes(q.type)) {
      return { type: 'text', answers: allAnswers, total: allAnswers.length }
    }

    if (q.type === 'MCQ_GRID' || q.type === 'CHECKBOX_GRID') {
      return { type: 'grid', answers: allAnswers, rows: q.grid_rows || [], columns: q.grid_columns || [], total: allAnswers.length, isCheckbox: q.type === 'CHECKBOX_GRID' }
    }

    return { type: 'unknown', total: allAnswers.length }
  }

  function renderBarChart(agg, q) {
    const maxCount = Math.max(...Object.values(agg.counts), 1)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {Object.entries(agg.counts).map(([key, count]) => {
          const label = agg.options?.[key] || key
          const pct = agg.total > 0 ? ((count / agg.total) * 100).toFixed(1) : 0
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="text-sm" style={{ minWidth: 120, fontWeight: 500 }}>{label}</span>
              <div style={{ flex: 1, height: 24, background: 'var(--surface)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{
                  height: '100%', width: `${(count / maxCount) * 100}%`,
                  background: 'linear-gradient(90deg, rgba(79,142,247,0.7), rgba(79,142,247,0.4))',
                  borderRadius: 6, transition: 'width 0.3s ease',
                  display: 'flex', alignItems: 'center', paddingLeft: '0.5rem',
                }}>
                  {count > 0 && <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'white' }}>{count}</span>}
                </div>
              </div>
              <span className="text-xs text-muted" style={{ minWidth: 45, textAlign: 'right' }}>{pct}%</span>
            </div>
          )
        })}
        {agg.otherCount > 0 && (
          <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
            <div className="text-sm" style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Lainnya: {agg.otherCount} respons</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
              {agg.otherTexts.map((t, i) => <div key={i} className="text-xs text-muted">• {t}</div>)}
            </div>
          </div>
        )}
        <div className="text-xs text-muted">{agg.total} respons</div>
      </div>
    )
  }

  function renderScaleChart(agg) {
    const maxCount = Math.max(...Object.values(agg.counts), 1)
    return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)' }}>{agg.avg}</span>
          <span className="text-muted text-sm"> rata-rata</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', justifyContent: 'center', height: 80 }}>
          {Object.entries(agg.counts).map(([val, count]) => (
            <div key={val} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
              <span className="text-xs" style={{ fontWeight: 600 }}>{count}</span>
              <div style={{
                width: 32, height: `${Math.max((count / maxCount) * 60, 4)}px`,
                background: 'linear-gradient(180deg, var(--accent), rgba(79,142,247,0.4))',
                borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease',
              }} />
              <span className="text-xs text-muted">{val}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
          {agg.minLabel && <span className="text-xs text-muted">{agg.minLabel}</span>}
          {agg.maxLabel && <span className="text-xs text-muted">{agg.maxLabel}</span>}
        </div>
        <div className="text-xs text-muted" style={{ textAlign: 'center', marginTop: '0.5rem' }}>{agg.total} respons</div>
      </div>
    )
  }

  function renderTextList(agg) {
    return (
      <div>
        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {agg.answers.length === 0 ? (
            <div className="text-muted text-sm" style={{ textAlign: 'center', padding: '1rem' }}>Belum ada respons</div>
          ) : agg.answers.map((a, i) => (
            <div key={i} style={{
              padding: '0.5rem 0.75rem', background: 'var(--surface)',
              borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.85rem',
              whiteSpace: 'pre-wrap', lineHeight: 1.5
            }}>
              {a}
            </div>
          ))}
        </div>
        <div className="text-xs text-muted" style={{ marginTop: '0.5rem' }}>{agg.total} respons</div>
      </div>
    )
  }

  function renderGridSummary(agg) {
    const { rows, columns, answers, isCheckbox } = agg
    // Count selections per row per column
    const counts = {}
    rows.forEach((_, ri) => {
      counts[ri] = {}
      columns.forEach((_, ci) => { counts[ri][ci] = 0 })
    })

    answers.forEach(a => {
      if (!a || typeof a !== 'object') return
      Object.entries(a).forEach(([ri, val]) => {
        if (isCheckbox && Array.isArray(val)) {
          val.forEach(ci => {
            if (counts[ri] && counts[ri][ci] !== undefined) counts[ri][ci]++
          })
        } else if (!isCheckbox) {
          if (counts[ri] && counts[ri][val] !== undefined) counts[ri][val]++
        }
      })
    })

    return (
      <div className="grid-table-wrapper">
        <table className="grid-table" style={{ fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th></th>
              {columns.map((col, ci) => <th key={ci}>{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <td style={{ fontWeight: 600 }}>{row}</td>
                {columns.map((_, ci) => (
                  <td key={ci} style={{ textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-block', minWidth: 28, padding: '0.15rem 0.4rem',
                      borderRadius: 4, fontWeight: 600, fontSize: '0.8rem',
                      background: counts[ri]?.[ci] > 0 ? 'rgba(79,142,247,0.15)' : 'transparent',
                      color: counts[ri]?.[ci] > 0 ? 'var(--accent)' : 'var(--text-muted)',
                    }}>
                      {counts[ri]?.[ci] || 0}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-xs text-muted" style={{ marginTop: '0.5rem' }}>{agg.total} respons</div>
      </div>
    )
  }

  return (
    <>
      <div className="page-header no-print">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher/exams')}><ChevronLeft size={15} /></button>
            <div>
              <h2>Respons: {exam?.title}</h2>
              <p className="text-muted text-sm">
                {respondedCount} respons dari {totalTarget} target · {responsePct}% tingkat respons
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
              <Printer size={15} /> Cetak Laporan
            </button>
          </div>
        </div>
      </div>

      {/* Print header */}
      <div className="print-only" style={{ position: 'relative', textAlign: 'center', marginBottom: '2rem', borderBottom: '2px solid #000', paddingBottom: '1rem', paddingTop: '1rem' }}>
        <div style={{ position: 'absolute', top: '1rem', right: '0', textAlign: 'right', fontSize: '11pt', color: 'black' }}>
          Tanggal Cetak:<br />
          {new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
        <img src={`${import.meta.env.BASE_URL}binar-logo.png`} alt="BINAR Logo" style={{ height: 80, objectFit: 'contain', marginBottom: '0.5rem' }} />
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontFamily: 'Cambria, "Times New Roman", serif', color: 'black' }}>Laporan Respons Survei</h1>
        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'normal', color: 'black' }}>{exam?.title}</h2>
        <p style={{ margin: '0.25rem 0 0', fontSize: '10pt', color: '#555' }}>
          {respondedCount} respons · {missingUsers.length} belum mengisi · Tingkat respons: {responsePct}%
          {exam?.survey_valid_until && ` · Batas waktu: ${new Date(exam.survey_valid_until).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
        </p>
      </div>

      <div className="page-body">
        {/* Stats cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }} className="no-print">
          <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent)' }}>{respondedCount}</div>
            <div className="text-muted text-xs">Telah Mengisi</div>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--danger)' }}>{missingUsers.length}</div>
            <div className="text-muted text-xs">Belum Mengisi</div>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--success)' }}>{responsePct}%</div>
            <div className="text-muted text-xs">Tingkat Respons</div>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>{questionList.length}</div>
            <div className="text-muted text-xs">Pertanyaan</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="no-print" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button className={`btn ${activeTab === 'summary' ? 'btn-gold' : 'btn-ghost'} btn-sm`} onClick={() => setActiveTab('summary')}>
            <BarChart2 size={14} /> Ringkasan
          </button>
          <button className={`btn ${activeTab === 'individual' ? 'btn-gold' : 'btn-ghost'} btn-sm`} onClick={() => setActiveTab('individual')}>
            <Eye size={14} /> Individu ({respondedCount})
          </button>
          <button className={`btn ${activeTab === 'missing' ? 'btn-gold' : 'btn-ghost'} btn-sm`} onClick={() => setActiveTab('missing')}>
            <UserX size={14} /> Belum Mengisi ({missingUsers.length})
          </button>
        </div>

        {/* Summary Tab */}
        {activeTab === 'summary' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {questionList.map((q, idx) => {
              const agg = getAggregation(q)
              return (
                <div key={q.id || idx} className="card">
                  <div style={{ marginBottom: '0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span className="text-muted text-sm">{q.number}.</span>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, flex: 1 }}>{q.question_text}</h3>
                    </div>
                    <span className="badge badge-draft" style={{ fontSize: '0.7rem' }}>{SURVEY_TYPE_LABELS[q.type] || q.type}</span>
                  </div>
                  {agg.type === 'bar' && renderBarChart(agg, q)}
                  {agg.type === 'scale' && renderScaleChart(agg)}
                  {agg.type === 'text' && renderTextList(agg)}
                  {agg.type === 'grid' && renderGridSummary(agg)}
                </div>
              )
            })}
          </div>
        )}

        {/* Individual Tab */}
        {activeTab === 'individual' && (
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nama</th>
                    <th>Kelas</th>
                    <th>Waktu Submit</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionList.map((s, i) => (
                    <tr key={s.id}>
                      <td className="text-muted">{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{s.users?.name || s.student_id}</td>
                      <td>{s.users?.kelas || '—'}</td>
                      <td className="text-muted text-sm">
                        {s.last_sync ? new Date(s.last_sync).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedUser(s)}>
                          <Eye size={13} /> Lihat
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Missing respondents Tab */}
        {activeTab === 'missing' && (
          <div className="card" style={{ padding: 0 }}>
            {missingUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <CheckCircle size={32} color="var(--success)" style={{ margin: '0 auto 0.75rem', display: 'block', opacity: 0.5 }} />
                <p className="text-muted">Semua target responden telah mengisi survei! 🎉</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>ID Pengguna</th>
                      <th>Nama</th>
                      <th>Kelas</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingUsers.map((u, i) => (
                      <tr key={u.id}>
                        <td className="text-muted">{i + 1}</td>
                        <td className="text-muted text-sm">{u.id}</td>
                        <td style={{ fontWeight: 600 }}>{u.name}</td>
                        <td>{u.kelas || '—'}</td>
                        <td>
                          <span className="badge badge-closed" style={{ fontSize: '0.72rem' }}>
                            <UserX size={11} style={{ marginRight: '0.2rem' }} /> Belum Mengisi
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Individual response modal */}
      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Respons: {selectedUser.users?.name || selectedUser.student_id}</h3>
                <span className="text-muted text-xs">
                  Kelas {selectedUser.users?.kelas || '—'} · {selectedUser.last_sync ? new Date(selectedUser.last_sync).toLocaleString('id-ID') : '—'}
                </span>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ padding: '0.3rem' }} onClick={() => setSelectedUser(null)}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {questionList.map((q, idx) => {
                const answer = selectedUser.answers?.[String(q.number)]
                return (
                  <div key={q.id || idx} style={{ background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{q.number}. {q.question_text}</span>
                      <span className="badge badge-draft" style={{ fontSize: '0.7rem', flexShrink: 0 }}>{SURVEY_TYPE_LABELS[q.type] || q.type}</span>
                    </div>
                    <div style={{ background: 'white', padding: '0.75rem', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.05)', fontSize: '0.9rem', color: 'black', whiteSpace: 'pre-wrap' }}>
                      {formatAnswer(answer, q)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function formatAnswer(answer, q) {
  if (answer === null || answer === undefined || answer === '') return <span style={{ fontStyle: 'italic', color: '#999' }}>Tidak dijawab</span>

  if (q.type === 'LINEAR_SCALE') return String(answer)

  if (q.type === 'MCQ' || q.type === 'DROPDOWN') {
    if (typeof answer === 'object' && answer?.selected) {
      if (answer.selected === '__other__') return `Lainnya: ${answer.otherText || '—'}`
      return q.options?.[answer.selected] || answer.selected
    }
    return q.options?.[answer] || answer
  }

  if (q.type === 'CHECKBOXES') {
    if (Array.isArray(answer)) return answer.map(k => q.options?.[k] || k).join(', ')
    return String(answer)
  }

  if (q.type === 'MCQ_GRID' || q.type === 'CHECKBOX_GRID') {
    if (typeof answer !== 'object') return String(answer)
    const rows = q.grid_rows || []
    const cols = q.grid_columns || []
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {Object.entries(answer).map(([ri, val]) => (
          <div key={ri}>
            <strong>{rows[ri] || `Baris ${Number(ri) + 1}`}: </strong>
            {Array.isArray(val) ? val.map(ci => cols[ci] || `Kolom ${ci + 1}`).join(', ') : (cols[val] || `Kolom ${Number(val) + 1}`)}
          </div>
        ))}
      </div>
    )
  }

  return String(answer)
}
