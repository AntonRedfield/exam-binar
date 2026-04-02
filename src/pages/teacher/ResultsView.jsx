import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { exams, results } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { ChevronLeft, Printer, Edit3, Save, Eye, X, BarChart2 } from 'lucide-react'

export default function ResultsView() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState(null)
  const [resultList, setResultList] = useState([])
  const [essayEdits, setEssayEdits] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [selectedResult, setSelectedResult] = useState(null)
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })

  async function load() {
    const [{ data: examData }, { data: res }] = await Promise.all([
      exams.getById(examId),
      results.listByExam(examId),
    ])
    setExam(examData)
    setResultList(res || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [examId])

  const passingGrade = exam?.passing_grade ?? 60

  async function saveEssay(resultId, essayScore) {
    setSaving(resultId)
    const { data } = await results.updateEssayScore(resultId, Number(essayScore))
    if (data) {
      setResultList(prev => prev.map(r => r.id === resultId
        ? { ...r, essay_score: data.essay_score }
        : r
      ))
    }
    setSaving(null)
  }

  function handleSort(key) {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
  }

  const sortedResults = [...resultList].sort((a, b) => {
    const key = sortConfig.key
    let aVal, bVal

    if (key === 'nilai') {
      const aTotal = a.auto_score + (a.essay_score || 0)
      const bTotal = b.auto_score + (b.essay_score || 0)
      aVal = a.max_auto_score > 0 ? (aTotal / a.max_auto_score) * 100 : 0
      bVal = b.max_auto_score > 0 ? (bTotal / b.max_auto_score) * 100 : 0
    } else if (key === 'pelanggaran') {
      aVal = a.violation_count || 0
      bVal = b.violation_count || 0
    } else {
      aVal = String(a.users?.[key] || '').toLowerCase()
      bVal = String(b.users?.[key] || '').toLowerCase()
    }

    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
    return 0
  })

  if (loading) return <div className="loading-screen"><div className="spinner" style={{ width: 32, height: 32 }} /></div>

  const avgPct = resultList.length
    ? (resultList.reduce((sum, r) => {
        const total = r.auto_score + (r.essay_score || 0)
        const pct = r.max_auto_score > 0 ? (total / r.max_auto_score) * 100 : 0
        return sum + pct
      }, 0) / resultList.length)
    : 0
  const avgStr = avgPct ? avgPct.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : '0'

  // Count students passing/failing
  const passCount = resultList.filter(r => {
    const total = r.auto_score + (r.essay_score || 0)
    const pct = r.max_auto_score > 0 ? (total / r.max_auto_score) * 100 : 0
    return pct >= passingGrade
  }).length
  const failCount = resultList.length - passCount

  return (
    <>
      <div className="page-header no-print">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher/exams')}><ChevronLeft size={15} /></button>
            <div>
              <h2>Hasil: {exam?.title}</h2>
              <p className="text-muted text-sm">
                {resultList.length} siswa · Rata-rata: {avgStr}% · KKM: {passingGrade}
                {' · '}
                <span style={{ color: 'var(--success)' }}>✓ {passCount} Lulus</span>
                {' · '}
                <span style={{ color: 'var(--danger)' }}>✗ {failCount} Belum Lulus</span>
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/teacher/analytics/${examId}`)}>
              <BarChart2 size={15} /> Analisis Soal
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => window.print()}><Printer size={15} /> Cetak</button>
          </div>
        </div>
      </div>
      <div className="print-only" style={{ position: 'relative', textAlign: 'center', marginBottom: '2rem', borderBottom: '2px solid #000', paddingBottom: '1rem', paddingTop: '1rem' }}>
        <div style={{ position: 'absolute', top: '1rem', right: '0', textAlign: 'right', fontSize: '11pt', color: 'black' }}>
          Tanggal Ujian:<br />
          {exam?.created_at ? new Date(exam.created_at).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
        </div>
        <img src={`${import.meta.env.BASE_URL}binar-logo.png`} alt="BINAR Logo" style={{ height: 80, objectFit: 'contain', marginBottom: '0.5rem' }} />
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontFamily: 'Cambria, "Times New Roman", serif', color: 'black' }}>BINAR Exam Result</h1>
        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'normal', color: 'black' }}>Mata Pelajaran: {exam?.title} — KKM: {passingGrade}</h2>
      </div>
      <div className="page-body">
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="no-print">#</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                    Nama Siswa {sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('kelas')}>
                    Kelas {sortConfig.key === 'kelas' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="no-print">Skor Otomatis</th>
                  <th className="no-print">Skor Esai</th>
                  <th className="no-print">Total</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('nilai')}>
                    Nilai {sortConfig.key === 'nilai' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('pelanggaran')}>
                    Pelanggaran {sortConfig.key === 'pelanggaran' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="no-print">Simpan Esai</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((r, i) => {
                  const total = r.auto_score + (r.essay_score || 0)
                  const pctNum = r.max_auto_score > 0 ? (total / r.max_auto_score) * 100 : 0
                  const pctStr = pctNum.toLocaleString('id-ID', { maximumFractionDigits: 2 })
                  const essayVal = essayEdits[r.id] !== undefined ? essayEdits[r.id] : (r.essay_score || 0)
                  const nilaiColor = pctNum >= passingGrade ? 'var(--success)' : 'var(--danger)'
                  return (
                    <tr key={r.id}>
                      <td className="text-muted no-print">{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{r.users?.name}</td>
                      <td>{r.users?.kelas}</td>
                      <td className="no-print">{r.auto_score}</td>
                      <td className="no-print">
                        <div className="no-print">
                          <input
                            type="number"
                            className="form-input"
                            style={{ width: 70, padding: '0.3rem 0.5rem', fontSize: '0.85rem' }}
                            value={essayVal}
                            min="0"
                            onChange={e => setEssayEdits(prev => ({ ...prev, [r.id]: e.target.value }))}
                          />
                        </div>
                        <span className="print-only">{r.essay_score || 0}</span>
                      </td>
                      <td className="no-print" style={{ fontWeight: 700, color: nilaiColor }}>
                        {r.auto_score + Number(essayVal)}
                      </td>
                      <td style={{ fontWeight: 700, color: nilaiColor }}>{pctStr}%</td>
                      <td>
                        {r.violation_count > 0
                          ? <span style={{ color: 'var(--warning)' }}>⚠ {r.violation_count}</span>
                          : <span className="text-muted">—</span>}
                      </td>
                      <td className="no-print">
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedResult(r)} title="Lihat Esai">
                            <Eye size={13} />
                          </button>
                          <button className="btn btn-primary btn-sm" onClick={() => saveEssay(r.id, essayVal)} disabled={saving === r.id}>
                            {saving === r.id ? '...' : <><Save size={13} /> Simpan</>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      {selectedResult && (
        <div className="modal-overlay" onClick={() => setSelectedResult(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>Jawaban {selectedResult.users?.name}</h3>
              <button className="btn btn-ghost btn-sm" style={{ padding: '0.3rem' }} onClick={() => setSelectedResult(null)}><X size={18} /></button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(() => {
                const breakdown = (() => { try { return JSON.parse(selectedResult.breakdown || '[]') } catch { return [] } })()
                const essays = breakdown.filter(b => b.type === 'ESSAY')
                
                if (essays.length === 0) return <p className="text-muted text-center" style={{ padding: '2rem 0' }}>Tidak ada soal esai untuk ujian ini.</p>
                
                return essays.map(essay => (
                  <div key={essay.number} style={{ background: 'var(--navy-light)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Soal No. {essay.number}</span>
                      <span className={`badge badge-${essay.status === 'pending' ? 'draft' : 'active'}`}>
                        {essay.status === 'pending' ? 'Menunggu Penilaian' : 'Telah Dinilai'}
                      </span>
                    </div>
                    <div>
                      <div className="text-muted text-sm" style={{ marginBottom: '0.25rem' }}>Jawaban Siswa:</div>
                      <div style={{ background: 'white', padding: '0.75rem', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.05)', fontSize: '0.95rem', color: 'black', whiteSpace: 'pre-wrap' }}>
                        {essay.given || <span className="text-muted" style={{ fontStyle: 'italic' }}>Tidak dijawab</span>}
                      </div>
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
