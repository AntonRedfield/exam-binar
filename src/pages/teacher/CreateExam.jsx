import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCurrentUser } from '../../lib/auth'
import { exams, questions, users } from '../../lib/db'
import { Plus, Trash2, ChevronLeft, Save, BookOpen, Zap, Clock, Info, ChevronDown, ChevronUp, AlertTriangle, ClipboardList, Calendar, Bell, Edit3, Repeat } from 'lucide-react'
import { MONITORING_LEVELS } from '../../lib/monitoringConfig'
import { MonitoringIcon } from '../../lib/monitoringUI'

const EXAM_TYPES = ['MCQ', 'COMPLEX_MCQ', 'TRUE_FALSE', 'ESSAY']
const SURVEY_TYPES = ['SHORT_ANSWER', 'PARAGRAPH', 'LINEAR_SCALE', 'MCQ_GRID', 'CHECKBOX_GRID', 'MCQ', 'CHECKBOXES', 'DROPDOWN']

const TYPE_LABELS = {
  MCQ: 'Pilihan Ganda (1 jawaban)',
  COMPLEX_MCQ: 'Multi-Jawab (beberapa benar)',
  TRUE_FALSE: 'Benar / Salah',
  ESSAY: 'Esai (penilaian manual)',
  SHORT_ANSWER: 'Jawaban Singkat',
  PARAGRAPH: 'Paragraf',
  LINEAR_SCALE: 'Skala Linear',
  MCQ_GRID: 'Kisi Pilihan Ganda',
  CHECKBOX_GRID: 'Kisi Kotak Centang',
  CHECKBOXES: 'Kotak Centang (multi-pilih)',
  DROPDOWN: 'Dropdown',
}

const OPTION_KEYS = ['A', 'B', 'C', 'D']

function makeQuestion(n, isSurvey = false) {
  if (isSurvey) {
    return {
      number: n, type: 'SHORT_ANSWER', question_text: '', image_url: '',
      options: {}, correct_answer: null, points: 0, variant: 'A', time_limit: null,
      scale_min: 1, scale_max: 5, scale_min_label: '', scale_max_label: '',
      grid_rows: [''], grid_columns: [''],
      allow_other: false, required: true,
    }
  }
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

  // Survey-specific state
  const [surveyType, setSurveyType] = useState('one_time')
  const [surveyRecurrence, setSurveyRecurrence] = useState('weekly')
  const [surveyNotifyTime, setSurveyNotifyTime] = useState('19:00')
  const [surveyValidFrom, setSurveyValidFrom] = useState('')
  const [surveyValidUntil, setSurveyValidUntil] = useState('')
  const [surveyAllowEdit, setSurveyAllowEdit] = useState(false)

  const isSurvey = mode === 'survey'

  useEffect(() => {
    async function load() {
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
        // Survey fields
        setSurveyType(exam.survey_type || 'one_time')
        setSurveyRecurrence(exam.survey_recurrence || 'weekly')
        setSurveyNotifyTime(exam.survey_notify_time || '19:00')
        setSurveyValidFrom(exam.survey_valid_from ? exam.survey_valid_from.slice(0, 16) : '')
        setSurveyValidUntil(exam.survey_valid_until ? exam.survey_valid_until.slice(0, 16) : '')
        setSurveyAllowEdit(exam.survey_allow_edit || false)
      }
      if (qs?.length) {
        setQuestionItems(qs.map(q => ({
          ...q,
          question_text: q.question_text || '',
          image_url: q.image_url || '',
          options: q.options || { A: '', B: '', C: '', D: '' },
          time_limit: q.time_limit || null,
          scale_min: q.scale_min ?? 1,
          scale_max: q.scale_max ?? 5,
          scale_min_label: q.scale_min_label || '',
          scale_max_label: q.scale_max_label || '',
          grid_rows: q.grid_rows || [''],
          grid_columns: q.grid_columns || [''],
          allow_other: q.allow_other || false,
          required: q.required !== false,
        })))
        if ((exam?.quiz_timer_type || 'uniform') === 'uniform' && qs[0]?.time_limit) {
          setUniformTime(qs[0].time_limit)
        }
      }
      setLoading(false)
    }
    load()
  }, [examId, isEdit])

  // When mode changes, reset questions to appropriate defaults
  function handleModeChange(newMode) {
    const prevMode = mode
    setMode(newMode)
    
    // Reset questions when switching between survey and non-survey modes
    if ((newMode === 'survey') !== (prevMode === 'survey')) {
      setQuestionItems([makeQuestion(1, newMode === 'survey')])
    }
  }

  function addQuestion() {
    setQuestionItems(prev => [...prev, makeQuestion(prev.length + 1, isSurvey)])
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

  // Grid helpers
  function addGridRow(idx) {
    setQuestionItems(prev => prev.map((q, i) => i === idx ? { ...q, grid_rows: [...(q.grid_rows || []), ''] } : q))
  }
  function removeGridRow(idx, rowIdx) {
    setQuestionItems(prev => prev.map((q, i) => i === idx ? { ...q, grid_rows: (q.grid_rows || []).filter((_, ri) => ri !== rowIdx) } : q))
  }
  function updateGridRow(idx, rowIdx, value) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const rows = [...(q.grid_rows || [])]
      rows[rowIdx] = value
      return { ...q, grid_rows: rows }
    }))
  }
  function addGridColumn(idx) {
    setQuestionItems(prev => prev.map((q, i) => i === idx ? { ...q, grid_columns: [...(q.grid_columns || []), ''] } : q))
  }
  function removeGridColumn(idx, colIdx) {
    setQuestionItems(prev => prev.map((q, i) => i === idx ? { ...q, grid_columns: (q.grid_columns || []).filter((_, ci) => ci !== colIdx) } : q))
  }
  function updateGridColumn(idx, colIdx, value) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const cols = [...(q.grid_columns || [])]
      cols[colIdx] = value
      return { ...q, grid_columns: cols }
    }))
  }

  // Survey option helpers (dynamic options for MCQ/CHECKBOXES/DROPDOWN in survey mode)
  function addSurveyOption(idx) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const keys = Object.keys(q.options || {})
      const nextKey = `opt_${keys.length + 1}`
      return { ...q, options: { ...q.options, [nextKey]: '' } }
    }))
  }
  function removeSurveyOption(idx, key) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const newOptions = { ...q.options }
      delete newOptions[key]
      return { ...q, options: newOptions }
    }))
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
    
    // Validate questions
    for (let i = 0; i < questionItems.length; i++) {
      const q = questionItems[i]
      
      // For surveys, only validate question text is filled
      if (isSurvey) {
        if (!q.question_text || !q.question_text.trim()) {
          setError(`Pertanyaan no ${q.number} masih kosong, harap isi teks pertanyaan.`)
          return
        }
        // Validate grid questions have rows and columns
        if ((q.type === 'MCQ_GRID' || q.type === 'CHECKBOX_GRID') && 
            (!(q.grid_rows || []).some(r => r.trim()) || !(q.grid_columns || []).some(c => c.trim()))) {
          setError(`Pertanyaan no ${q.number}: Kisi harus memiliki minimal 1 baris dan 1 kolom yang terisi.`)
          return
        }
        // Validate linear scale
        if (q.type === 'LINEAR_SCALE' && (q.scale_min ?? 1) >= (q.scale_max ?? 5)) {
          setError(`Pertanyaan no ${q.number}: Nilai minimum skala harus lebih kecil dari nilai maksimum.`)
          return
        }
        // Validate options for MCQ/CHECKBOXES/DROPDOWN
        if (['MCQ', 'CHECKBOXES', 'DROPDOWN'].includes(q.type)) {
          const optionValues = Object.values(q.options || {})
          if (optionValues.length < 2 || !optionValues.some(v => v.trim())) {
            setError(`Pertanyaan no ${q.number}: Harus memiliki minimal 2 opsi yang terisi.`)
            return
          }
        }
        continue
      }
      
      // Exam/quiz validation (existing logic)
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

    // Validate survey scheduling
    if (isSurvey && surveyType === 'one_time') {
      if (publish && surveyValidUntil && new Date(surveyValidUntil) <= new Date()) {
        setError('Batas waktu survei harus di masa depan.')
        return
      }
    }

    setSaving(true); setError('')

    try {
      const targetStr = targetKelas.length === 0 ? 'all' : targetKelas.join(',')
      const examData = {
        title: title.trim(),
        information: information.trim() || null,
        pdf_url: isSurvey ? null : (pdfUrl.trim() || null),
        duration_minutes: isSurvey ? 0 : Number(duration),
        passing_grade: isSurvey ? 0 : (Number(passingGrade) || 60),
        target_kelas: targetStr,
        created_by: user.id,
        status: publish ? 'published' : 'draft',
        mode,
        quiz_timer_type: mode === 'quiz' ? quizTimerType : 'uniform',
        monitoring_level: isSurvey ? 0 : monitoringLevel,
        question_order: isSurvey ? 'ORDER' : questionOrder,
        // Survey-specific fields — only included when in survey mode
        // so regular exams work even before the survey migration is run
        ...(isSurvey ? {
          survey_type: surveyType,
          survey_recurrence: surveyType === 'scheduled' ? surveyRecurrence : null,
          survey_notify_time: surveyType === 'scheduled' ? surveyNotifyTime : null,
          survey_valid_from: surveyValidFrom ? new Date(surveyValidFrom).toISOString() : null,
          survey_valid_until: surveyValidUntil ? new Date(surveyValidUntil).toISOString() : null,
          survey_allow_edit: surveyAllowEdit,
        } : {}),
      }

      let savedExamId = examId
      if (isEdit) {
        await exams.update(examId, examData)
        await questions.deleteByExam(examId)
      } else {
        const { data, error: createErr } = await exams.create(examData)
        if (createErr || !data) {
          throw new Error(createErr?.message || 'Gagal membuat — periksa kolom database.')
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
        options: (q.type === 'ESSAY' || q.type === 'SHORT_ANSWER' || q.type === 'PARAGRAPH' || q.type === 'LINEAR_SCALE') ? null : (q.options || null),
        correct_answer: isSurvey ? null : (q.type === 'ESSAY' ? null : q.correct_answer),
        points: isSurvey ? 0 : (Number(q.points) || 1),
        variant: q.variant || 'A',
        time_limit: mode === 'quiz'
          ? (quizTimerType === 'uniform' ? Number(uniformTime) || 30 : (Number(q.time_limit) || 30))
          : null,
        // Survey-specific question fields — only included in survey mode
        ...(isSurvey ? {
          scale_min: q.type === 'LINEAR_SCALE' ? (q.scale_min ?? 1) : null,
          scale_max: q.type === 'LINEAR_SCALE' ? (q.scale_max ?? 5) : null,
          scale_min_label: q.type === 'LINEAR_SCALE' ? (q.scale_min_label || null) : null,
          scale_max_label: q.type === 'LINEAR_SCALE' ? (q.scale_max_label || null) : null,
          grid_rows: (q.type === 'MCQ_GRID' || q.type === 'CHECKBOX_GRID') ? (q.grid_rows || null) : null,
          grid_columns: (q.type === 'MCQ_GRID' || q.type === 'CHECKBOX_GRID') ? (q.grid_columns || null) : null,
          allow_other: q.allow_other || false,
          required: q.required !== false,
        } : {}),
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
  const modeLabel = isSurvey ? 'Survei' : mode === 'quiz' ? 'Kuis' : 'Ujian'
  const currentTypes = isSurvey ? SURVEY_TYPES : EXAM_TYPES

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/teacher/exams')}><ChevronLeft size={15} /></button>
            <div>
              <h2>{isEdit ? `Edit ${modeLabel}` : `Buat ${modeLabel} Baru`}</h2>
              <p className="text-muted text-sm">{questionItems.length} {isSurvey ? 'pertanyaan' : 'soal'} · Mode: {modeLabel}</p>
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

        {/* Mode Selector — 3 modes */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h3>Mode</h3></div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className={`btn ${mode === 'exam' ? 'btn-gold' : 'btn-ghost'}`}
              onClick={() => handleModeChange('exam')}
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
              onClick={() => handleModeChange('quiz')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.875rem' }}
            >
              <Zap size={18} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700 }}>Kuis</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.7, fontWeight: 400 }}>Timer per soal, maju satu arah</div>
              </div>
            </button>
            <button
              className={`btn ${mode === 'survey' ? 'btn-gold' : 'btn-ghost'}`}
              onClick={() => handleModeChange('survey')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.875rem' }}
            >
              <ClipboardList size={18} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700 }}>Survei</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.7, fontWeight: 400 }}>Google Form, tanpa pengawasan</div>
              </div>
            </button>
          </div>

          {/* Exam duration */}
          {mode === 'exam' && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <label className="form-label" style={{ marginBottom: '0.625rem', display: 'block' }}>
                <Clock size={14} style={{ marginRight: '0.375rem', verticalAlign: '-2px' }} />
                Durasi Ujian
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Clock size={16} color="var(--gold)" />
                <input
                  type="number"
                  className="form-input"
                  style={{ width: 100, padding: '0.4rem 0.6rem' }}
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                  min="1"
                  max="300"
                />
                <span className="text-sm text-muted">menit</span>
              </div>
            </div>
          )}

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

          {/* Survey scheduling settings */}
          {isSurvey && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <label className="form-label" style={{ marginBottom: '0.625rem', display: 'block' }}>
                <Calendar size={14} style={{ marginRight: '0.375rem', verticalAlign: '-2px' }} />
                Penjadwalan Survei
              </label>
              <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '1rem' }}>
                <label style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.75rem', borderRadius: 8,
                  border: `2px solid ${surveyType === 'one_time' ? 'var(--accent)' : 'var(--border)'}`,
                  background: surveyType === 'one_time' ? 'rgba(79,142,247,0.05)' : 'transparent',
                  cursor: 'pointer', fontSize: '0.85rem'
                }}>
                  <input type="radio" name="surveyType" checked={surveyType === 'one_time'} onChange={() => setSurveyType('one_time')} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Satu Kali</div>
                    <div className="text-muted text-xs">Survei sekali pakai dengan masa berlaku</div>
                  </div>
                </label>
                <label style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.75rem', borderRadius: 8,
                  border: `2px solid ${surveyType === 'scheduled' ? 'var(--accent)' : 'var(--border)'}`,
                  background: surveyType === 'scheduled' ? 'rgba(79,142,247,0.05)' : 'transparent',
                  cursor: 'pointer', fontSize: '0.85rem'
                }}>
                  <input type="radio" name="surveyType" checked={surveyType === 'scheduled'} onChange={() => setSurveyType('scheduled')} />
                  <div>
                    <div style={{ fontWeight: 600 }}>Terjadwal</div>
                    <div className="text-muted text-xs">Berulang dengan interval tertentu</div>
                  </div>
                </label>
              </div>

              {/* Scheduled survey options */}
              {surveyType === 'scheduled' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>
                      <Repeat size={12} style={{ marginRight: '0.25rem', verticalAlign: '-1px' }} /> Frekuensi
                    </label>
                    <select className="form-input" value={surveyRecurrence} onChange={e => setSurveyRecurrence(e.target.value)} style={{ fontSize: '0.85rem' }}>
                      <option value="daily">Harian</option>
                      <option value="weekly">Mingguan</option>
                      <option value="biweekly">2 Minggu Sekali</option>
                      <option value="monthly">Bulanan</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>
                      <Bell size={12} style={{ marginRight: '0.25rem', verticalAlign: '-1px' }} /> Waktu Notifikasi
                    </label>
                    <input type="time" className="form-input" value={surveyNotifyTime} onChange={e => setSurveyNotifyTime(e.target.value)} style={{ fontSize: '0.85rem' }} />
                  </div>
                </div>
              )}

              {/* Validity period */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Mulai Berlaku <span className="text-muted text-xs" style={{ fontWeight: 400 }}>(opsional)</span></label>
                  <input type="datetime-local" className="form-input" value={surveyValidFrom} onChange={e => setSurveyValidFrom(e.target.value)} style={{ fontSize: '0.85rem' }} />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Batas Waktu <span className="text-muted text-xs" style={{ fontWeight: 400 }}>(opsional)</span></label>
                  <input type="datetime-local" className="form-input" value={surveyValidUntil} onChange={e => setSurveyValidUntil(e.target.value)} style={{ fontSize: '0.85rem' }} />
                </div>
              </div>

              {/* Allow edit toggle (one_time only) */}
              {surveyType === 'one_time' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', padding: '0.5rem 0' }}>
                  <input type="checkbox" checked={surveyAllowEdit} onChange={e => setSurveyAllowEdit(e.target.checked)} />
                  <Edit3 size={14} />
                  <span>Izinkan responden mengedit jawaban setelah submit</span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Monitoring Level Selector — hidden for surveys */}
        {!isSurvey && (
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
        )}

        {/* Basic info */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h3>Informasi {modeLabel}</h3></div>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Judul {modeLabel}</label>
              <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder={
                isSurvey ? 'cth: Survei Kepuasan Pembelajaran Semester 1' 
                : mode === 'exam' ? 'cth: Ujian Tengah Semester Matematika' 
                : 'cth: Kuis Harian Bab 3'
              } />
            </div>
            <div className="form-group">
              <label className="form-label">Informasi Khusus <span className="text-muted text-xs" style={{ fontWeight: 400 }}>(opsional)</span></label>
              <textarea 
                className="form-input" 
                value={information} 
                onChange={e => setInformation(e.target.value)} 
                placeholder={isSurvey ? 'cth: Jawaban Anda bersifat anonim dan tidak mempengaruhi nilai' : 'cth: Jika ketahuan mencontek, nilai langsung 0'}
                style={{ minHeight: '60px', resize: 'vertical' }}
              />
              <span className="text-xs text-muted">
                {isSurvey 
                  ? 'Informasi ini akan ditampilkan di awal survei sebelum responden memulai.' 
                  : 'Informasi ini akan ditampilkan di halaman lobi sebelum siswa memulai ujian.'}
              </span>
            </div>

            {/* PDF & Question Order — hidden for surveys */}
            {!isSurvey && (
              <>
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
              </>
            )}

            {/* Passing grade — hidden for surveys */}
            {!isSurvey && (
              <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">KKM (Kriteria Ketuntasan Minimal)</label>
                  <input type="number" className="form-input" value={passingGrade} onChange={e => setPassingGrade(e.target.value)} min="0" max="100" placeholder="60" />
                  <span className="text-xs text-muted">Nilai minimum kelulusan (skala 0—100)</span>
                </div>
              </div>
            )}

            {/* Target kelas — shown for all modes */}
            <div className="form-group">
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

        {/* Questions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {questionItems.map((q, idx) => (
            <div key={idx} className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.95rem' }}>{isSurvey ? 'Pertanyaan' : 'Soal'} #{q.number}</h3>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select className="form-input" style={{ width: 'auto', fontSize: '0.82rem', padding: '0.35rem 0.75rem' }} value={q.type} onChange={e => {
                    const newType = e.target.value
                    const updates = { type: newType }
                    // Initialize options for types that need them
                    if (['MCQ', 'CHECKBOXES', 'DROPDOWN'].includes(newType) && (!q.options || Object.keys(q.options).length === 0)) {
                      updates.options = isSurvey ? { opt_1: '', opt_2: '' } : { A: '', B: '', C: '', D: '' }
                    }
                    if (['MCQ_GRID', 'CHECKBOX_GRID'].includes(newType)) {
                      if (!q.grid_rows?.length) updates.grid_rows = ['']
                      if (!q.grid_columns?.length) updates.grid_columns = ['']
                    }
                    setQuestionItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item))
                  }}>
                    {currentTypes.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                  
                  {/* Points — only for exams/quizzes */}
                  {!isSurvey && (
                    <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.375rem' }}>
                      <label className="form-label" style={{ whiteSpace: 'nowrap', textTransform: 'none', fontSize: '0.8rem' }}>Poin:</label>
                      <input type="number" className="form-input" style={{ width: 56, padding: '0.35rem 0.5rem', fontSize: '0.85rem' }} value={q.points} onChange={e => updateQuestion(idx, 'points', e.target.value)} min="1" />
                    </div>
                  )}

                  {/* Required toggle — only for surveys */}
                  {isSurvey && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={q.required !== false} onChange={e => updateQuestion(idx, 'required', e.target.checked)} />
                      Wajib
                    </label>
                  )}

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

              {/* Question text */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Teks {isSurvey ? 'Pertanyaan' : 'Soal'}</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: 60, resize: 'vertical', fontSize: '0.85rem' }}
                  value={q.question_text || ''}
                  onChange={e => updateQuestion(idx, 'question_text', e.target.value)}
                  placeholder={isSurvey ? 'Tulis pertanyaan survei di sini...' : 'Tulis soal di sini (opsional jika menggunakan PDF)...'}
                />
              </div>

              {/* Question Image Attachment — hidden for surveys */}
              {!isSurvey && (
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
              )}

              {/* ═══════════════ SURVEY QUESTION TYPE EDITORS ═══════════════ */}
              {isSurvey && q.type === 'SHORT_ANSWER' && (
                <div className="alert alert-info text-sm" style={{ opacity: 0.7 }}>
                  📝 Responden akan melihat kolom teks satu baris untuk menjawab pertanyaan ini.
                </div>
              )}

              {isSurvey && q.type === 'PARAGRAPH' && (
                <div className="alert alert-info text-sm" style={{ opacity: 0.7 }}>
                  📝 Responden akan melihat kolom teks multi-baris (paragraf) untuk jawaban panjang.
                </div>
              )}

              {isSurvey && q.type === 'LINEAR_SCALE' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Nilai Minimum</label>
                      <input type="number" className="form-input" value={q.scale_min ?? 1} onChange={e => updateQuestion(idx, 'scale_min', Number(e.target.value))} min="0" max="10" style={{ fontSize: '0.85rem' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Nilai Maksimum</label>
                      <input type="number" className="form-input" value={q.scale_max ?? 5} onChange={e => updateQuestion(idx, 'scale_max', Number(e.target.value))} min="1" max="10" style={{ fontSize: '0.85rem' }} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Label Minimum <span className="text-muted text-xs" style={{ fontWeight: 400 }}>(opsional)</span></label>
                      <input className="form-input" value={q.scale_min_label || ''} onChange={e => updateQuestion(idx, 'scale_min_label', e.target.value)} placeholder='cth: Sangat Tidak Setuju' style={{ fontSize: '0.85rem' }} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Label Maksimum <span className="text-muted text-xs" style={{ fontWeight: 400 }}>(opsional)</span></label>
                      <input className="form-input" value={q.scale_max_label || ''} onChange={e => updateQuestion(idx, 'scale_max_label', e.target.value)} placeholder='cth: Sangat Setuju' style={{ fontSize: '0.85rem' }} />
                    </div>
                  </div>
                  {/* Preview */}
                  <div style={{ padding: '0.75rem', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div className="text-xs text-muted" style={{ marginBottom: '0.5rem' }}>Pratinjau Skala:</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                      {q.scale_min_label && <span className="text-xs text-muted">{q.scale_min_label}</span>}
                      {Array.from({ length: (q.scale_max ?? 5) - (q.scale_min ?? 1) + 1 }, (_, i) => (q.scale_min ?? 1) + i).map(v => (
                        <span key={v} style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 600 }}>{v}</span>
                      ))}
                      {q.scale_max_label && <span className="text-xs text-muted">{q.scale_max_label}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Grid editors (MCQ_GRID and CHECKBOX_GRID) */}
              {isSurvey && (q.type === 'MCQ_GRID' || q.type === 'CHECKBOX_GRID') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Baris (Pernyataan)</label>
                    {(q.grid_rows || []).map((row, ri) => (
                      <div key={ri} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.375rem', alignItems: 'center' }}>
                        <span style={{ width: 20, textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{ri + 1}</span>
                        <input className="form-input" style={{ flex: 1, fontSize: '0.85rem' }} placeholder={`Pernyataan ${ri + 1}`} value={row} onChange={e => updateGridRow(idx, ri, e.target.value)} />
                        {(q.grid_rows || []).length > 1 && (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '0.25rem' }} onClick={() => removeGridRow(idx, ri)}><Trash2 size={13} /></button>
                        )}
                      </div>
                    ))}
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.8rem' }} onClick={() => addGridRow(idx)}>
                      <Plus size={13} /> Tambah Baris
                    </button>
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Kolom (Opsi)</label>
                    {(q.grid_columns || []).map((col, ci) => (
                      <div key={ci} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.375rem', alignItems: 'center' }}>
                        <span style={{ width: 20, textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{ci + 1}</span>
                        <input className="form-input" style={{ flex: 1, fontSize: '0.85rem' }} placeholder={`Opsi ${ci + 1}`} value={col} onChange={e => updateGridColumn(idx, ci, e.target.value)} />
                        {(q.grid_columns || []).length > 1 && (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '0.25rem' }} onClick={() => removeGridColumn(idx, ci)}><Trash2 size={13} /></button>
                        )}
                      </div>
                    ))}
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.8rem' }} onClick={() => addGridColumn(idx)}>
                      <Plus size={13} /> Tambah Kolom
                    </button>
                  </div>
                  <div className="text-xs text-muted">
                    {q.type === 'MCQ_GRID' ? '○ Satu pilihan per baris (radio)' : '☑ Beberapa pilihan per baris (checkbox)'}
                  </div>
                </div>
              )}

              {/* Survey MCQ / CHECKBOXES / DROPDOWN options editor */}
              {isSurvey && ['MCQ', 'CHECKBOXES', 'DROPDOWN'].includes(q.type) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {Object.keys(q.options || {}).map((key, i) => (
                    <div key={key} style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
                      <span style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                      <input className="form-input" style={{ flex: 1 }} placeholder={`Opsi ${i + 1}`} value={q.options[key] || ''} onChange={e => updateOption(idx, key, e.target.value)} />
                      {Object.keys(q.options || {}).length > 2 && (
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '0.25rem' }} onClick={() => removeSurveyOption(idx, key)}><Trash2 size={13} /></button>
                      )}
                    </div>
                  ))}
                  <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => addSurveyOption(idx)}>
                    <Plus size={14} /> Tambah Opsi
                  </button>
                  {q.type === 'MCQ' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={q.allow_other || false} onChange={e => updateQuestion(idx, 'allow_other', e.target.checked)} />
                      Tampilkan opsi "Lainnya" (teks bebas)
                    </label>
                  )}
                  <div className="text-xs text-muted">
                    {q.type === 'MCQ' ? '○ Responden memilih satu jawaban' : q.type === 'CHECKBOXES' ? '☑ Responden dapat memilih beberapa jawaban' : '▾ Ditampilkan sebagai menu dropdown'}
                  </div>
                </div>
              )}

              {/* ═══════════════ EXAM/QUIZ QUESTION TYPE EDITORS ═══════════════ */}
              {/* MCQ / COMPLEX_MCQ options (exam/quiz mode) */}
              {!isSurvey && (q.type === 'MCQ' || q.type === 'COMPLEX_MCQ') && (
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

              {/* True/False (exam/quiz mode) */}
              {!isSurvey && q.type === 'TRUE_FALSE' && (
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

              {!isSurvey && q.type === 'ESSAY' && (
                <div className="alert alert-info text-sm">Soal esai tidak memiliki kunci jawaban otomatis. Guru menilai secara manual.</div>
              )}
            </div>
          ))}

          <button className="btn btn-ghost" onClick={addQuestion} style={{ borderStyle: 'dashed', borderWidth: 2 }}>
            <Plus size={16} /> Tambah {isSurvey ? 'Pertanyaan' : 'Soal'}
          </button>
        </div>
      </div>
    </>
  )
}
