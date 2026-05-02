import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCurrentUser } from '../../lib/auth'
import { exams, questions, users } from '../../lib/db'
import { Plus, Trash2, ChevronLeft, Save, BookOpen, Zap, Clock, Info, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { MONITORING_LEVELS } from '../../lib/monitoringConfig'
import { MonitoringIcon } from '../../lib/monitoringUI'

const TYPES = ['MCQ', 'COMPLEX_MCQ', 'TRUE_FALSE', 'ESSAY']
const TYPE_LABELS = { MCQ: 'Pilihan Ganda (1 jawaban)', COMPLEX_MCQ: 'Multi-Jawab (beberapa benar)', TRUE_FALSE: 'Benar / Salah', ESSAY: 'Esai (penilaian manual)' }
const OPTION_KEYS = ['A', 'B', 'C', 'D']

function makeQuestion(n) {
  return { number: n, type: 'MCQ', question_text: '', image_url: '', options: { A: '', B: '', C: '', D: '' }, correct_answer: 'A', points: 1, variant: 'A', time_limit: null }
}

export default function CreateExam() {
  const { examId } = useParams()
  const isEdit = Boolean(examId)
  const navigate = useNavigate()
  const user = getCurrentUser()

  const [title, setTitle] = useState('')
  const [information, setInformation] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')
  const [duration, setDuration] = useState(60)
  const [targetKelas, setTargetKelas] = useState([])
  const [passingGrade, setPassingGrade] = useState(60)
  const [mode, setMode] = useState('exam')
  const [quizTimerType, setQuizTimerType] = useState('uniform')
  const [uniformTime, setUniformTime] = useState(30)
  const [questionOrder, setQuestionOrder] = useState('ORDER')
  const [questionItems, setQuestionItems] = useState([makeQuestion(1)])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [dbClasses, setDbClasses] = useState([])
  const [monitoringLevel, setMonitoringLevel] = useState(1)
  const [showMonitorInfo, setShowMonitorInfo] = useState(false)

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
        setInformation(exam.information || '')
        setPdfUrl(exam.pdf_url || '')
        setDuration(exam.duration_minutes)
        setPassingGrade(exam.passing_grade ?? 60)
        setTargetKelas(exam.target_kelas === 'all' || !exam.target_kelas ? [] : exam.target_kelas.split(','))
        setMode(exam.mode || 'exam')
        setQuizTimerType(exam.quiz_timer_type || 'uniform')
        setMonitoringLevel(exam.monitoring_level || 1)
        setQuestionOrder(exam.question_order || 'ORDER')
      }
      if (qs?.length) {
        setQuestionItems(qs.map(q => ({ ...q, question_text: q.question_text || '', image_url: q.image_url || '', options: q.options || { A: '', B: '', C: '', D: '' }, time_limit: q.time_limit || null })))
        // If uniform, populate the bulk time from the first question's time_limit
        if ((exam?.quiz_timer_type || 'uniform') === 'uniform' && qs[0]?.time_limit) {
          setUniformTime(qs[0].time_limit)
        }
      }
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
    if (!title.trim()) { setError('Judul harus diisi.'); return }
    // Validate quiz timers
    if (mode === 'quiz') {
      if (quizTimerType === 'uniform' && (!uniformTime || uniformTime < 1)) {
        setError('Waktu per soal (seragam) harus > 0 detik.'); return
      }
      if (quizTimerType === 'independent') {
        const missingTimers = questionItems.some(q => !q.time_limit || q.time_limit < 1)
        if (missingTimers) { setError('Setiap soal dalam mode Kuis (Timer Independen) harus memiliki waktu > 0 detik.'); return }
      }
    }
    
    // Validate that questions and answers are filled
    for (let i = 0; i < questionItems.length; i++) {
      const q = questionItems[i]
      if (questionOrder === 'SHUFFLE' || !pdfUrl) {
        if (!q.question_text || !q.question_text.trim()) {
          setError(`Soal no ${q.number} masih kosong, harap isi teks soal terlebih dahulu.`)
          return
        }
      }
      if (q.type === 'MCQ' && !q.correct_answer) {
        setError(`Kunci jawaban soal no ${q.number} belum dipilih.`)
        return
      }
      if (q.type === 'COMPLEX_MCQ' && (!Array.isArray(q.correct_answer) || q.correct_answer.length === 0)) {
        setError(`Kunci jawaban soal no ${q.number} (Multi-Jawab) belum dipilih.`)
        return
      }
      if (q.type === 'TRUE_FALSE' && (!q.correct_answer || Object.keys(q.correct_answer).length === 0)) {
        setError(`Kunci jawaban soal no ${q.number} (Benar/Salah) belum diisi semua.`)
        return
      }
    }

    setSaving(true); setError('')

    try {
      const targetStr = targetKelas.length === 0 ? 'all' : targetKelas.join(',')
      const examData = {
        title: title.trim(),
        information: information.trim() || null,
        pdf_url: pdfUrl.trim() || null,
        duration_minutes: Number(duration),
        passing_grade: Number(passingGrade) || 60,
        target_kelas: targetStr,
        created_by: user.id,
        status: publish ? 'published' : 'draft',
        mode,
        quiz_timer_type: mode === 'quiz' ? quizTimerType : 'uniform',
        monitoring_level: monitoringLevel,
        question_order: questionOrder,
      }

      let savedExamId = examId
      if (isEdit) {
        await exams.update(examId, examData)
        await questions.deleteByExam(examId)
      } else {
        const { data, error: createErr } = await exams.create(examData)
        if (createErr || !data) {
          throw new Error(createErr?.message || 'Gagal membuat ujian — periksa kolom database.')
        }
        savedExamId = data.id
      }

      // Save questions
      const qRows = questionItems.map(q => ({
        exam_id: savedExamId,
        number: q.number,
        type: q.type,
        question_text: q.question_text || '',
        image_url: q.image_url || null,
        options: q.type === 'ESSAY' ? null : q.options,
        correct_answer: q.type === 'ESSAY' ? null : q.correct_answer,
        points: Number(q.points) || 1,
        variant: q.variant || 'A',
        time_limit: mode === 'quiz'
          ? (quizTimerType === 'uniform' ? Number(uniformTime) || 30 : (Number(q.time_limit) || 30))
          : null,
      }))
      await questions.createMany(qRows)

      navigate('/teacher/exams')
    } catch (err) {
      setError('Gagal menyimpan: ' + err.message)
      setSaving(false)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" style={{ width: 32, height: 32 }} /></div>

  const isIndependent = mode === 'quiz' && quizTimerType === 'independent'

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher/exams')}><ChevronLeft size={15} /></button>
            <div>
              <h2>{isEdit ? 'Edit Ujian' : 'Buat Ujian Baru'}</h2>
              <p className="text-muted text-sm">{questionItems.length} soal · Mode: {mode === 'exam' ? 'Ujian' : 'Kuis'}</p>
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

        {/* Mode Selector */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h3>Mode</h3></div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className={`btn ${mode === 'exam' ? 'btn-gold' : 'btn-ghost'}`}
              onClick={() => setMode('exam')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.875rem' }}
            >
              <BookOpen size={18} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700 }}>Ujian</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.7, fontWeight: 400 }}>Timer global, PDF soal</div>
              </div>
            </button>
            <button
              className={`btn ${mode === 'quiz' ? 'btn-gold' : 'btn-ghost'}`}
              onClick={() => setMode('quiz')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.875rem' }}
            >
              <Zap size={18} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700 }}>Kuis</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.7, fontWeight: 400 }}>Timer per soal, maju satu arah</div>
              </div>
            </button>
          </div>

          {/* Quiz timer type */}
          {mode === 'quiz' && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <label className="form-label" style={{ marginBottom: '0.625rem', display: 'block' }}>
                <Clock size={14} style={{ marginRight: '0.375rem', verticalAlign: '-2px' }} />
                Pengaturan Waktu Per Soal
              </label>
              <div style={{ display: 'flex', gap: '0.625rem' }}>
                <label style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.75rem', borderRadius: 8,
                  border: `2px solid ${quizTimerType === 'uniform' ? 'var(--gold)' : 'var(--border)'}`,
                  background: quizTimerType === 'uniform' ? 'rgba(245,158,11,0.05)' : 'transparent',
                  cursor: 'pointer', fontSize: '0.85rem'
                }}>
                  <input type="radio" name="quizTimerType" checked={quizTimerType === 'uniform'} onChange={() => setQuizTimerType('uniform')} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Waktu Seragam</div>
                    <div className="text-muted text-xs">Semua soal punya waktu yang sama</div>
                  </div>
                </label>
                <label style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.75rem', borderRadius: 8,
                  border: `2px solid ${quizTimerType === 'independent' ? 'var(--gold)' : 'var(--border)'}`,
                  background: quizTimerType === 'independent' ? 'rgba(245,158,11,0.05)' : 'transparent',
                  cursor: 'pointer', fontSize: '0.85rem'
                }}>
                  <input type="radio" name="quizTimerType" checked={quizTimerType === 'independent'} onChange={() => setQuizTimerType('independent')} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Waktu Independen</div>
                    <div className="text-muted text-xs">Setiap soal punya waktu sendiri</div>
                  </div>
                </label>
              </div>
              {/* Uniform time input */}
              {quizTimerType === 'uniform' && (
                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Clock size={16} color="var(--gold)" />
                  <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap', fontSize: '0.85rem' }}>Waktu per soal:</label>
                  <input
                    type="number"
                    className="form-input"
                    style={{ width: 90, padding: '0.4rem 0.6rem' }}
                    value={uniformTime}
                    onChange={e => setUniformTime(Number(e.target.value) || '')}
                    min="5"
                    placeholder="30"
                  />
                  <span className="text-sm text-muted">detik</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Monitoring Level Selector */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MonitoringIcon level={monitoringLevel} size={22} /> Tingkat Pengawasan
            </h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowMonitorInfo(!showMonitorInfo)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}
            >
              <Info size={14} />
              {showMonitorInfo ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {/* Level cards grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.625rem' }}>
            {Object.values(MONITORING_LEVELS).map(lvl => (
              <button
                key={lvl.id}
                type="button"
                onClick={() => setMonitoringLevel(lvl.id)}
                className="monitoring-level-card"
                style={{
                  padding: '0.875rem 0.75rem',
                  borderRadius: 10,
                  border: `2px solid ${monitoringLevel === lvl.id ? lvl.color : 'var(--border)'}`,
                  background: monitoringLevel === lvl.id ? lvl.colorBg : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: monitoringLevel === lvl.id ? `${lvl.color}20` : 'var(--navy-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}>
                  <MonitoringIcon level={lvl.id} size={24} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: monitoringLevel === lvl.id ? lvl.color : 'var(--text-primary)' }}>
                    Lv.{lvl.id}
                  </div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: monitoringLevel === lvl.id ? lvl.color : 'var(--text-secondary)' }}>
                    {lvl.name}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.68rem', marginTop: '0.15rem', lineHeight: 1.3 }}>
                    {lvl.tagline}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Selected level description */}
          <div style={{
            marginTop: '0.875rem',
            padding: '0.875rem 1rem',
            borderRadius: 8,
            background: MONITORING_LEVELS[monitoringLevel].colorBg,
            border: `1px solid ${MONITORING_LEVELS[monitoringLevel].colorBorder}`,
            fontSize: '0.83rem',
            color: 'var(--text-primary)',
            lineHeight: 1.5,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
              <MonitoringIcon level={monitoringLevel} size={18} />
              <strong style={{ color: MONITORING_LEVELS[monitoringLevel].color }}>
                {MONITORING_LEVELS[monitoringLevel].name}
                {monitoringLevel === 4 && <span style={{ fontSize: '0.72rem', fontWeight: 400, marginLeft: '0.35rem', opacity: 0.8 }}>({MONITORING_LEVELS[4].fullName})</span>}
              </strong>
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              {MONITORING_LEVELS[monitoringLevel].description}
            </p>
          </div>

          {/* Expandable teacher info */}
          {showMonitorInfo && (
            <div style={{
              marginTop: '0.75rem',
              padding: '1rem',
              borderRadius: 8,
              background: 'rgba(79,142,247,0.06)',
              border: '1px solid rgba(79,142,247,0.15)',
              fontSize: '0.82rem',
              lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent)' }}>
                <Info size={15} /> Panduan Tingkat Pengawasan
              </div>
              {Object.values(MONITORING_LEVELS).map(lvl => (
                <div key={lvl.id} style={{ marginBottom: '0.625rem', paddingBottom: '0.625rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <MonitoringIcon level={lvl.id} size={16} />
                    <span style={{ color: lvl.color }}>Level {lvl.id} — {lvl.name}</span>
                  </div>
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    {lvl.teacherInfo}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Basic info */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h3>Informasi {mode === 'exam' ? 'Ujian' : 'Kuis'}</h3></div>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Judul {mode === 'exam' ? 'Ujian' : 'Kuis'}</label>
              <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder={mode === 'exam' ? 'cth: Ujian Tengah Semester Matematika' : 'cth: Kuis Harian Bab 3'} />
            </div>
            <div className="form-group">
              <label className="form-label">Informasi Khusus <span className="text-muted text-xs" style={{ fontWeight: 400 }}>(opsional)</span></label>
              <textarea 
                className="form-input" 
                value={information} 
                onChange={e => setInformation(e.target.value)} 
                placeholder="cth: Jika ketahuan mencontek, nilai langsung 0"
                style={{ minHeight: '60px', resize: 'vertical' }}
              />
              <span className="text-xs text-muted">Informasi ini akan ditampilkan di halaman lobi sebelum siswa memulai ujian.</span>
            </div>
            <div className="form-group">
              <label className="form-label">Link PDF Google Drive <span className="text-muted text-xs" style={{ fontWeight: 400 }}>(opsional)</span></label>
              <input 
                className="form-input" 
                value={pdfUrl} 
                onChange={e => {
                  setPdfUrl(e.target.value)
                  if (e.target.value) setQuestionOrder('ORDER')
                }} 
                placeholder="https://drive.google.com/file/d/..." 
                disabled={questionOrder === 'SHUFFLE'}
              />
              {questionOrder === 'SHUFFLE' ? (
                <span className="text-xs" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                  <AlertTriangle size={14} /> PDF tidak dapat digunakan jika fitur Acak Soal (SHUFFLE) diaktifkan.
                </span>
              ) : (
                <span className="text-xs text-muted">Kosongkan jika soal ditulis manual di bawah. Pastikan file dapat diakses publik.</span>
              )}
            </div>
            
            <div className="form-group">
              <label className="form-label">Urutan Soal</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input 
                    type="radio" 
                    checked={questionOrder === 'ORDER'} 
                    onChange={() => setQuestionOrder('ORDER')} 
                  />
                  Berurutan (Normal)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: pdfUrl ? 'not-allowed' : 'pointer', fontSize: '0.9rem', opacity: pdfUrl ? 0.5 : 1 }}>
                  <input 
                    type="radio" 
                    checked={questionOrder === 'SHUFFLE'} 
                    onChange={() => {
                      if (!pdfUrl) setQuestionOrder('SHUFFLE')
                    }} 
                    disabled={!!pdfUrl}
                  />
                  Acak (Shuffle)
                </label>
              </div>
              {pdfUrl && <span className="text-xs text-muted" style={{ display: 'block', marginTop: '0.25rem' }}>Fitur Acak Soal dinonaktifkan karena Anda menggunakan file PDF.</span>}
            </div>

            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* Show global duration only for exam mode */}
              {mode === 'exam' && (
                <div className="form-group">
                  <label className="form-label">Durasi (menit)</label>
                  <input type="number" className="form-input" value={duration} onChange={e => setDuration(e.target.value)} min="1" max="300" />
                </div>
              )}
              {mode === 'quiz' && (
                <div className="form-group">
                  <label className="form-label">Durasi</label>
                  <div className="alert alert-info text-sm" style={{ margin: 0, padding: '0.5rem 0.75rem' }}>
                    <Clock size={14} style={{ marginRight: '0.25rem', verticalAlign: '-2px' }} />
                    {quizTimerType === 'uniform' ? `${uniformTime} detik / soal (seragam)` : 'Diatur independen per soal'}
                  </div>
                </div>
              )}
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
                  {/* Per-question timer for quiz independent mode */}
                  {isIndependent && (
                    <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.375rem' }}>
                      <Clock size={14} color="var(--gold)" />
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: 64, padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                        value={q.time_limit || ''}
                        onChange={e => updateQuestion(idx, 'time_limit', e.target.value ? Number(e.target.value) : null)}
                        min="5"
                        placeholder="dtk"
                        title="Waktu per soal (detik)"
                      />
                      <span className="text-xs text-muted">dtk</span>
                    </div>
                  )}
                  {questionItems.length > 1 && (
                    <button className="btn btn-danger btn-sm" onClick={() => removeQuestion(idx)}><Trash2 size={13} /></button>
                  )}
                </div>
              </div>

              {/* Question text - manual question body */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Teks Soal</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: 60, resize: 'vertical', fontSize: '0.85rem' }}
                  value={q.question_text || ''}
                  onChange={e => updateQuestion(idx, 'question_text', e.target.value)}
                  placeholder="Tulis soal di sini (opsional jika menggunakan PDF)..."
                />
              </div>

              {/* Question Image Attachment */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Lampiran Gambar <span className="text-muted text-xs" style={{ fontWeight: 400 }}>(opsional)</span></label>
                <input
                  className="form-input"
                  style={{ fontSize: '0.85rem' }}
                  value={q.image_url || ''}
                  onChange={e => updateQuestion(idx, 'image_url', e.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  disabled={!!pdfUrl}
                />
                {!!pdfUrl ? (
                  <span className="text-xs" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
                    <AlertTriangle size={14} /> Fitur lampiran gambar tidak dapat digunakan jika Anda menggunakan PDF.
                  </span>
                ) : (
                  <span className="text-xs text-muted">Untuk hasil terbaik gunakan webP format, bisa juga menggunakan JPG, PNG atau SVG format. Pastikan link Google Drive dapat diakses publik.</span>
                )}
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
