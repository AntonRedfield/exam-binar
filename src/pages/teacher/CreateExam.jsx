import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCurrentUser } from '../../lib/auth'
import { exams, questions, users } from '../../lib/db'
import { Plus, Trash2, ChevronLeft, Save } from 'lucide-react'

const TYPES = ['MCQ', 'COMPLEX_MCQ', 'TRUE_FALSE', 'ESSAY']
const TYPE_LABELS = { MCQ: 'Pilihan Ganda (1 jawaban)', COMPLEX_MCQ: 'Multi-Jawab (beberapa benar)', TRUE_FALSE: 'Benar / Salah', ESSAY: 'Esai (penilaian manual)' }
const OPTION_KEYS = ['A', 'B', 'C', 'D']

function makeQuestion(n) {
  return { number: n, type: 'MCQ', options: { A: '', B: '', C: '', D: '' }, correct_answer: 'A', points: 1, variant: 'A' }
}

export default function CreateExam() {
  const { examId } = useParams()
  const isEdit = Boolean(examId)
  const navigate = useNavigate()
  const user = getCurrentUser()

  const [title, setTitle] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')
  const [duration, setDuration] = useState(60)
  const [targetKelas, setTargetKelas] = useState([])
  const [passingGrade, setPassingGrade] = useState(60)
  const [questionItems, setQuestionItems] = useState([makeQuestion(1)])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [dbClasses, setDbClasses] = useState([])

  useEffect(() => {
    async function load() {
      // First, fetch the distinct classes existing in the DB so we can show them
      const { data: classList } = await users.getDistinctKelas()
      if (classList) setDbClasses(classList)

      if (!isEdit) {
        setLoading(false)
        return
      }
      
      const { data: exam } = await exams.getById(examId)
      const { data: qs } = await questions.listByExam(examId)
      if (exam) {
        setTitle(exam.title)
        setPdfUrl(exam.pdf_url)
        setDuration(exam.duration_minutes)
        setPassingGrade(exam.passing_grade ?? 60)
        setTargetKelas(exam.target_kelas === 'all' || !exam.target_kelas ? [] : exam.target_kelas.split(','))
      }
      if (qs?.length) setQuestionItems(qs.map(q => ({ ...q, options: q.options || { A: '', B: '', C: '', D: '' } })))
      setLoading(false)
    }
    load()
  }, [examId, isEdit])

  function addQuestion() {
    setQuestionItems(prev => [...prev, makeQuestion(prev.length + 1)])
  }

  function removeQuestion(idx) {
    setQuestionItems(prev => prev.filter((_, i) => i !== idx).map((q, i) => ({ ...q, number: i + 1 })))
  }

  function updateQuestion(idx, field, value) {
    setQuestionItems(prev => prev.map((q, i) => i === idx ? { ...q, [field]: value } : q))
  }

  function updateOption(idx, key, value) {
    setQuestionItems(prev => prev.map((q, i) => i === idx ? { ...q, options: { ...q.options, [key]: value } } : q))
  }

  async function handleSave(publish = false) {
    if (!title.trim()) { setError('Judul ujian harus diisi.'); return }
    if (!pdfUrl.trim()) { setError('Link PDF Google Drive harus diisi.'); return }
    setSaving(true); setError('')

    try {
      const targetStr = targetKelas.length === 0 ? 'all' : targetKelas.join(',')
      const examData = { title: title.trim(), pdf_url: pdfUrl.trim(), duration_minutes: Number(duration), passing_grade: Number(passingGrade) || 60, target_kelas: targetStr, created_by: user.id, status: publish ? 'published' : 'draft' }

      let savedExamId = examId
      if (isEdit) {
        await exams.update(examId, examData)
        await questions.deleteByExam(examId)
      } else {
        const { data } = await exams.create(examData)
        savedExamId = data.id
      }

      // Save questions
      const qRows = questionItems.map(q => ({
        exam_id: savedExamId,
        number: q.number,
        type: q.type,
        options: q.type === 'ESSAY' ? null : q.options,
        correct_answer: q.type === 'ESSAY' ? null : q.correct_answer,
        points: Number(q.points) || 1,
        variant: q.variant || 'A',
      }))
      await questions.createMany(qRows)

      navigate('/teacher/exams')
    } catch (err) {
      setError('Gagal menyimpan: ' + err.message)
      setSaving(false)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" style={{ width: 32, height: 32 }} /></div>

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher/exams')}><ChevronLeft size={15} /></button>
            <div>
              <h2>{isEdit ? 'Edit Ujian' : 'Buat Ujian Baru'}</h2>
              <p className="text-muted text-sm">{questionItems.length} soal</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-ghost" onClick={() => handleSave(false)} disabled={saving}>
              <Save size={15} /> Simpan Draft
            </button>
            <button className="btn btn-gold" onClick={() => handleSave(true)} disabled={saving}>
              {saving ? 'Menyimpan...' : '🚀 Publikasikan'}
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        {/* Basic info */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h3>Informasi Ujian</h3></div>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Judul Ujian</label>
              <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="cth: Ujian Tengah Semester Matematika" />
            </div>
            <div className="form-group">
              <label className="form-label">Link PDF Google Drive</label>
              <input className="form-input" value={pdfUrl} onChange={e => setPdfUrl(e.target.value)} placeholder="https://drive.google.com/file/d/..." />
              <span className="text-xs text-muted">Pastikan file dapat diakses publik (Anyone with the link → Viewer)</span>
            </div>
            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Durasi (menit)</label>
                <input type="number" className="form-input" value={duration} onChange={e => setDuration(e.target.value)} min="1" max="300" />
              </div>
              <div className="form-group">
                <label className="form-label">KKM (Kriteria Ketuntasan Minimal)</label>
                <input type="number" className="form-input" value={passingGrade} onChange={e => setPassingGrade(e.target.value)} min="0" max="100" placeholder="60" />
                <span className="text-xs text-muted">Nilai minimum kelulusan (skala 0—100)</span>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Target Kelas</span>
                  <span className="text-xs text-muted" style={{ textTransform: 'none', fontWeight: 500 }}>
                    {targetKelas.length === 0 ? '(Semua Kelas)' : `${targetKelas.length} kelas dipilih`}
                  </span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button 
                    className={`badge ${targetKelas.length === 0 ? 'badge-active' : 'badge-draft'}`} 
                    onClick={() => setTargetKelas([])}
                    style={{ cursor: 'pointer', padding: '0.4rem 0.8rem' }}
                  >
                    Semua Kelas
                  </button>
                  {dbClasses.length > 0 ? dbClasses.map(k => (
                    <button 
                      key={k}
                      className={`badge ${targetKelas.includes(k) ? 'badge-active' : 'badge-draft'}`} 
                      onClick={() => {
                        setTargetKelas(prev => prev.includes(k) ? prev.filter(c => c !== k) : [...prev, k])
                      }}
                      style={{ cursor: 'pointer', padding: '0.4rem 0.8rem' }}
                    >
                      Kelas {k}
                    </button>
                  )) : (
                    <span className="text-muted text-sm" style={{ alignSelf: 'center' }}>Tidak ada data kelas di sistem</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Questions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {questionItems.map((q, idx) => (
            <div key={idx} className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.95rem' }}>Soal #{q.number}</h3>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select className="form-input" style={{ width: 'auto', fontSize: '0.82rem', padding: '0.35rem 0.75rem' }} value={q.type} onChange={e => updateQuestion(idx, 'type', e.target.value)}>
                    {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                  <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.375rem' }}>
                    <label className="form-label" style={{ whiteSpace: 'nowrap', textTransform: 'none', fontSize: '0.8rem' }}>Poin:</label>
                    <input type="number" className="form-input" style={{ width: 56, padding: '0.35rem 0.5rem', fontSize: '0.85rem' }} value={q.points} onChange={e => updateQuestion(idx, 'points', e.target.value)} min="1" />
                  </div>
                  {questionItems.length > 1 && (
                    <button className="btn btn-danger btn-sm" onClick={() => removeQuestion(idx)}><Trash2 size={13} /></button>
                  )}
                </div>
              </div>

              {/* MCQ / COMPLEX_MCQ options */}
              {(q.type === 'MCQ' || q.type === 'COMPLEX_MCQ') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {OPTION_KEYS.map(key => (
                    <div key={key} style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
                      <span style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>{key}</span>
                      <input className="form-input" style={{ flex: 1 }} placeholder={`Opsi ${key}`} value={q.options?.[key] || ''} onChange={e => updateOption(idx, key, e.target.value)} />
                      {q.type === 'MCQ' ? (
                        <input type="radio" checked={q.correct_answer === key} onChange={() => updateQuestion(idx, 'correct_answer', key)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                      ) : (
                        <input type="checkbox" checked={Array.isArray(q.correct_answer) && q.correct_answer.includes(key)} onChange={e => {
                          const prev = Array.isArray(q.correct_answer) ? q.correct_answer : []
                          const next = e.target.checked ? [...prev, key] : prev.filter(k => k !== key)
                          updateQuestion(idx, 'correct_answer', next)
                        }} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                      )}
                    </div>
                  ))}
                  <div className="text-xs text-muted" style={{ marginTop: '0.25rem' }}>
                    {q.type === 'MCQ' ? '○ Pilih satu jawaban benar' : '☑ Centang semua jawaban yang benar'}
                  </div>
                </div>
              )}

              {/* True/False */}
              {q.type === 'TRUE_FALSE' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {Object.keys(q.options || {}).map((key, i) => (
                    <div key={key} style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
                      <span style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                      <input className="form-input" style={{ flex: 1 }} placeholder={`Pernyataan ${i + 1}`} value={q.options[key]} onChange={e => updateOption(idx, key, e.target.value)} />
                      
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--surface)', padding: '0.25rem 0.5rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                          <input type="radio" name={`tf_${idx}_${key}`} checked={q.correct_answer?.[key] === 'true'} onChange={() => {
                            const newAnswer = { ...(q.correct_answer || {}), [key]: 'true' }
                            updateQuestion(idx, 'correct_answer', newAnswer)
                          }} /> Benar
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                          <input type="radio" name={`tf_${idx}_${key}`} checked={q.correct_answer?.[key] === 'false'} onChange={() => {
                            const newAnswer = { ...(q.correct_answer || {}), [key]: 'false' }
                            updateQuestion(idx, 'correct_answer', newAnswer)
                          }} /> Salah
                        </label>
                      </div>

                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '0.25rem' }} onClick={() => {
                        const newOptions = { ...q.options }
                        delete newOptions[key]
                        updateQuestion(idx, 'options', newOptions)
                        
                        const newAnswer = { ...q.correct_answer }
                        delete newAnswer[key]
                        updateQuestion(idx, 'correct_answer', newAnswer)
                      }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', marginTop: '0.25rem' }} onClick={() => {
                    const newKey = `stmt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
                    updateOption(idx, newKey, '')
                    
                    const newAnswer = { ...(q.correct_answer || {}), [newKey]: 'true' }
                    updateQuestion(idx, 'correct_answer', newAnswer)
                  }}>
                    <Plus size={14} style={{ marginRight: '0.25rem' }} /> Tambah Pernyataan
                  </button>
                </div>
              )}

              {q.type === 'ESSAY' && (
                <div className="alert alert-info text-sm">Soal esai tidak memiliki kunci jawaban otomatis. Guru menilai secara manual.</div>
              )}
            </div>
          ))}

          <button className="btn btn-ghost" onClick={addQuestion} style={{ borderStyle: 'dashed', borderWidth: 2 }}>
            <Plus size={16} /> Tambah Soal
          </button>
        </div>
      </div>
    </>
  )
}
