import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCurrentUser } from '../lib/auth'
import { results, exams } from '../lib/db'
import { CheckCircle, XCircle, Clock, ShieldAlert, Printer, ArrowLeft } from 'lucide-react'

export default function Results() {
  const { resultId } = useParams()
  const navigate = useNavigate()
  const user = getCurrentUser()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    results.getById(resultId).then(({ data }) => {
      setResult(data)
      setLoading(false)
    })
  }, [resultId])

  if (loading) return <div className="loading-screen"><div className="spinner" style={{ width: 40, height: 40 }} /></div>
  if (!result) return <div className="loading-screen"><p className="text-muted">Hasil tidak ditemukan.</p></div>

  const breakdown = (() => { try { return JSON.parse(result.breakdown || '[]') } catch { return [] } })()
  const totalScore = (result.auto_score || 0) + (result.essay_score || 0)
  const maxScore = result.max_auto_score || 0
  const pctNum = maxScore > 0 ? (totalScore / maxScore) * 100 : 0
  const pctStr = pctNum.toLocaleString('id-ID', { maximumFractionDigits: 2 })
  const essayPending = breakdown.some(b => b.status === 'pending')
  const passingGrade = result.exams?.passing_grade ?? 60

  return (
    <div style={{ minHeight: '100vh', background: 'var(--navy)', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }} className="no-print">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/home')}>
            <ArrowLeft size={15} /> Kembali
          </button>
          {result.exams?.status !== 'published' && (
            <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
              <Printer size={15} /> Cetak Hasil
            </button>
          )}
        </div>

        {/* Score card */}
        <div className="card results-score" style={{ textAlign: 'center', marginBottom: '1.5rem', background: 'linear-gradient(135deg, var(--navy-mid), var(--navy-light))' }}>
          <p className="text-muted text-sm" style={{ marginBottom: '0.25rem' }}>{result.exams?.title}</p>
          <h1 style={{ fontSize: '3.5rem', fontFamily: 'Outfit, sans-serif', marginBottom: '0.25rem', color: pctNum >= passingGrade ? 'var(--success)' : 'var(--danger)' }}>
            {pctStr}%
          </h1>
          <div className="progress-bar" style={{ maxWidth: 240, margin: '0 auto 1rem' }}>
            <div className="progress-fill" style={{ width: `${pctNum}%`, background: pctNum >= passingGrade ? 'linear-gradient(90deg, var(--success), #34D399)' : 'linear-gradient(90deg, var(--danger), #F87171)' }} />
          </div>
          <div className="results-stats" style={{ display: 'flex', justifyContent: 'center', gap: '2rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span>Nilai: <strong style={{ color: 'var(--text-primary)' }}>{pctStr}%</strong></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldAlert size={14} color={result.violation_count > 0 ? 'var(--warning)' : 'var(--success)'} />
              {result.violation_count} Pelanggaran
            </span>
            {essayPending && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--warning)' }}>
                <Clock size={14} /> Esai Menunggu Penilaian
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
            Siswa: <strong>{result.users?.name}</strong> &mdash; Kelas {result.users?.kelas}
          </p>
        </div>

        {/* Breakdown table */}
        {result.exams?.status !== 'published' && (
          <div className="card">
            <div className="card-header">
              <h3>Rincian Jawaban per Soal</h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Tipe</th>
                    <th>Jawaban Anda</th>
                    <th>Kunci Jawaban</th>
                    <th>Status</th>
                    <th>Skor</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map(b => (
                    <tr key={b.number}>
                      <td>{b.number}</td>
                      <td><span className="question-type-badge">{typeLabel(b.type)}</span></td>
                      <td style={{ fontFamily: 'monospace' }}>{formatAnswer(b.given)}</td>
                      <td style={{ fontFamily: 'monospace' }}>{b.status === 'pending' ? '—' : formatAnswer(b.correct)}</td>
                      <td>
                        {b.status === 'correct' && <span className="badge badge-active">✓ Benar</span>}
                        {b.status === 'wrong' && <span className="badge badge-closed">✗ Salah</span>}
                        {b.status === 'partial' && <span className="badge badge-pending">~ Parsial</span>}
                        {b.status === 'pending' && <span className="badge badge-draft">⏳ Esai</span>}
                      </td>
                      <td style={{ fontWeight: 700 }}>{b.status === 'pending' ? '—' : `${b.earned}/${b.max}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function typeLabel(type) {
  return { MCQ: 'PG', COMPLEX_MCQ: 'Multi', TRUE_FALSE: 'B/S', ESSAY: 'Esai' }[type] || type
}

function formatAnswer(val) {
  if (val === undefined || val === null) return '—'
  if (Array.isArray(val)) return val.join(', ')
  if (typeof val === 'object') {
    return Object.entries(val).map(([k, v]) => `${k}:${v}`).join(', ')
  }
  return String(val)
}
