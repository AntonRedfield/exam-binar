import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getCurrentUser } from '../../lib/auth'
import { exams, questions, users } from '../../lib/db'
import { Plus, Trash2, ChevronLeft, Save, BookOpen, Zap, Clock, Info, ChevronDown, ChevronUp, AlertTriangle, ClipboardList, Calendar, Bell, Edit3, Repeat, Sliders, CheckCircle2, Image as ImageIcon, Video, FileText, Layers, Copy, Paperclip, Headphones, X } from 'lucide-react'
import { getDriveImageUrl } from '../../lib/grader'
import { MONITORING_LEVELS, normalizeMonitoringLevel } from '../../lib/monitoringConfig'
import { MonitoringIcon } from '../../lib/monitoringUI'
import QuestionAudioInput from '../../components/admin/QuestionAudioInput'
import QuestionVideoPlayer from '../../components/exam/QuestionVideoPlayer'

const EXAM_TYPES = ['MCQ', 'COMPLEX_MCQ', 'TRUE_FALSE', 'MATCHING', 'SEQUENCING', 'AGREE_DISAGREE', 'ESSAY']
const SURVEY_TYPES = ['SHORT_ANSWER', 'PARAGRAPH', 'LINEAR_SCALE', 'MCQ_GRID', 'CHECKBOX_GRID', 'MCQ', 'CHECKBOXES', 'DROPDOWN']

const TYPE_LABELS = {
  MCQ: 'Pilihan Ganda (1 jawaban)',
  COMPLEX_MCQ: 'Multi-Jawab (beberapa benar)',
  TRUE_FALSE: 'Benar / Salah',
  MATCHING: 'Menjodohkan (Matching)',
  SEQUENCING: 'Mengurutkan (Sequencing)',
  AGREE_DISAGREE: 'Setuju / Tidak Setuju',
  ESSAY: 'Esai (penilaian manual)',
  SHORT_ANSWER: 'Jawaban Singkat',
  PARAGRAPH: 'Paragraf',
  LINEAR_SCALE: 'Skala Linear',
  MCQ_GRID: 'Kisi Pilihan Ganda',
  CHECKBOX_GRID: 'Kisi Kotak Centang',
  CHECKBOXES: 'Kotak Centang (multi-pilih)',
  DROPDOWN: 'Dropdown',
}

const ALL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

function makeOptions(count = 4) {
  const clamped = Math.max(2, Math.min(10, count))
  const obj = {}
  for (let i = 0; i < clamped; i++) {
    obj[ALL_LETTERS[i]] = ''
  }
  return obj
}

function makeStatements(count = 3) {
  const clamped = Math.max(1, Math.min(10, count))
  const obj = {}
  for (let i = 0; i < clamped; i++) {
    obj[`stmt_${Date.now()}_${i + 1}`] = ''
  }
  return obj
}

function makeStatementsAnswers(optionsObj) {
  const obj = {}
  Object.keys(optionsObj || {}).forEach(k => {
    obj[k] = 'true'
  })
  return obj
}

function makeMatching(count = 3) {
  const clamped = Math.max(2, Math.min(10, count))
  const left = {}
  const right = {}
  const correct = {}
  for (let i = 0; i < clamped; i++) {
    const leftKey = String(i + 1)
    const rightKey = ALL_LETTERS[i]
    left[leftKey] = ''
    right[rightKey] = ''
    correct[leftKey] = rightKey
  }
  return { options: { left, right }, correct_answer: correct }
}

function makeSequencing(count = 4) {
  const clamped = Math.max(2, Math.min(10, count))
  const items = []
  const correct = []
  for (let i = 0; i < clamped; i++) {
    const id = `seq_${Date.now()}_${i + 1}`
    items.push({ id, text: '' })
    correct.push(id)
  }
  return { options: { items }, correct_answer: correct }
}

function makeAgreeDisagree(count = 3) {
  const clamped = Math.max(1, Math.min(10, count))
  const options = {}
  const correct = {}
  for (let i = 0; i < clamped; i++) {
    const key = `stmt_${Date.now()}_${i + 1}`
    options[key] = ''
    correct[key] = 'agree'
  }
  return { options, correct_answer: correct }
}

function makeSurveyOptions(count = 4) {
  const clamped = Math.max(2, Math.min(10, count))
  const obj = {}
  for (let i = 0; i < clamped; i++) {
    obj[`opt_${i + 1}`] = ''
  }
  return obj
}

function makeGridRows(count = 3) {
  const clamped = Math.max(1, Math.min(15, count))
  return Array.from({ length: clamped }, (_, i) => `Baris ${i + 1}`)
}

function makeGridColumns(count = 3) {
  const clamped = Math.max(1, Math.min(10, count))
  return Array.from({ length: clamped }, (_, i) => `Kolom ${i + 1}`)
}

function makeQuestion(n, isSurvey = false, defaultOptsCount = 4, defaultStmtsCount = 3) {
  if (isSurvey) {
    return {
      number: n, type: 'SHORT_ANSWER', question_text: '', image_url: '', video_url: '',
      audio_url: '', max_plays: 1, allow_pause: false,
      options: {}, option_images: {}, correct_answer: null, points: 0, variant: 'A', time_limit: null,
      scale_min: 1, scale_max: 5, scale_min_label: '', scale_max_label: '',
      grid_rows: ['Baris 1', 'Baris 2', 'Baris 3'], grid_columns: ['Kolom 1', 'Kolom 2', 'Kolom 3'],
      allow_other: false, required: true,
    }
  }
  const opts = makeOptions(defaultOptsCount)
  return { number: n, type: 'MCQ', question_text: '', image_url: '', video_url: '', audio_url: '', max_plays: 1, allow_pause: false, options: opts, option_images: {}, correct_answer: 'A', points: 1, variant: 'A', time_limit: null }
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
  const [defaultOptionsCount, setDefaultOptionsCount] = useState(4)
  const [defaultStatementsCount, setDefaultStatementsCount] = useState(3)
  const [defaultMatchingCount, setDefaultMatchingCount] = useState(3)
  const [defaultSequencingCount, setDefaultSequencingCount] = useState(4)
  const [defaultAgreeDisagreeCount, setDefaultAgreeDisagreeCount] = useState(3)
  const [defaultSurveyOptionsCount, setDefaultSurveyOptionsCount] = useState(4)
  const [defaultGridRowsCount, setDefaultGridRowsCount] = useState(3)
  const [defaultGridColsCount, setDefaultGridColsCount] = useState(3)
  const [actionNotice, setActionNotice] = useState('')
  const [openOptionImageInputs, setOpenOptionImageInputs] = useState({})
  const [questionItems, setQuestionItems] = useState([makeQuestion(1, false, 4, 3)])
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

  // Unsaved changes tracking & navigation protection
  const returnPath = user?.role === 'SUPERADMIN' ? '/admin/exams' : '/teacher/exams'
  const initialSnapshotRef = useRef(null)
  const isSavedRef = useRef(false)
  const [showUnsavedModal, setShowUnsavedModal] = useState(false)
  const [pendingNavPath, setPendingNavPath] = useState(null)

  // ─── Collapsible Sections for Tidy Lv.3 & Lv.4 Controls ───────────────────
  const [collapsedSections, setCollapsedSections] = useState({
    mode: false,
    monitoring: false,
    info: false,
    standards: false,
  })
  const [collapsedQuestions, setCollapsedQuestions] = useState({})
  const [expandedAttachments, setExpandedAttachments] = useState({})
  const [openOptionSettings, setOpenOptionSettings] = useState({})

  function toggleAttachment(idx) {
    setExpandedAttachments(prev => {
      const wasOpen = Boolean(prev[idx])
      if (wasOpen) {
        return { ...prev, [idx]: false }
      }
      // Automated shrink: auto-shrink any other open question attachments so only one is expanded
      return { [idx]: true }
    })
  }

  function shrinkAttachment(idx) {
    setExpandedAttachments(prev => ({ ...prev, [idx]: false }))
  }

  function toggleOptionSettings(key) {
    setOpenOptionSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function shrinkOptionSettings(key) {
    setOpenOptionSettings(prev => ({ ...prev, [key]: false }))
  }

  function toggleSection(sec) {
    setCollapsedSections(prev => ({ ...prev, [sec]: !prev[sec] }))
  }

  function collapseAllSections() {
    setCollapsedSections({
      mode: true,
      monitoring: true,
      info: true,
      standards: true,
    })
    const qMap = {}
    questionItems.forEach((_, idx) => { qMap[idx] = true })
    setCollapsedQuestions(qMap)
    setExpandedAttachments({})
    setOpenOptionSettings({})
  }

  function expandAllSections() {
    setCollapsedSections({
      mode: false,
      monitoring: false,
      info: false,
      standards: false,
    })
    setCollapsedQuestions({})
  }

  function toggleQuestion(idx) {
    setCollapsedQuestions(prev => {
      const nextCollapsed = !prev[idx]
      // Automated shrink attachments & option settings when question is collapsed
      if (nextCollapsed) {
        setExpandedAttachments(aPrev => ({ ...aPrev, [idx]: false }))
        setOpenOptionSettings(sPrev => ({ ...sPrev, [idx]: false, [`survey_${idx}`]: false, [`tf_${idx}`]: false }))
      }
      return { ...prev, [idx]: nextCollapsed }
    })
  }

  function collapseAllQuestions() {
    const qMap = {}
    questionItems.forEach((_, idx) => { qMap[idx] = true })
    setCollapsedQuestions(qMap)
  }

  function expandAllQuestions() {
    setCollapsedQuestions({})
  }

  const isSurvey = mode === 'survey'

  function showNotice(msg) {
    setActionNotice(msg)
    setTimeout(() => {
      setActionNotice(prev => prev === msg ? '' : prev)
    }, 4000)
  }

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
        setMonitoringLevel(normalizeMonitoringLevel(exam.monitoring_level))
        setQuestionOrder(exam.question_order || 'ORDER')
        // Load default options counts
        if (exam.default_options_count) setDefaultOptionsCount(exam.default_options_count)
        if (exam.default_statements_count) setDefaultStatementsCount(exam.default_statements_count)
        if (exam.default_matching_count) setDefaultMatchingCount(exam.default_matching_count)
        if (exam.default_sequencing_count) setDefaultSequencingCount(exam.default_sequencing_count)
        if (exam.default_agree_disagree_count) setDefaultAgreeDisagreeCount(exam.default_agree_disagree_count)
        if (exam.default_survey_options_count) setDefaultSurveyOptionsCount(exam.default_survey_options_count)
        if (exam.default_grid_rows_count) setDefaultGridRowsCount(exam.default_grid_rows_count)
        if (exam.default_grid_cols_count) setDefaultGridColsCount(exam.default_grid_cols_count)
        // Survey fields
        setSurveyType(exam.survey_type || 'one_time')
        setSurveyRecurrence(exam.survey_recurrence || 'weekly')
        setSurveyNotifyTime(exam.survey_notify_time || '19:00')
        setSurveyValidFrom(exam.survey_valid_from ? exam.survey_valid_from.slice(0, 16) : '')
        setSurveyValidUntil(exam.survey_valid_until ? exam.survey_valid_until.slice(0, 16) : '')
        setSurveyAllowEdit(exam.survey_allow_edit || false)
      }
      if (qs?.length) {
        // Auto-detect default counts from questions if not set on exam
        if (!exam?.default_options_count) {
          const firstMcq = qs.find(q => q.type === 'MCQ' || q.type === 'COMPLEX_MCQ')
          if (firstMcq?.options) {
            const count = Object.keys(firstMcq.options).length
            if (count >= 2 && count <= 10) setDefaultOptionsCount(count)
          }
        }
        if (!exam?.default_statements_count) {
          const firstTf = qs.find(q => q.type === 'TRUE_FALSE')
          if (firstTf?.options) {
            const count = Object.keys(firstTf.options).length
            if (count >= 1 && count <= 10) setDefaultStatementsCount(count)
          }
        }
        if (!exam?.default_matching_count) {
          const firstM = qs.find(q => q.type === 'MATCHING')
          if (firstM?.options?.left) {
            const count = Object.keys(firstM.options.left).length
            if (count >= 2 && count <= 10) setDefaultMatchingCount(count)
          }
        }
        if (!exam?.default_sequencing_count) {
          const firstS = qs.find(q => q.type === 'SEQUENCING')
          if (firstS?.options?.items) {
            const count = firstS.options.items.length
            if (count >= 2 && count <= 10) setDefaultSequencingCount(count)
          }
        }
        if (!exam?.default_agree_disagree_count) {
          const firstAd = qs.find(q => q.type === 'AGREE_DISAGREE')
          if (firstAd?.options) {
            const count = Object.keys(firstAd.options).length
            if (count >= 1 && count <= 10) setDefaultAgreeDisagreeCount(count)
          }
        }

        setQuestionItems(qs.map(q => {
          let opts = q.options
          let ans = q.correct_answer

          if (q.type === 'TRUE_FALSE') {
            const optKeys = Object.keys(opts || {})
            const isLegacyFormat = optKeys.length === 2 && optKeys.includes('A') && optKeys.includes('B') && (opts.A === 'Benar' || opts.A === 'benar')
            if (isLegacyFormat || optKeys.length === 0) {
              const s1 = `stmt_${Date.now()}_1`
              const s2 = `stmt_${Date.now()}_2`
              opts = {
                [s1]: q.question_text || 'Pernyataan 1',
                [s2]: 'Pernyataan alternatif 2',
              }
              ans = {
                [s1]: (ans === 'A' || ans === 'true' || ans?.[s1] === 'true') ? 'true' : 'false',
                [s2]: 'false'
              }
            } else if (typeof ans === 'string') {
              const newAns = {}
              optKeys.forEach((k, i) => {
                newAns[k] = (ans === 'true' || (ans === 'A' && i === 0)) ? 'true' : 'false'
              })
              ans = newAns
            }
          }

          if (q.type === 'MATCHING') {
            if (!opts || !opts.left || !opts.right) {
              const initialM = makeMatching(3)
              opts = initialM.options
              ans = initialM.correct_answer
            }
          }

          if (q.type === 'SEQUENCING') {
            if (!opts || !Array.isArray(opts.items) || opts.items.length === 0) {
              const initialS = makeSequencing(4)
              opts = initialS.options
              ans = initialS.correct_answer
            }
          }

          if (q.type === 'AGREE_DISAGREE') {
            if (!opts || Object.keys(opts).length === 0) {
              const initialAd = makeAgreeDisagree(3)
              opts = initialAd.options
              ans = initialAd.correct_answer
            } else if (typeof ans === 'string' || !ans) {
              const newAns = {}
              Object.keys(opts).forEach(k => {
                newAns[k] = 'agree'
              })
              ans = newAns
            }
          }

          return {
            ...q,
            question_text: q.question_text || '',
            image_url: q.image_url || '',
            video_url: q.video_url || '',
            audio_url: q.audio_url || '',
            max_plays: q.max_plays || 1,
            allow_pause: q.allow_pause || false,
            options: (['MCQ', 'COMPLEX_MCQ'].includes(q.type) && (!opts || Object.keys(opts).length === 0))
              ? makeOptions(exam?.default_options_count || 4)
              : (opts || {}),
            option_images: q.option_images || q.options?.option_images || {},
            correct_answer: ans !== undefined ? ans : (q.type === 'MCQ' ? 'A' : null),
            time_limit: q.time_limit || null,
            scale_min: q.scale_min ?? 1,
            scale_max: q.scale_max ?? 5,
            scale_min_label: q.scale_min_label || '',
            scale_max_label: q.scale_max_label || '',
            grid_rows: q.grid_rows || ['Baris 1'],
            grid_columns: q.grid_columns || ['Kolom 1'],
            allow_other: q.allow_other || false,
            required: q.required !== false,
          }
        }))
        if ((exam?.quiz_timer_type || 'uniform') === 'uniform' && qs[0]?.time_limit) {
          setUniformTime(qs[0].time_limit)
        }
      }
      setLoading(false)
    }
    load()
  }, [examId, isEdit])

  // Compute snapshot of current form state for unsaved changes detection
  const computeSnapshot = useCallback(() => {
    return JSON.stringify({
      title: (title || '').trim(),
      information: (information || '').trim(),
      pdfUrl: (pdfUrl || '').trim(),
      duration: Number(duration) || 0,
      passingGrade: Number(passingGrade) || 0,
      targetKelas: [...(targetKelas || [])].sort(),
      mode,
      quizTimerType,
      uniformTime: Number(uniformTime) || 0,
      monitoringLevel,
      questionOrder,
      defaultOptionsCount,
      defaultStatementsCount,
      defaultMatchingCount,
      defaultSequencingCount,
      defaultAgreeDisagreeCount,
      defaultSurveyOptionsCount,
      defaultGridRowsCount,
      defaultGridColsCount,
      surveyType,
      surveyRecurrence,
      surveyNotifyTime,
      surveyValidFrom,
      surveyValidUntil,
      surveyAllowEdit,
      questions: (questionItems || []).map(q => ({
        number: q.number,
        type: q.type,
        question_text: (q.question_text || '').trim(),
        image_url: q.image_url || '',
        video_url: q.video_url || '',
        audio_url: q.audio_url || '',
        max_plays: q.max_plays,
        allow_pause: q.allow_pause,
        options: q.options || {},
        option_images: q.option_images || {},
        correct_answer: q.correct_answer,
        points: q.points,
        variant: q.variant,
        time_limit: q.time_limit,
        scale_min: q.scale_min,
        scale_max: q.scale_max,
        scale_min_label: q.scale_min_label,
        scale_max_label: q.scale_max_label,
        grid_rows: q.grid_rows,
        grid_columns: q.grid_columns,
        allow_other: q.allow_other,
        required: q.required,
      }))
    })
  }, [
    title, information, pdfUrl, duration, passingGrade, targetKelas, mode,
    quizTimerType, uniformTime, monitoringLevel, questionOrder,
    defaultOptionsCount, defaultStatementsCount, defaultMatchingCount,
    defaultSequencingCount, defaultAgreeDisagreeCount, defaultSurveyOptionsCount,
    defaultGridRowsCount, defaultGridColsCount, surveyType, surveyRecurrence,
    surveyNotifyTime, surveyValidFrom, surveyValidUntil, surveyAllowEdit,
    questionItems
  ])

  // Initialize initial snapshot baseline once loading finishes
  useEffect(() => {
    if (!loading && initialSnapshotRef.current === null) {
      initialSnapshotRef.current = computeSnapshot()
    }
  }, [loading, computeSnapshot])

  const currentSnapshot = computeSnapshot()
  const hasUnsavedChanges = Boolean(
    !loading &&
    initialSnapshotRef.current !== null &&
    initialSnapshotRef.current !== currentSnapshot
  )

  // Prompt before closing / reloading browser tab
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges && !saving && !isSavedRef.current) {
        e.preventDefault()
        e.returnValue = ''
        return ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [hasUnsavedChanges, saving])

  // Intercept in-app navigation clicks (e.g. sidebar links)
  useEffect(() => {
    const handleClickCapture = (e) => {
      if (!hasUnsavedChanges || isSavedRef.current || saving) return
      const link = e.target.closest('a')
      if (link && link.href && !link.hasAttribute('download') && link.target !== '_blank') {
        const href = link.getAttribute('href')
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          e.preventDefault()
          e.stopPropagation()
          setPendingNavPath(href)
          setShowUnsavedModal(true)
        }
      }
    }
    document.addEventListener('click', handleClickCapture, true)
    return () => {
      document.removeEventListener('click', handleClickCapture, true)
    }
  }, [hasUnsavedChanges, saving])

  // Intercept browser back button
  useEffect(() => {
    if (!hasUnsavedChanges || isSavedRef.current) return

    window.history.pushState({ trap: true }, '', window.location.href)

    const handlePopState = () => {
      if (hasUnsavedChanges && !isSavedRef.current) {
        window.history.pushState({ trap: true }, '', window.location.href)
        setPendingNavPath(returnPath)
        setShowUnsavedModal(true)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [hasUnsavedChanges, returnPath])

  function handleBackClick() {
    if (hasUnsavedChanges) {
      setPendingNavPath(returnPath)
      setShowUnsavedModal(true)
    } else {
      navigate(returnPath)
    }
  }

  // When mode changes, reset questions to appropriate defaults
  function handleModeChange(newMode) {
    const prevMode = mode
    setMode(newMode)
    
    // Reset questions when switching between survey and non-survey modes
    if ((newMode === 'survey') !== (prevMode === 'survey')) {
      setQuestionItems([makeQuestion(1, newMode === 'survey', defaultOptionsCount, defaultStatementsCount)])
    }
  }

  function addQuestion() {
    setQuestionItems(prev => [...prev, makeQuestion(prev.length + 1, isSurvey, defaultOptionsCount, defaultStatementsCount)])
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

  function toggleOptionImageInput(qIdx, key) {
    const mapKey = `${qIdx}_${key}`
    setOpenOptionImageInputs(prev => {
      const wasOpen = Boolean(prev[mapKey])
      if (wasOpen) {
        return { ...prev, [mapKey]: false }
      }
      // Automated shrink: auto-shrink other open option image drawers in this question
      const next = {}
      Object.keys(prev).forEach(k => {
        if (!k.startsWith(`${qIdx}_`)) {
          next[k] = prev[k]
        }
      })
      next[mapKey] = true
      return next
    })
  }

  function shrinkOptionImageInput(qIdx, key) {
    const mapKey = `${qIdx}_${key}`
    setOpenOptionImageInputs(prev => ({ ...prev, [mapKey]: false }))
  }

  function updateOptionImage(idx, key, value) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const newImages = { ...(q.option_images || {}) }
      const trimmed = value ? value.trim() : ''
      if (!trimmed) {
        delete newImages[key]
      } else {
        newImages[key] = trimmed
      }
      return { ...q, option_images: newImages }
    }))
  }

  // --- MCQ & COMPLEX_MCQ Helper functions ---
  function changeMcqOptionsCount(idx, targetCount) {
    const count = Math.max(2, Math.min(10, targetCount))
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const currentKeys = Object.keys(q.options || {})
      const newOptions = {}
      const newOptionImages = {}
      for (let c = 0; c < count; c++) {
        const letter = ALL_LETTERS[c]
        newOptions[letter] = q.options?.[letter] !== undefined ? q.options[letter] : (q.options?.[currentKeys[c]] || '')
        if (q.option_images?.[letter]) {
          newOptionImages[letter] = q.option_images[letter]
        } else if (q.option_images?.[currentKeys[c]]) {
          newOptionImages[letter] = q.option_images[currentKeys[c]]
        }
      }
      const keptLetters = ALL_LETTERS.slice(0, count)
      let newCorrect = q.correct_answer
      if (q.type === 'MCQ') {
        if (!keptLetters.includes(q.correct_answer)) {
          newCorrect = 'A'
        }
      } else if (q.type === 'COMPLEX_MCQ') {
        const currentArr = Array.isArray(q.correct_answer) ? q.correct_answer : []
        const filtered = currentArr.filter(k => keptLetters.includes(k))
        newCorrect = filtered.length > 0 ? filtered : ['A']
      }
      return { ...q, options: newOptions, option_images: newOptionImages, correct_answer: newCorrect }
    }))
  }

  function addMcqOption(idx) {
    const q = questionItems[idx]
    const currentCount = Object.keys(q.options || {}).length
    if (currentCount < 10) {
      changeMcqOptionsCount(idx, currentCount + 1)
    }
  }

  function removeMcqOption(idx, letterToRemove) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const currentKeys = Object.keys(q.options || {})
      if (currentKeys.length <= 2) return q // minimum 2 options
      
      const removeIndex = currentKeys.indexOf(letterToRemove)
      if (removeIndex === -1) return q
      
      const remainingValues = currentKeys.filter(k => k !== letterToRemove).map(k => q.options[k])
      const remainingImages = currentKeys.filter(k => k !== letterToRemove).map(k => q.option_images?.[k] || null)
      const newOptions = {}
      const newOptionImages = {}
      remainingValues.forEach((val, vi) => {
        const ltr = ALL_LETTERS[vi]
        newOptions[ltr] = val
        if (remainingImages[vi]) {
          newOptionImages[ltr] = remainingImages[vi]
        }
      })
      
      let newCorrect = q.correct_answer
      if (q.type === 'MCQ') {
        const oldIndex = currentKeys.indexOf(q.correct_answer)
        if (oldIndex === removeIndex) {
          newCorrect = 'A'
        } else if (oldIndex > removeIndex) {
          newCorrect = ALL_LETTERS[oldIndex - 1]
        }
      } else if (q.type === 'COMPLEX_MCQ') {
        const currentArr = Array.isArray(q.correct_answer) ? q.correct_answer : []
        const updated = currentArr
          .filter(k => k !== letterToRemove)
          .map(k => {
            const oldIdx = currentKeys.indexOf(k)
            return oldIdx > removeIndex ? ALL_LETTERS[oldIdx - 1] : k
          })
        newCorrect = updated.length > 0 ? updated : ['A']
      }
      return { ...q, options: newOptions, option_images: newOptionImages, correct_answer: newCorrect }
    }))
  }

  // --- TRUE_FALSE Helper functions ---
  function changeStatementsCount(idx, targetCount) {
    const count = Math.max(1, Math.min(10, targetCount))
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const currentKeys = Object.keys(q.options || {})
      const newOptions = {}
      const newAnswers = {}
      for (let c = 0; c < count; c++) {
        const key = currentKeys[c] || `stmt_${Date.now()}_${c + 1}`
        newOptions[key] = q.options?.[key] || ''
        newAnswers[key] = q.correct_answer?.[key] || 'true'
      }
      return { ...q, options: newOptions, correct_answer: newAnswers }
    }))
  }

  function addStatement(idx) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const newKey = `stmt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
      return {
        ...q,
        options: { ...(q.options || {}), [newKey]: '' },
        correct_answer: { ...(q.correct_answer || {}), [newKey]: 'true' }
      }
    }))
  }

  function removeStatement(idx, keyToRemove) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const newOptions = { ...q.options }
      delete newOptions[keyToRemove]
      const newAnswers = { ...(q.correct_answer || {}) }
      delete newAnswers[keyToRemove]
      return { ...q, options: newOptions, correct_answer: newAnswers }
    }))
  }

  // --- MATCHING Helper functions ---
  function changeMatchingCount(idx, targetCount) {
    const count = Math.max(2, Math.min(10, targetCount))
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const currentLeft = q.options?.left || {}
      const currentRight = q.options?.right || {}
      const currentCorrect = q.correct_answer || {}
      const newLeft = {}
      const newRight = {}
      const newCorrect = {}

      for (let c = 0; c < count; c++) {
        const leftKey = String(c + 1)
        const rightKey = ALL_LETTERS[c]
        newLeft[leftKey] = currentLeft[leftKey] !== undefined ? currentLeft[leftKey] : ''
        newRight[rightKey] = currentRight[rightKey] !== undefined ? currentRight[rightKey] : ''
        const validRightKeys = ALL_LETTERS.slice(0, count)
        newCorrect[leftKey] = validRightKeys.includes(currentCorrect[leftKey]) ? currentCorrect[leftKey] : rightKey
      }
      return { ...q, options: { left: newLeft, right: newRight }, correct_answer: newCorrect }
    }))
  }

  function addMatchingPair(idx) {
    const q = questionItems[idx]
    const count = Object.keys(q.options?.left || {}).length
    if (count < 10) changeMatchingCount(idx, count + 1)
  }

  function removeMatchingPair(idx, leftKeyToRemove) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const currentLeftKeys = Object.keys(q.options?.left || {})
      if (currentLeftKeys.length <= 2) return q
      const removeIdx = currentLeftKeys.indexOf(leftKeyToRemove)
      if (removeIdx === -1) return q

      const leftVals = currentLeftKeys.filter(k => k !== leftKeyToRemove).map(k => q.options.left[k])
      const rightKeys = Object.keys(q.options?.right || {})
      const rightVals = rightKeys.filter((_, ri) => ri !== removeIdx).map(k => q.options.right[k])

      const newLeft = {}
      const newRight = {}
      const newCorrect = {}
      leftVals.forEach((val, vi) => {
        const lKey = String(vi + 1)
        const rKey = ALL_LETTERS[vi]
        newLeft[lKey] = val
        newRight[rKey] = rightVals[vi] || ''
        newCorrect[lKey] = rKey
      })
      return { ...q, options: { left: newLeft, right: newRight }, correct_answer: newCorrect }
    }))
  }

  function updateMatchingLeft(idx, key, val) {
    setQuestionItems(prev => prev.map((q, i) => i === idx ? {
      ...q,
      options: { ...q.options, left: { ...(q.options?.left || {}), [key]: val } }
    } : q))
  }

  function updateMatchingRight(idx, key, val) {
    setQuestionItems(prev => prev.map((q, i) => i === idx ? {
      ...q,
      options: { ...q.options, right: { ...(q.options?.right || {}), [key]: val } }
    } : q))
  }

  function updateMatchingAnswer(idx, leftKey, rightKey) {
    setQuestionItems(prev => prev.map((q, i) => i === idx ? {
      ...q,
      correct_answer: { ...(q.correct_answer || {}), [leftKey]: rightKey }
    } : q))
  }

  // --- SEQUENCING Helper functions ---
  function changeSequencingCount(idx, targetCount) {
    const count = Math.max(2, Math.min(10, targetCount))
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      let items = [...(q.options?.items || [])]
      if (items.length < count) {
        while (items.length < count) {
          items.push({ id: `seq_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`, text: '' })
        }
      } else {
        items = items.slice(0, count)
      }
      const itemIds = items.map(it => it.id)
      return { ...q, options: { items }, correct_answer: itemIds }
    }))
  }

  function addSequencingItem(idx) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const items = [...(q.options?.items || [])]
      if (items.length >= 10) return q
      const id = `seq_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
      items.push({ id, text: '' })
      return { ...q, options: { items }, correct_answer: items.map(it => it.id) }
    }))
  }

  function removeSequencingItem(idx, itemId) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const items = (q.options?.items || []).filter(it => it.id !== itemId)
      if (items.length < 2) return q
      return { ...q, options: { items }, correct_answer: items.map(it => it.id) }
    }))
  }

  function updateSequencingText(idx, itemId, text) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const items = (q.options?.items || []).map(it => it.id === itemId ? { ...it, text } : it)
      return { ...q, options: { items } }
    }))
  }

  function moveSequencingItem(idx, itemIdx, direction) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const items = [...(q.options?.items || [])]
      const targetIdx = itemIdx + direction
      if (targetIdx < 0 || targetIdx >= items.length) return q
      const temp = items[itemIdx]
      items[itemIdx] = items[targetIdx]
      items[targetIdx] = temp
      return { ...q, options: { items }, correct_answer: items.map(it => it.id) }
    }))
  }

  // --- AGREE_DISAGREE Helper functions ---
  function changeAgreeDisagreeCount(idx, targetCount) {
    const count = Math.max(1, Math.min(10, targetCount))
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const currentKeys = Object.keys(q.options || {})
      const newOptions = {}
      const newAnswers = {}
      for (let c = 0; c < count; c++) {
        const key = currentKeys[c] || `stmt_${Date.now()}_${c + 1}`
        newOptions[key] = q.options?.[key] || ''
        newAnswers[key] = q.correct_answer?.[key] || 'agree'
      }
      return { ...q, options: newOptions, correct_answer: newAnswers }
    }))
  }

  function addAgreeDisagreeStatement(idx) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const newKey = `stmt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
      return {
        ...q,
        options: { ...(q.options || {}), [newKey]: '' },
        correct_answer: { ...(q.correct_answer || {}), [newKey]: 'agree' }
      }
    }))
  }

  function removeAgreeDisagreeStatement(idx, keyToRemove) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const newOptions = { ...q.options }
      delete newOptions[keyToRemove]
      const newAnswers = { ...(q.correct_answer || {}) }
      delete newAnswers[keyToRemove]
      return { ...q, options: newOptions, correct_answer: newAnswers }
    }))
  }

  // --- Survey Option Helper functions ---
  function changeSurveyOptionsCount(idx, targetCount) {
    const count = Math.max(2, Math.min(10, targetCount))
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const currentKeys = Object.keys(q.options || {})
      const newOptions = {}
      const newOptionImages = {}
      for (let c = 0; c < count; c++) {
        const key = `opt_${c + 1}`
        newOptions[key] = q.options?.[currentKeys[c]] !== undefined ? q.options[currentKeys[c]] : (q.options?.[key] || '')
        if (q.option_images?.[key]) {
          newOptionImages[key] = q.option_images[key]
        } else if (q.option_images?.[currentKeys[c]]) {
          newOptionImages[key] = q.option_images[currentKeys[c]]
        }
      }
      return { ...q, options: newOptions, option_images: newOptionImages }
    }))
  }

  function addSurveyOption(idx) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const currentCount = Object.keys(q.options || {}).length
      if (currentCount >= 10) return q
      const nextKey = `opt_${currentCount + 1}`
      return { ...q, options: { ...(q.options || {}), [nextKey]: '' } }
    }))
  }

  function removeSurveyOption(idx, keyToRemove) {
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const currentKeys = Object.keys(q.options || {})
      if (currentKeys.length <= 2) return q
      const remainingValues = currentKeys.filter(k => k !== keyToRemove).map(k => q.options[k])
      const remainingImages = currentKeys.filter(k => k !== keyToRemove).map(k => q.option_images?.[k] || null)
      const newOptions = {}
      const newOptionImages = {}
      remainingValues.forEach((val, vi) => {
        const key = `opt_${vi + 1}`
        newOptions[key] = val
        if (remainingImages[vi]) {
          newOptionImages[key] = remainingImages[vi]
        }
      })
      return { ...q, options: newOptions, option_images: newOptionImages }
    }))
  }

  // --- Grid helpers ---
  function changeGridRowsCount(idx, targetCount) {
    const count = Math.max(1, Math.min(15, targetCount))
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const rows = [...(q.grid_rows || [])]
      if (rows.length < count) {
        while (rows.length < count) rows.push(`Baris ${rows.length + 1}`)
      } else {
        rows.splice(count)
      }
      return { ...q, grid_rows: rows }
    }))
  }

  function changeGridColsCount(idx, targetCount) {
    const count = Math.max(1, Math.min(10, targetCount))
    setQuestionItems(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const cols = [...(q.grid_columns || [])]
      if (cols.length < count) {
        while (cols.length < count) cols.push(`Kolom ${cols.length + 1}`)
      } else {
        cols.splice(count)
      }
      return { ...q, grid_columns: cols }
    }))
  }

  function addGridRow(idx) {
    setQuestionItems(prev => prev.map((q, i) => i === idx ? { ...q, grid_rows: [...(q.grid_rows || []), `Baris ${(q.grid_rows || []).length + 1}`] } : q))
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
    setQuestionItems(prev => prev.map((q, i) => i === idx ? { ...q, grid_columns: [...(q.grid_columns || []), `Kolom ${(q.grid_columns || []).length + 1}`] } : q))
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

  // --- Batch Apply Handlers (Exam Level) ---
  function applyOptionsCountToAllMcq(targetCount) {
    const count = Math.max(2, Math.min(10, targetCount))
    let affected = 0
    setQuestionItems(prev => prev.map(q => {
      if (['MCQ', 'COMPLEX_MCQ'].includes(q.type)) {
        affected++
        const currentKeys = Object.keys(q.options || {})
        const newOptions = {}
        for (let c = 0; c < count; c++) {
          const letter = ALL_LETTERS[c]
          newOptions[letter] = q.options?.[letter] !== undefined ? q.options[letter] : (q.options?.[currentKeys[c]] || '')
        }
        const keptLetters = ALL_LETTERS.slice(0, count)
        let newCorrect = q.correct_answer
        if (q.type === 'MCQ') {
          if (!keptLetters.includes(q.correct_answer)) newCorrect = 'A'
        } else if (q.type === 'COMPLEX_MCQ') {
          const currentArr = Array.isArray(q.correct_answer) ? q.correct_answer : []
          const filtered = currentArr.filter(k => keptLetters.includes(k))
          newCorrect = filtered.length > 0 ? filtered : ['A']
        }
        return { ...q, options: newOptions, correct_answer: newCorrect }
      }
      return q
    }))
    showNotice(`Standar ${count} Opsi (${ALL_LETTERS[0]}-${ALL_LETTERS[count - 1]}) berhasil diterapkan ke ${affected} butir soal Pilihan Ganda!`)
  }

  function applyStatementsCountToAllTf(targetCount) {
    const count = Math.max(1, Math.min(10, targetCount))
    let affected = 0
    setQuestionItems(prev => prev.map(q => {
      if (q.type === 'TRUE_FALSE') {
        affected++
        const currentKeys = Object.keys(q.options || {})
        const newOptions = {}
        const newAnswers = {}
        for (let c = 0; c < count; c++) {
          const key = currentKeys[c] || `stmt_${Date.now()}_${c + 1}`
          newOptions[key] = q.options?.[key] || ''
          newAnswers[key] = q.correct_answer?.[key] || 'true'
        }
        return { ...q, options: newOptions, correct_answer: newAnswers }
      }
      return q
    }))
    showNotice(`Standar ${count} Pernyataan berhasil diterapkan ke ${affected} butir soal Benar / Salah!`)
  }

  function applyMatchingCountToAll(targetCount) {
    const count = Math.max(2, Math.min(10, targetCount))
    let affected = 0
    setQuestionItems(prev => prev.map(q => {
      if (q.type === 'MATCHING') {
        affected++
        const currentLeft = q.options?.left || {}
        const currentRight = q.options?.right || {}
        const currentCorrect = q.correct_answer || {}
        const newLeft = {}
        const newRight = {}
        const newCorrect = {}
        for (let c = 0; c < count; c++) {
          const lKey = String(c + 1)
          const rKey = ALL_LETTERS[c]
          newLeft[lKey] = currentLeft[lKey] !== undefined ? currentLeft[lKey] : ''
          newRight[rKey] = currentRight[rKey] !== undefined ? currentRight[rKey] : ''
          const validRight = ALL_LETTERS.slice(0, count)
          newCorrect[lKey] = validRight.includes(currentCorrect[lKey]) ? currentCorrect[lKey] : rKey
        }
        return { ...q, options: { left: newLeft, right: newRight }, correct_answer: newCorrect }
      }
      return q
    }))
    showNotice(`Standar ${count} Pasang berhasil diterapkan ke ${affected} butir soal Menjodohkan!`)
  }

  function applySequencingCountToAll(targetCount) {
    const count = Math.max(2, Math.min(10, targetCount))
    let affected = 0
    setQuestionItems(prev => prev.map(q => {
      if (q.type === 'SEQUENCING') {
        affected++
        let items = [...(q.options?.items || [])]
        if (items.length < count) {
          while (items.length < count) {
            items.push({ id: `seq_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`, text: '' })
          }
        } else {
          items = items.slice(0, count)
        }
        return { ...q, options: { items }, correct_answer: items.map(it => it.id) }
      }
      return q
    }))
    showNotice(`Standar ${count} Langkah Urutan berhasil diterapkan ke ${affected} butir soal Mengurutkan!`)
  }

  function applyAgreeDisagreeCountToAll(targetCount) {
    const count = Math.max(1, Math.min(10, targetCount))
    let affected = 0
    setQuestionItems(prev => prev.map(q => {
      if (q.type === 'AGREE_DISAGREE') {
        affected++
        const currentKeys = Object.keys(q.options || {})
        const newOptions = {}
        const newAnswers = {}
        for (let c = 0; c < count; c++) {
          const key = currentKeys[c] || `stmt_${Date.now()}_${c + 1}`
          newOptions[key] = q.options?.[key] || ''
          newAnswers[key] = q.correct_answer?.[key] || 'agree'
        }
        return { ...q, options: newOptions, correct_answer: newAnswers }
      }
      return q
    }))
    showNotice(`Standar ${count} Pernyataan berhasil diterapkan ke ${affected} butir soal Setuju / Tidak Setuju!`)
  }

  function applySurveyOptionsCountToAll(targetCount) {
    const count = Math.max(2, Math.min(10, targetCount))
    let affected = 0
    setQuestionItems(prev => prev.map(q => {
      if (['MCQ', 'CHECKBOXES', 'DROPDOWN'].includes(q.type)) {
        affected++
        const currentKeys = Object.keys(q.options || {})
        const newOptions = {}
        for (let c = 0; c < count; c++) {
          const key = `opt_${c + 1}`
          newOptions[key] = q.options?.[currentKeys[c]] !== undefined ? q.options[currentKeys[c]] : (q.options?.[key] || '')
        }
        return { ...q, options: newOptions }
      }
      return q
    }))
    showNotice(`Standar ${count} Opsi berhasil diterapkan ke ${affected} pertanyaan pilihan survei!`)
  }

  function applySurveyGridCountsToAll(rowCount, colCount) {
    let affected = 0
    setQuestionItems(prev => prev.map(q => {
      if (['MCQ_GRID', 'CHECKBOX_GRID'].includes(q.type)) {
        affected++
        const rows = [...(q.grid_rows || [])]
        while (rows.length < rowCount) rows.push(`Baris ${rows.length + 1}`)
        rows.splice(rowCount)
        const cols = [...(q.grid_columns || [])]
        while (cols.length < colCount) cols.push(`Kolom ${cols.length + 1}`)
        cols.splice(colCount)
        return { ...q, grid_rows: rows, grid_columns: cols }
      }
      return q
    }))
    showNotice(`Standar kisi (${rowCount} Baris × ${colCount} Kolom) berhasil diterapkan ke ${affected} kisi survei!`)
  }

  function applyAllDefaults() {
    if (!isSurvey) {
      applyOptionsCountToAllMcq(defaultOptionsCount)
      applyStatementsCountToAllTf(defaultStatementsCount)
      applyMatchingCountToAll(defaultMatchingCount)
      applySequencingCountToAll(defaultSequencingCount)
      applyAgreeDisagreeCountToAll(defaultAgreeDisagreeCount)
      showNotice(`Standar opsi & butir soal berhasil diterapkan ke seluruh soal ujian!`)
    } else {
      applySurveyOptionsCountToAll(defaultSurveyOptionsCount)
      applySurveyGridCountsToAll(defaultGridRowsCount, defaultGridColsCount)
      showNotice(`Standar jumlah opsi survei berhasil diterapkan ke seluruh pertanyaan!`)
    }
  }

  async function handleSave(publish = false, customNavPath = null) {
    if (!title.trim()) {
      setError(isSurvey ? 'Judul survei harus diisi.' : 'Judul harus diisi.')
      setShowUnsavedModal(false)
      return false
    }
    
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
      if (q.type === 'MATCHING') {
        const leftKeys = Object.keys(q.options?.left || {})
        const rightKeys = Object.keys(q.options?.right || {})
        if (leftKeys.length < 2 || rightKeys.length < 2) {
          setError(`Soal no ${q.number} (Menjodohkan) harus memiliki minimal 2 pasang premis dan jawaban.`)
          return
        }
      }
      if (q.type === 'SEQUENCING') {
        const items = q.options?.items || []
        if (items.length < 2) {
          setError(`Soal no ${q.number} (Mengurutkan) harus memiliki minimal 2 langkah urutan.`)
          return
        }
      }
      if (q.type === 'AGREE_DISAGREE' && (!q.correct_answer || Object.keys(q.correct_answer).length === 0)) {
        setError(`Kunci jawaban soal no ${q.number} (Setuju/Tidak Setuju) belum lengkap.`)
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
        status: publish ? 'published' : 'draft',
        mode,
        quiz_timer_type: mode === 'quiz' ? quizTimerType : 'uniform',
        monitoring_level: isSurvey ? 0 : monitoringLevel,
        question_order: isSurvey ? 'ORDER' : questionOrder,
        default_options_count: Number(defaultOptionsCount) || 4,
        default_statements_count: Number(defaultStatementsCount) || 3,
        default_matching_count: Number(defaultMatchingCount) || 3,
        default_sequencing_count: Number(defaultSequencingCount) || 4,
        default_agree_disagree_count: Number(defaultAgreeDisagreeCount) || 3,
        default_survey_options_count: Number(defaultSurveyOptionsCount) || 4,
        default_grid_rows_count: Number(defaultGridRowsCount) || 3,
        default_grid_cols_count: Number(defaultGridColsCount) || 3,
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
        examData.created_by = user.id
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
        video_url: q.video_url || null,
        audio_url: q.audio_url || null,
        max_plays: Number(q.max_plays) || 1,
        allow_pause: Boolean(q.allow_pause),
        options: (q.type === 'ESSAY' || q.type === 'SHORT_ANSWER' || q.type === 'PARAGRAPH' || q.type === 'LINEAR_SCALE') ? null : (q.options || null),
        option_images: (q.option_images && Object.keys(q.option_images).length > 0) ? q.option_images : {},
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

      isSavedRef.current = true
      initialSnapshotRef.current = computeSnapshot()
      const destination = customNavPath || returnPath
      if (destination.startsWith('http://') || destination.startsWith('https://')) {
        window.location.href = destination
      } else {
        navigate(destination)
      }
      return true
    } catch (err) {
      setError('Gagal menyimpan: ' + err.message)
      setSaving(false)
      return false
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" style={{ width: 32, height: 32 }} /></div>

  const isIndependent = mode === 'quiz' && quizTimerType === 'independent'
  const modeLabel = isSurvey ? 'Survei' : mode === 'quiz' ? 'Kuis' : 'Ujian'
  const currentTypes = isSurvey ? SURVEY_TYPES : EXAM_TYPES

  return (
    <>
      {/* ─── FROZEN / STICKY ACTION HEADER BAR ─── */}
      <div className="page-header sticky-exam-header">
        <div className="sticky-exam-top-row">
          <div className="sticky-exam-title-group">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleBackClick}
              title="Kembali ke daftar ujian"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
            >
              <ChevronLeft size={16} />
              <span className="btn-back-text">Kembali</span>
            </button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {isEdit ? `Edit ${modeLabel}` : `Buat ${modeLabel} Baru`}
                </h2>
                {hasUnsavedChanges ? (
                  <span
                    className="badge badge-warning"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '0.15rem 0.55rem',
                      borderRadius: '999px',
                      background: '#fef3c7',
                      color: '#b45309',
                      border: '1px solid #fde68a'
                    }}
                    title="Ada perubahan yang belum disimpan ke server"
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d97706', display: 'inline-block' }} />
                    Belum Disimpan
                  </span>
                ) : (
                  <span
                    className="badge badge-success"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '0.15rem 0.55rem',
                      borderRadius: '999px',
                      background: '#ecfdf5',
                      color: '#047857',
                      border: '1px solid #a7f3d0'
                    }}
                    title="Semua draf dan pengaturan telah tersimpan"
                  >
                    <CheckCircle2 size={12} />
                    Tersimpan
                  </span>
                )}
              </div>
              <p className="text-muted text-sm" style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem' }}>
                {questionItems.length} {isSurvey ? 'pertanyaan' : 'soal'} · Mode: {modeLabel} {title ? `· "${title.length > 32 ? title.slice(0, 32) + '...' : title}"` : ''}
              </p>
            </div>
          </div>
          <div className="sticky-exam-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => handleSave(false)}
              disabled={saving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontWeight: 600,
                border: '1px solid var(--border)',
                background: '#ffffff',
              }}
              title="Simpan sebagai draf agar pekerjaan tidak hilang"
            >
              <Save size={15} />
              <span>{saving ? 'Menyimpan...' : 'Simpan Draft'}</span>
            </button>
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => handleSave(true)}
              disabled={saving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontWeight: 700,
                boxShadow: '0 2px 10px rgba(223, 174, 52, 0.35)'
              }}
              title="Publikasikan ujian sekarang"
            >
              <span>{saving ? 'Menyimpan...' : '🚀 Publikasikan'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        {/* ─── Lv.3 & Lv.4 Collapsible Control Toolbar ─── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '0.65rem 1rem',
          background: '#ffffff',
          borderRadius: '10px',
          border: '1px solid var(--border)',
          marginBottom: '1.25rem',
          boxShadow: '0 1px 4px rgba(27, 51, 97, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span className="badge badge-gold" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
              Kontrol Panel Lv.3 &amp; Lv.4
            </span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Klik judul tiap bagian untuk menciutkan atau membentangkan konten.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={collapseAllSections}
              style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem', border: '1px solid var(--border)' }}
              title="Ciutkan semua bagian agar kontrol ringkas"
            >
              <ChevronUp size={14} /> Ciutkan Semua
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={expandAllSections}
              style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem', border: '1px solid var(--border)' }}
              title="Bentangkan semua bagian"
            >
              <ChevronDown size={14} /> Bentangkan Semua
            </button>
          </div>
        </div>

        {/* Mode Selector — 3 modes */}
        <div className="card card-collapsible" style={{ marginBottom: '1.5rem' }}>
          <div
            className={`card-header card-header-clickable ${collapsedSections.mode ? 'collapsed' : ''}`}
            onClick={() => toggleSection('mode')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <BookOpen size={18} color="var(--gold)" />
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Mode Pelaksanaan &amp; Waktu</h3>
              {collapsedSections.mode && (
                <div className="section-summary-preview">
                  <span className="badge badge-active">{modeLabel}</span>
                  <span className="badge badge-outline">
                    {mode === 'quiz' ? (quizTimerType === 'uniform' ? `${uniformTime} dtk/soal` : 'Timer Fleksibel') : `${duration} Menit`}
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              className={`btn-collapse-toggle ${collapsedSections.mode ? 'collapsed' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                toggleSection('mode')
              }}
              title={collapsedSections.mode ? 'Bentangkan bagian ini' : 'Ciutkan bagian ini'}
            >
              <span>{collapsedSections.mode ? 'Bentangkan' : 'Ciutkan'}</span>
              {collapsedSections.mode ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
          </div>

          {!collapsedSections.mode && (
            <div className="card-collapsible-body" style={{ marginTop: '0.85rem' }}>
              <div className="mode-selector-grid">
                <button
                  type="button"
                  className={`btn ${mode === 'exam' ? 'btn-gold' : 'btn-ghost'} mode-selector-btn`}
                  onClick={() => handleModeChange('exam')}
                >
                  <div className="mode-btn-icon"><BookOpen size={20} /></div>
                  <div className="mode-btn-content">
                    <div className="mode-btn-title">Ujian</div>
                    <div className="mode-btn-desc">Timer global, PDF soal</div>
                  </div>
                </button>
                <button
                  type="button"
                  className={`btn ${mode === 'quiz' ? 'btn-gold' : 'btn-ghost'} mode-selector-btn`}
                  onClick={() => handleModeChange('quiz')}
                >
                  <div className="mode-btn-icon"><Zap size={20} /></div>
                  <div className="mode-btn-content">
                    <div className="mode-btn-title">Kuis</div>
                    <div className="mode-btn-desc">Timer per soal, maju satu arah</div>
                  </div>
                </button>
                <button
                  type="button"
                  className={`btn ${mode === 'survey' ? 'btn-gold' : 'btn-ghost'} mode-selector-btn`}
                  onClick={() => handleModeChange('survey')}
                >
                  <div className="mode-btn-icon"><ClipboardList size={20} /></div>
                  <div className="mode-btn-content">
                    <div className="mode-btn-title">Survei</div>
                    <div className="mode-btn-desc">Google Form, tanpa pengawasan</div>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
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
                  <div className="mode-suboptions-grid">
                    <label className="mode-suboption-pill" style={{
                      border: `2px solid ${quizTimerType === 'uniform' ? 'var(--gold)' : 'var(--border)'}`,
                      background: quizTimerType === 'uniform' ? 'rgba(245,158,11,0.05)' : 'transparent',
                    }}>
                      <input type="radio" name="quizTimerType" checked={quizTimerType === 'uniform'} onChange={() => setQuizTimerType('uniform')} />
                      <div className="pill-text">
                        <div className="pill-title">Waktu Seragam</div>
                        <div className="text-muted pill-desc">Semua soal punya waktu yang sama</div>
                      </div>
                    </label>
                    <label className="mode-suboption-pill" style={{
                      border: `2px solid ${quizTimerType === 'independent' ? 'var(--gold)' : 'var(--border)'}`,
                      background: quizTimerType === 'independent' ? 'rgba(245,158,11,0.05)' : 'transparent',
                    }}>
                      <input type="radio" name="quizTimerType" checked={quizTimerType === 'independent'} onChange={() => setQuizTimerType('independent')} />
                      <div className="pill-text">
                        <div className="pill-title">Waktu Independen</div>
                        <div className="text-muted pill-desc">Setiap soal punya waktu sendiri</div>
                      </div>
                    </label>
                  </div>
                  {quizTimerType === 'uniform' && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
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
                  <div className="mode-suboptions-grid" style={{ marginBottom: '1rem' }}>
                    <label className="mode-suboption-pill" style={{
                      border: `2px solid ${surveyType === 'one_time' ? 'var(--accent)' : 'var(--border)'}`,
                      background: surveyType === 'one_time' ? 'rgba(79,142,247,0.05)' : 'transparent',
                    }}>
                      <input type="radio" name="surveyType" checked={surveyType === 'one_time'} onChange={() => setSurveyType('one_time')} />
                      <div className="pill-text">
                        <div className="pill-title">Satu Kali</div>
                        <div className="text-muted pill-desc">Survei sekali pakai dengan masa berlaku</div>
                      </div>
                    </label>
                    <label className="mode-suboption-pill" style={{
                      border: `2px solid ${surveyType === 'scheduled' ? 'var(--accent)' : 'var(--border)'}`,
                      background: surveyType === 'scheduled' ? 'rgba(79,142,247,0.05)' : 'transparent',
                    }}>
                      <input type="radio" name="surveyType" checked={surveyType === 'scheduled'} onChange={() => setSurveyType('scheduled')} />
                      <div className="pill-text">
                        <div className="pill-title">Terjadwal</div>
                        <div className="text-muted pill-desc">Berulang dengan interval tertentu</div>
                      </div>
                    </label>
                  </div>

                  {/* Scheduled survey options */}
                  {surveyType === 'scheduled' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
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
          )}
        </div>

        {/* Monitoring Level Selector — hidden for surveys */}
        {!isSurvey && (
          <div className={`card card-collapsible ${collapsedSections.monitoring ? 'collapsed' : ''}`} style={{ marginBottom: '1.5rem' }}>
            <div 
              className={`card-header card-header-clickable ${collapsedSections.monitoring ? 'collapsed' : ''}`}
              onClick={() => toggleSection('monitoring')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                <MonitoringIcon level={monitoringLevel} size={22} />
                <h3 style={{ margin: 0 }}>Tingkat Pengawasan</h3>
                {collapsedSections.monitoring && (
                  <span className="section-summary-preview" style={{ color: (MONITORING_LEVELS[monitoringLevel] || MONITORING_LEVELS[1]).color }}>
                    Lv.{monitoringLevel} {(MONITORING_LEVELS[monitoringLevel] || MONITORING_LEVELS[1]).name}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {!collapsedSections.monitoring && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowMonitorInfo(!showMonitorInfo)
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
                  >
                    <Info size={14} /> Panduan
                    {showMonitorInfo ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
                <button
                  type="button"
                  className={`btn-collapse-toggle ${collapsedSections.monitoring ? 'collapsed' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSection('monitoring')
                  }}
                  title={collapsedSections.monitoring ? 'Bentangkan bagian ini' : 'Ciutkan bagian ini'}
                >
                  <span>{collapsedSections.monitoring ? 'Bentangkan' : 'Ciutkan'}</span>
                  {collapsedSections.monitoring ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                </button>
              </div>
            </div>

            {!collapsedSections.monitoring && (
              <div className="card-collapsible-body" style={{ marginTop: '0.85rem' }}>

                <div className="monitoring-level-grid">
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
                        minWidth: 0,
                        boxSizing: 'border-box',
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
                  background: (MONITORING_LEVELS[monitoringLevel] || MONITORING_LEVELS[1]).colorBg,
                  border: `1px solid ${(MONITORING_LEVELS[monitoringLevel] || MONITORING_LEVELS[1]).colorBorder}`,
                  fontSize: '0.83rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.5,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                    <MonitoringIcon level={monitoringLevel} size={18} />
                    <strong style={{ color: (MONITORING_LEVELS[monitoringLevel] || MONITORING_LEVELS[1]).color }}>
                      {(MONITORING_LEVELS[monitoringLevel] || MONITORING_LEVELS[1]).name}
                      {monitoringLevel === 4 && MONITORING_LEVELS[4]?.fullName && <span style={{ fontSize: '0.72rem', fontWeight: 400, marginLeft: '0.35rem', opacity: 0.8 }}>({MONITORING_LEVELS[4].fullName})</span>}
                    </strong>
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    {(MONITORING_LEVELS[monitoringLevel] || MONITORING_LEVELS[1]).description}
                  </p>
                </div>

                {showMonitorInfo && (
                  <div className="monitoring-guide-box">
                    <div className="monitoring-guide-header">
                      <h4>
                        <Info size={16} /> Panduan Tingkat Pengawasan
                      </h4>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}
                        onClick={() => setShowMonitorInfo(false)}
                      >
                        Tutup Panduan
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                      {Object.values(MONITORING_LEVELS).map(lvl => {
                        const guide = lvl.guide || {}
                        return (
                          <div key={lvl.id} className="monitoring-guide-card" style={{ borderLeft: `4px solid ${lvl.color}` }}>
                            <div className="monitoring-guide-level-title" style={{ color: lvl.color }}>
                              <MonitoringIcon level={lvl.id} size={18} />
                              <span>{guide.title || `Level ${lvl.id} - ${lvl.name}`}</span>
                            </div>

                            {/* Overview / Deskripsi Utama */}
                            <p className="monitoring-guide-text">
                              {guide.overview || lvl.description}
                            </p>

                            {/* Makna Filosofis (Khusus STRIX) */}
                            {guide.philosophy && (
                              <div className="monitoring-guide-philosophy">
                                <strong>Makna Filosofis:</strong> {guide.philosophy}
                              </div>
                            )}

                            {/* Ketentuan Sanksi */}
                            {guide.rules && guide.rules.length > 0 && (
                              <div style={{ marginTop: '0.625rem' }}>
                                {guide.rulesTitle && (
                                  <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.35rem', color: 'var(--text-primary)' }}>
                                    {guide.rulesTitle}
                                  </div>
                                )}
                                <div className="monitoring-guide-rules-list">
                                  {guide.rules.map((r, rIdx) => (
                                    <div key={rIdx} className="monitoring-guide-rule-item">
                                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                        {r.label}:
                                      </span>
                                      <span>{r.desc}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Basic info */}
        <div className={`card card-collapsible ${collapsedSections.info ? 'collapsed' : ''}`} style={{ marginBottom: '1.5rem' }}>
          <div 
            className={`card-header card-header-clickable ${collapsedSections.info ? 'collapsed' : ''}`}
            onClick={() => toggleSection('info')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
              <FileText size={20} color="var(--accent)" />
              <h3 style={{ margin: 0 }}>Informasi {modeLabel}</h3>
              {collapsedSections.info && (
                <span className="section-summary-preview">
                  {title || '(Belum ada judul)'} • {targetKelas.length === 0 ? 'Semua Kelas' : `${targetKelas.length} Kelas`}
                  {pdfUrl ? ' • PDF Google Drive' : ''}
                  {!isSurvey && passingGrade ? ` • KKM ${passingGrade}` : ''}
                </span>
              )}
            </div>
            <button
              type="button"
              className={`btn-collapse-toggle ${collapsedSections.info ? 'collapsed' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                toggleSection('info')
              }}
              title={collapsedSections.info ? 'Bentangkan bagian ini' : 'Ciutkan bagian ini'}
            >
              <span>{collapsedSections.info ? 'Bentangkan' : 'Ciutkan'}</span>
              {collapsedSections.info ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
          </div>

          {!collapsedSections.info && (
            <div className="card-collapsible-body">
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
          )}
        </div>

        {/* ═══════════════ EXAM-WIDE OPTIONS SETTINGS ═══════════════ */}
        <div className={`card card-collapsible ${collapsedSections.standards ? 'collapsed' : ''}`} style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--accent)' }}>
          <div 
            className={`card-header card-header-clickable ${collapsedSections.standards ? 'collapsed' : ''}`}
            onClick={() => toggleSection('standards')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsedSections.standards ? 0 : '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
              <Sliders size={18} color="var(--accent)" />
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                Standar Jumlah Opsi & Pernyataan {isSurvey ? 'Survei' : 'Ujian'}
              </h3>
              {collapsedSections.standards && (
                <span className="section-summary-preview">
                  {!isSurvey 
                    ? `PG: ${defaultOptionsCount} Opsi • B/S: ${defaultStatementsCount} • Jodoh: ${defaultMatchingCount}` 
                    : `Pilihan: ${defaultSurveyOptionsCount} Opsi • Kisi: ${defaultGridRowsCount}x${defaultGridColsCount}`}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {!collapsedSections.standards && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    applyAllDefaults()
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}
                  title="Terapkan seluruh standar default ke semua soal saat ini"
                >
                  <Zap size={14} /> Terapkan Standar ke Semua Soal
                </button>
              )}
              <button
                type="button"
                className={`btn-collapse-toggle ${collapsedSections.standards ? 'collapsed' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleSection('standards')
                }}
                title={collapsedSections.standards ? 'Bentangkan bagian ini' : 'Ciutkan bagian ini'}
              >
                <span>{collapsedSections.standards ? 'Bentangkan' : 'Ciutkan'}</span>
                {collapsedSections.standards ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              </button>
            </div>
          </div>

          {!collapsedSections.standards && (
            <div className="card-collapsible-body">
              <p className="text-muted text-xs" style={{ marginBottom: '1rem' }}>
                Atur standar jumlah opsi / butir untuk soal baru, atau terapkan ke seluruh butir soal yang sudah ada di paket ini.
              </p>

          {/* Action Notice banner */}
          {actionNotice && (
            <div className="alert alert-success" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.6rem 0.85rem' }}>
              <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{actionNotice}</span>
            </div>
          )}

          {!isSurvey ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1rem' }}>
              {/* MCQ & Complex MCQ default options setting */}
              <div style={{ padding: '0.875rem', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>
                    Pilihan Ganda & Multi-Jawab
                  </label>
                  <span className="badge badge-active" style={{ fontSize: '0.75rem' }}>
                    {defaultOptionsCount} Opsi ({ALL_LETTERS[0]}-{ALL_LETTERS[defaultOptionsCount - 1]})
                  </span>
                </div>
                <div className="text-muted text-xs" style={{ marginBottom: '0.625rem' }}>
                  Standar umum: 3 (SD: A-C), 4 (SMP: A-D), 5 (SMA/SMK/UTBK: A-E).
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  {[3, 4, 5, 6].map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      className={`btn btn-sm ${defaultOptionsCount === cnt ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
                      onClick={() => setDefaultOptionsCount(cnt)}
                    >
                      {cnt} Opsi ({ALL_LETTERS[0]}-{ALL_LETTERS[cnt - 1]})
                    </button>
                  ))}
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 6, marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '0.2rem 0.5rem', height: 26, fontSize: '0.85rem' }}
                      onClick={() => setDefaultOptionsCount(prev => Math.max(2, prev - 1))}
                      disabled={defaultOptionsCount <= 2}
                    >-</button>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{defaultOptionsCount}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '0.2rem 0.5rem', height: 26, fontSize: '0.85rem' }}
                      onClick={() => setDefaultOptionsCount(prev => Math.min(10, prev + 1))}
                      disabled={defaultOptionsCount >= 10}
                    >+</button>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', fontSize: '0.78rem', justifyContent: 'center', border: '1px dashed var(--accent)', color: 'var(--accent)' }}
                  onClick={() => applyOptionsCountToAllMcq(defaultOptionsCount)}
                  disabled={questionItems.filter(q => ['MCQ', 'COMPLEX_MCQ'].includes(q.type)).length === 0}
                >
                  <Zap size={13} /> Terapkan ke {questionItems.filter(q => ['MCQ', 'COMPLEX_MCQ'].includes(q.type)).length} Soal PG/Multi
                </button>
              </div>

              {/* True/False default statements setting */}
              <div style={{ padding: '0.875rem', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>
                    Benar / Salah (Pernyataan)
                  </label>
                  <span className="badge badge-active" style={{ fontSize: '0.75rem' }}>
                    {defaultStatementsCount} Pernyataan
                  </span>
                </div>
                <div className="text-muted text-xs" style={{ marginBottom: '0.625rem' }}>
                  Jumlah baris pernyataan yang dinilai Benar atau Salah per soal.
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  {[2, 3, 4, 5].map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      className={`btn btn-sm ${defaultStatementsCount === cnt ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
                      onClick={() => setDefaultStatementsCount(cnt)}
                    >
                      {cnt} Baris
                    </button>
                  ))}
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 6, marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '0.2rem 0.5rem', height: 26, fontSize: '0.85rem' }}
                      onClick={() => setDefaultStatementsCount(prev => Math.max(1, prev - 1))}
                      disabled={defaultStatementsCount <= 1}
                    >-</button>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{defaultStatementsCount}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '0.2rem 0.5rem', height: 26, fontSize: '0.85rem' }}
                      onClick={() => setDefaultStatementsCount(prev => Math.min(10, prev + 1))}
                      disabled={defaultStatementsCount >= 10}
                    >+</button>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', fontSize: '0.78rem', justifyContent: 'center', border: '1px dashed var(--accent)', color: 'var(--accent)' }}
                  onClick={() => applyStatementsCountToAllTf(defaultStatementsCount)}
                  disabled={questionItems.filter(q => q.type === 'TRUE_FALSE').length === 0}
                >
                  <Zap size={13} /> Terapkan ke {questionItems.filter(q => q.type === 'TRUE_FALSE').length} Soal Benar/Salah
                </button>
              </div>

              {/* Matching default pairs setting */}
              <div style={{ padding: '0.875rem', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>
                    Menjodohkan (Matching)
                  </label>
                  <span className="badge badge-active" style={{ fontSize: '0.75rem' }}>
                    {defaultMatchingCount} Pasang
                  </span>
                </div>
                <div className="text-muted text-xs" style={{ marginBottom: '0.625rem' }}>
                  Jumlah pasang premis (kiri) & pilihan jawaban (kanan) default.
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  {[2, 3, 4, 5].map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      className={`btn btn-sm ${defaultMatchingCount === cnt ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
                      onClick={() => setDefaultMatchingCount(cnt)}
                    >
                      {cnt} Pasang
                    </button>
                  ))}
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 6, marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '0.2rem 0.5rem', height: 26, fontSize: '0.85rem' }}
                      onClick={() => setDefaultMatchingCount(prev => Math.max(2, prev - 1))}
                      disabled={defaultMatchingCount <= 2}
                    >-</button>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{defaultMatchingCount}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '0.2rem 0.5rem', height: 26, fontSize: '0.85rem' }}
                      onClick={() => setDefaultMatchingCount(prev => Math.min(10, prev + 1))}
                      disabled={defaultMatchingCount >= 10}
                    >+</button>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', fontSize: '0.78rem', justifyContent: 'center', border: '1px dashed var(--accent)', color: 'var(--accent)' }}
                  onClick={() => applyMatchingCountToAll(defaultMatchingCount)}
                  disabled={questionItems.filter(q => q.type === 'MATCHING').length === 0}
                >
                  <Zap size={13} /> Terapkan ke {questionItems.filter(q => q.type === 'MATCHING').length} Soal Menjodohkan
                </button>
              </div>

              {/* Sequencing default steps setting */}
              <div style={{ padding: '0.875rem', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>
                    Mengurutkan (Sequencing)
                  </label>
                  <span className="badge badge-active" style={{ fontSize: '0.75rem' }}>
                    {defaultSequencingCount} Langkah
                  </span>
                </div>
                <div className="text-muted text-xs" style={{ marginBottom: '0.625rem' }}>
                  Jumlah langkah / tahapan kronologi yang perlu diurutkan siswa.
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  {[3, 4, 5, 6].map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      className={`btn btn-sm ${defaultSequencingCount === cnt ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
                      onClick={() => setDefaultSequencingCount(cnt)}
                    >
                      {cnt} Langkah
                    </button>
                  ))}
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 6, marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '0.2rem 0.5rem', height: 26, fontSize: '0.85rem' }}
                      onClick={() => setDefaultSequencingCount(prev => Math.max(2, prev - 1))}
                      disabled={defaultSequencingCount <= 2}
                    >-</button>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{defaultSequencingCount}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '0.2rem 0.5rem', height: 26, fontSize: '0.85rem' }}
                      onClick={() => setDefaultSequencingCount(prev => Math.min(10, prev + 1))}
                      disabled={defaultSequencingCount >= 10}
                    >+</button>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', fontSize: '0.78rem', justifyContent: 'center', border: '1px dashed var(--accent)', color: 'var(--accent)' }}
                  onClick={() => applySequencingCountToAll(defaultSequencingCount)}
                  disabled={questionItems.filter(q => q.type === 'SEQUENCING').length === 0}
                >
                  <Zap size={13} /> Terapkan ke {questionItems.filter(q => q.type === 'SEQUENCING').length} Soal Mengurutkan
                </button>
              </div>

              {/* Agree / Disagree default statements setting */}
              <div style={{ padding: '0.875rem', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>
                    Setuju / Tidak Setuju
                  </label>
                  <span className="badge badge-active" style={{ fontSize: '0.75rem' }}>
                    {defaultAgreeDisagreeCount} Pernyataan
                  </span>
                </div>
                <div className="text-muted text-xs" style={{ marginBottom: '0.625rem' }}>
                  Jumlah butir pernyataan opini/evaluasi Setuju atau Tidak Setuju.
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  {[2, 3, 4, 5].map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      className={`btn btn-sm ${defaultAgreeDisagreeCount === cnt ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
                      onClick={() => setDefaultAgreeDisagreeCount(cnt)}
                    >
                      {cnt} Baris
                    </button>
                  ))}
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 6, marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '0.2rem 0.5rem', height: 26, fontSize: '0.85rem' }}
                      onClick={() => setDefaultAgreeDisagreeCount(prev => Math.max(1, prev - 1))}
                      disabled={defaultAgreeDisagreeCount <= 1}
                    >-</button>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{defaultAgreeDisagreeCount}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '0.2rem 0.5rem', height: 26, fontSize: '0.85rem' }}
                      onClick={() => setDefaultAgreeDisagreeCount(prev => Math.min(10, prev + 1))}
                      disabled={defaultAgreeDisagreeCount >= 10}
                    >+</button>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', fontSize: '0.78rem', justifyContent: 'center', border: '1px dashed var(--accent)', color: 'var(--accent)' }}
                  onClick={() => applyAgreeDisagreeCountToAll(defaultAgreeDisagreeCount)}
                  disabled={questionItems.filter(q => q.type === 'AGREE_DISAGREE').length === 0}
                >
                  <Zap size={13} /> Terapkan ke {questionItems.filter(q => q.type === 'AGREE_DISAGREE').length} Soal Setuju/Tidak Setuju
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1rem' }}>
              {/* Survey choice options setting */}
              <div style={{ padding: '0.875rem', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>
                    Pilihan Ganda, Checkbox, & Dropdown
                  </label>
                  <span className="badge badge-active" style={{ fontSize: '0.75rem' }}>
                    {defaultSurveyOptionsCount} Opsi
                  </span>
                </div>
                <div className="text-muted text-xs" style={{ marginBottom: '0.625rem' }}>
                  Jumlah opsi default untuk butir pertanyaan pilihan baru pada survei.
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  {[2, 3, 4, 5].map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      className={`btn btn-sm ${defaultSurveyOptionsCount === cnt ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
                      onClick={() => setDefaultSurveyOptionsCount(cnt)}
                    >
                      {cnt} Opsi
                    </button>
                  ))}
                  <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 6, marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '0.2rem 0.5rem', height: 26, fontSize: '0.85rem' }}
                      onClick={() => setDefaultSurveyOptionsCount(prev => Math.max(2, prev - 1))}
                      disabled={defaultSurveyOptionsCount <= 2}
                    >-</button>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{defaultSurveyOptionsCount}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '0.2rem 0.5rem', height: 26, fontSize: '0.85rem' }}
                      onClick={() => setDefaultSurveyOptionsCount(prev => Math.min(10, prev + 1))}
                      disabled={defaultSurveyOptionsCount >= 10}
                    >+</button>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', fontSize: '0.78rem', justifyContent: 'center', border: '1px dashed var(--accent)', color: 'var(--accent)' }}
                  onClick={() => applySurveyOptionsCountToAll(defaultSurveyOptionsCount)}
                  disabled={questionItems.filter(q => ['MCQ', 'CHECKBOXES', 'DROPDOWN'].includes(q.type)).length === 0}
                >
                  <Zap size={13} /> Terapkan ke {questionItems.filter(q => ['MCQ', 'CHECKBOXES', 'DROPDOWN'].includes(q.type)).length} Pertanyaan Pilihan
                </button>
              </div>

              {/* Survey grid default rows & cols setting */}
              <div style={{ padding: '0.875rem', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label className="form-label" style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>
                    Kisi Survei (Baris & Kolom)
                  </label>
                  <span className="badge badge-active" style={{ fontSize: '0.75rem' }}>
                    {defaultGridRowsCount} Baris × {defaultGridColsCount} Kolom
                  </span>
                </div>
                <div className="text-muted text-xs" style={{ marginBottom: '0.625rem' }}>
                  Ukuran matriks baris pertanyaan dan pilihan kolom kisi survei.
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--navy-mid)', padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Baris:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0.1rem 0.4rem', height: 22 }} onClick={() => setDefaultGridRowsCount(p => Math.max(1, p - 1))}>-</button>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{defaultGridRowsCount}</span>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0.1rem 0.4rem', height: 22 }} onClick={() => setDefaultGridRowsCount(p => Math.min(15, p + 1))}>+</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--navy-mid)', padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Kolom:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0.1rem 0.4rem', height: 22 }} onClick={() => setDefaultGridColsCount(p => Math.max(1, p - 1))}>-</button>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{defaultGridColsCount}</span>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0.1rem 0.4rem', height: 22 }} onClick={() => setDefaultGridColsCount(p => Math.min(10, p + 1))}>+</button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', fontSize: '0.78rem', justifyContent: 'center', border: '1px dashed var(--accent)', color: 'var(--accent)' }}
                  onClick={() => applySurveyGridCountsToAll(defaultGridRowsCount, defaultGridColsCount)}
                  disabled={questionItems.filter(q => ['MCQ_GRID', 'CHECKBOX_GRID'].includes(q.type)).length === 0}
                >
                  <Zap size={13} /> Terapkan ke {questionItems.filter(q => ['MCQ_GRID', 'CHECKBOX_GRID'].includes(q.type)).length} Kisi Survei
                </button>
              </div>
            </div>
          )}
            </div>
          )}
        </div>

        {/* Questions Header Toolbar */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '0.75rem', 
          padding: '0.75rem 1.25rem', 
          background: 'var(--surface)', 
          borderRadius: 10, 
          border: '1px solid var(--border)' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Layers size={18} color="var(--accent)" />
            <h3 style={{ margin: 0, fontSize: '1rem' }}>
              {isSurvey ? 'Daftar Pertanyaan' : 'Daftar Butir Soal'}
            </h3>
            <span className="badge badge-active" style={{ fontSize: '0.75rem' }}>
              {questionItems.length} {isSurvey ? 'Butir' : 'Soal'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={collapseAllQuestions}
              style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              title="Ciutkan semua butir soal"
            >
              <ChevronUp size={14} /> Ciutkan Semua Soal
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={expandAllQuestions}
              style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              title="Bentangkan semua butir soal"
            >
              <ChevronDown size={14} /> Bentangkan Semua Soal
            </button>
          </div>
        </div>

        {/* Questions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {questionItems.map((q, idx) => {
            const currentTypes = isSurvey ? SURVEY_TYPES : EXAM_TYPES
            const isQuestionCollapsed = !!collapsedQuestions[idx]
            return (
            <div key={idx} className={`card card-collapsible ${isQuestionCollapsed ? 'collapsed' : ''}`} style={{ transition: 'all 0.2s ease' }}>
              <div 
                className={`card-header-clickable ${isQuestionCollapsed ? 'collapsed' : ''}`}
                onClick={() => toggleQuestion(idx)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  marginBottom: isQuestionCollapsed ? 0 : '1rem', 
                  flexWrap: 'wrap', 
                  gap: '0.625rem',
                  padding: isQuestionCollapsed ? '0.75rem 1rem' : '0 0 0.875rem 0',
                  borderBottom: isQuestionCollapsed ? 'none' : '1px solid var(--border)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flex: 1, minWidth: 200, flexWrap: 'wrap' }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 6,
                    background: isQuestionCollapsed ? 'var(--navy-mid)' : 'var(--accent)',
                    color: isQuestionCollapsed ? 'var(--accent)' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.82rem', flexShrink: 0
                  }}>
                    {q.number}
                  </div>
                  <h3 style={{ fontSize: '0.95rem', margin: 0 }}>{isSurvey ? 'Pertanyaan' : 'Soal'} #{q.number}</h3>

                  {isQuestionCollapsed ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flex: 1 }}>
                      <span className="badge badge-active" style={{ fontSize: '0.72rem' }}>
                        {TYPE_LABELS[q.type] || q.type}
                      </span>
                      {!isSurvey && (
                        <span className="badge badge-draft" style={{ fontSize: '0.72rem' }}>
                          {q.points || 1} Poin
                        </span>
                      )}
                      <span style={{ 
                        fontSize: '0.8rem', 
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 380
                      }}>
                        {q.question_text ? (q.question_text.length > 55 ? q.question_text.substring(0, 55) + '...' : q.question_text) : '— (Belum ada teks)'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted text-xs" style={{ fontWeight: 400 }}>
                      ({TYPE_LABELS[q.type] || q.type})
                    </span>
                  )}
                </div>

                <div 
                  style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
                  onClick={e => e.stopPropagation()}
                >
                  <select className="form-input" style={{ width: 'auto', fontSize: '0.82rem', padding: '0.35rem 0.75rem' }} value={q.type} onChange={e => {
                    const newType = e.target.value
                    const updates = { type: newType }
                    // Initialize options for types that need them
                    if (['MCQ', 'COMPLEX_MCQ'].includes(newType)) {
                      const currentCount = Object.keys(q.options || {}).length
                      const count = (currentCount >= 2 && currentCount <= 10) ? currentCount : defaultOptionsCount
                      const newOpts = {}
                      for (let c = 0; c < count; c++) {
                        const letter = ALL_LETTERS[c]
                        newOpts[letter] = q.options?.[letter] || ''
                      }
                      updates.options = newOpts
                      if (newType === 'MCQ') {
                        updates.correct_answer = Object.keys(newOpts).includes(q.correct_answer) ? q.correct_answer : 'A'
                      } else {
                        const currentArr = Array.isArray(q.correct_answer) ? q.correct_answer : []
                        const filtered = currentArr.filter(k => Object.keys(newOpts).includes(k))
                        updates.correct_answer = filtered.length > 0 ? filtered : ['A']
                      }
                    } else if (newType === 'TRUE_FALSE') {
                      const currentCount = Object.keys(q.options || {}).length
                      const count = (currentCount >= 1 && currentCount <= 10) ? currentCount : defaultStatementsCount
                      const newOpts = {}
                      const newAns = {}
                      const oldKeys = Object.keys(q.options || {})
                      for (let c = 0; c < count; c++) {
                        const key = oldKeys[c] || `stmt_${Date.now()}_${c + 1}`
                        newOpts[key] = q.options?.[key] || ''
                        newAns[key] = q.correct_answer?.[key] || 'true'
                      }
                      updates.options = newOpts
                      updates.correct_answer = newAns
                    } else if (newType === 'MATCHING') {
                      const count = (q.options?.left && Object.keys(q.options.left).length >= 2)
                        ? Object.keys(q.options.left).length
                        : defaultMatchingCount
                      const m = makeMatching(count)
                      updates.options = m.options
                      updates.correct_answer = m.correct_answer
                    } else if (newType === 'SEQUENCING') {
                      const count = (q.options?.items && q.options.items.length >= 2)
                        ? q.options.items.length
                        : defaultSequencingCount
                      const s = makeSequencing(count)
                      updates.options = s.options
                      updates.correct_answer = s.correct_answer
                    } else if (newType === 'AGREE_DISAGREE') {
                      const count = (q.options && Object.keys(q.options).length >= 1 && !q.options.left && !q.options.items)
                        ? Object.keys(q.options).length
                        : defaultAgreeDisagreeCount
                      const ad = makeAgreeDisagree(count)
                      updates.options = ad.options
                      updates.correct_answer = ad.correct_answer
                    } else if (['MCQ', 'CHECKBOXES', 'DROPDOWN'].includes(newType) && isSurvey) {
                      const currentCount = Object.keys(q.options || {}).length
                      const count = (currentCount >= 2 && currentCount <= 10) ? currentCount : defaultSurveyOptionsCount
                      const newOpts = {}
                      const oldKeys = Object.keys(q.options || {})
                      for (let c = 0; c < count; c++) {
                        const key = `opt_${c + 1}`
                        newOpts[key] = q.options?.[oldKeys[c]] || ''
                      }
                      updates.options = newOpts
                    } else if (['MCQ_GRID', 'CHECKBOX_GRID'].includes(newType)) {
                      if (!q.grid_rows?.length) updates.grid_rows = makeGridRows(defaultGridRowsCount)
                      if (!q.grid_columns?.length) updates.grid_columns = makeGridColumns(defaultGridColsCount)
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
                    <button 
                      type="button" 
                      className="btn btn-danger btn-sm" 
                      onClick={(e) => {
                        e.stopPropagation()
                        removeQuestion(idx)
                      }}
                      title="Hapus soal"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}

                  <button
                    type="button"
                    className={`btn-collapse-toggle ${isQuestionCollapsed ? 'collapsed' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleQuestion(idx)
                    }}
                    title={isQuestionCollapsed ? 'Bentangkan butir soal ini' : 'Ciutkan butir soal ini'}
                  >
                    <span>{isQuestionCollapsed ? 'Bentangkan' : 'Ciutkan'}</span>
                    {isQuestionCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>
                </div>
              </div>

              {!isQuestionCollapsed && (
                <div className="card-collapsible-body">

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

              {/* Media Lampiran Soal (Kombinasi Gambar, Video & Audio CBT dalam 1 tombol 'Lampirkan File' yang dapat di-expand) */}
              {!isSurvey && (() => {
                const isAttachmentOpen = Boolean(expandedAttachments[idx])
                const hasImg = Boolean(q.image_url)
                const hasVid = Boolean(q.video_url)
                const hasAud = Boolean(q.audio_url)
                const totalAttached = (hasImg ? 1 : 0) + (hasVid ? 1 : 0) + (hasAud ? 1 : 0)

                return (
                  <div style={{ marginBottom: '1.25rem' }}>
                    {/* Tombol Utama: Lampirkan File */}
                    <div className={`attachment-toggle-bar ${isAttachmentOpen ? 'is-expanded' : ''} ${totalAttached > 0 ? 'has-attachments' : ''}`}>
                      <button
                        type="button"
                        className="attachment-main-btn"
                        onClick={() => toggleAttachment(idx)}
                        title={isAttachmentOpen ? 'Ciutkan lampiran file' : 'Bentangkan lampiran file'}
                      >
                        <div className="attachment-icon-bubble">
                          <Paperclip size={15} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span className="attachment-title">
                            Lampirkan File
                          </span>

                          {totalAttached === 0 ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                              (Gambar, Video, atau Audio CBT)
                            </span>
                          ) : (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                              {hasImg && (
                                <span className="attachment-badge-pill" title="Lampiran Gambar aktif">
                                  <ImageIcon size={11} /> Gambar
                                </span>
                              )}
                              {hasVid && (
                                <span className="attachment-badge-pill" title="Lampiran Video aktif">
                                  <Video size={11} /> Video
                                </span>
                              )}
                              {hasAud && (
                                <span className="attachment-badge-pill" title="Lampiran Audio CBT aktif">
                                  <Headphones size={11} /> Audio CBT
                                </span>
                              )}
                              <span style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 600, marginLeft: '0.15rem' }}>
                                • {totalAttached} file terlampir
                              </span>
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Tombol Aksi Kanan (Buka / Tutup) */}
                      <div className="attachment-toggle-action">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => toggleAttachment(idx)}
                          style={{
                            height: '30px',
                            padding: '0 0.55rem',
                            fontSize: '0.75rem',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            color: isAttachmentOpen ? 'var(--primary)' : 'var(--text-secondary)',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <span>{isAttachmentOpen ? 'Tutup Lampiran' : (totalAttached > 0 ? 'Kelola Lampiran' : 'Buka Lampiran')}</span>
                          {isAttachmentOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* Panel Terbuka: Menampilkan 3 Tipe Lampiran Soal */}
                    {isAttachmentOpen && (
                      <div className="attachment-panel">
                        {/* Header Panel */}
                        <div className="attachment-panel-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <Paperclip size={14} style={{ color: 'var(--accent)' }} />
                            <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                              3 Tipe Lampiran Soal:
                            </span>
                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                              Pilih tipe media yang ingin ditambahkan (Gambar, Video, atau Audio Listening).
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => shrinkAttachment(idx)}
                            style={{
                              height: '24px',
                              padding: '0 0.4rem',
                              fontSize: '0.72rem',
                              borderRadius: '4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                              color: 'var(--text-muted)'
                            }}
                            title="Ciutkan panel lampiran file"
                          >
                            <X size={12} />
                            <span>Ciutkan</span>
                          </button>
                        </div>

                        {/* 3 Kolom Lampiran (Gambar, Video, Audio) */}
                        <div 
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '0.875rem',
                            alignItems: 'stretch'
                          }}
                        >
                          {/* Tipe 1: Lampiran Gambar */}
                          <div
                            style={{
                              margin: 0,
                              padding: '0.875rem 1rem',
                              background: '#ffffff',
                              borderRadius: '8px',
                              border: q.image_url ? '1.5px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border)',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: '0.625rem',
                              boxSizing: 'border-box'
                            }}
                          >
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <label style={{ fontSize: '0.82rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-primary)' }}>
                                <ImageIcon size={15} style={{ color: 'var(--accent)' }} />
                                1. Lampiran Gambar <span className="text-muted text-xs" style={{ fontWeight: 400 }}>(opsional)</span>
                              </label>
                              {q.image_url ? (
                                <span className="badge badge-active" style={{ fontSize: '0.7rem' }}>Terlampir</span>
                              ) : (
                                <span className="badge badge-draft" style={{ fontSize: '0.7rem' }}>Kosong</span>
                              )}
                            </div>

                            {/* Baris Input & Tombol */}
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                              <input
                                className="form-input"
                                style={{ fontSize: '0.82rem', width: '100%', height: '36px', padding: '0.4rem 0.65rem', borderRadius: '6px', flex: 1, minWidth: 0 }}
                                value={q.image_url || ''}
                                onChange={e => updateQuestion(idx, 'image_url', e.target.value)}
                                placeholder="https://drive.google.com/file/d/... atau URL gambar"
                                disabled={!!pdfUrl}
                              />
                              {q.image_url && (
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  onClick={() => updateQuestion(idx, 'image_url', '')}
                                  style={{
                                    height: '36px',
                                    padding: '0 0.65rem',
                                    fontSize: '0.75rem',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                    color: 'var(--danger)',
                                    background: '#ffffff',
                                    whiteSpace: 'nowrap',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    flexShrink: 0
                                  }}
                                  title="Hapus gambar"
                                >
                                  <Trash2 size={13} />
                                  <span>Hapus</span>
                                </button>
                              )}
                            </div>

                            {/* Baris Info / Status (Seragam tinggi 36px) */}
                            <div
                              style={{
                                height: '36px',
                                padding: '0 0.65rem',
                                background: 'var(--navy-light)',
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.5rem',
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                boxSizing: 'border-box'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflow: 'hidden' }}>
                                <Info size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {!!pdfUrl ? 'Dinonaktifkan saat lembar PDF aktif.' : 'Format: PNG, JPG, WebP (akses publik).'}
                                </span>
                              </div>
                              {q.image_url && !pdfUrl && (
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--success)', flexShrink: 0 }}>
                                  ✓ Siap
                                </span>
                              )}
                            </div>

                            {q.image_url && !pdfUrl && (
                              <div style={{ padding: '0.4rem', background: 'var(--navy-light)', borderRadius: 6, border: '1px solid var(--border)', textAlign: 'center' }}>
                                <img 
                                  src={getDriveImageUrl(q.image_url)} 
                                  alt={`Pratinjau Lampiran Gambar Soal ${q.number}`} 
                                  referrerPolicy="no-referrer"
                                  style={{ maxHeight: 90, maxWidth: '100%', objectFit: 'contain', borderRadius: 4, margin: '0 auto' }}
                                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                                />
                              </div>
                            )}
                          </div>

                          {/* Tipe 2: Lampiran Video */}
                          <div
                            style={{
                              margin: 0,
                              padding: '0.875rem 1rem',
                              background: '#ffffff',
                              borderRadius: '8px',
                              border: q.video_url ? '1.5px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border)',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: '0.625rem',
                              boxSizing: 'border-box'
                            }}
                          >
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <label style={{ fontSize: '0.82rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-primary)' }}>
                                <Video size={15} style={{ color: 'var(--accent)' }} />
                                2. Lampiran Video <span className="text-muted text-xs" style={{ fontWeight: 400 }}>(opsional)</span>
                              </label>
                              {q.video_url ? (
                                <span className="badge badge-active" style={{ fontSize: '0.7rem' }}>Terlampir</span>
                              ) : (
                                <span className="badge badge-draft" style={{ fontSize: '0.7rem' }}>Kosong</span>
                              )}
                            </div>

                            {/* Baris Input & Tombol */}
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                              <input
                                className="form-input"
                                style={{ fontSize: '0.82rem', width: '100%', height: '36px', padding: '0.4rem 0.65rem', borderRadius: '6px', flex: 1, minWidth: 0 }}
                                value={q.video_url || ''}
                                onChange={e => updateQuestion(idx, 'video_url', e.target.value)}
                                placeholder="YouTube, Google Drive, atau URL MP4..."
                                disabled={!!pdfUrl}
                              />
                              {q.video_url && (
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  onClick={() => updateQuestion(idx, 'video_url', '')}
                                  style={{
                                    height: '36px',
                                    padding: '0 0.65rem',
                                    fontSize: '0.75rem',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                    color: 'var(--danger)',
                                    background: '#ffffff',
                                    whiteSpace: 'nowrap',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    flexShrink: 0
                                  }}
                                  title="Hapus video"
                                >
                                  <Trash2 size={13} />
                                  <span>Hapus</span>
                                </button>
                              )}
                            </div>

                            {/* Baris Info / Status (Seragam tinggi 36px) */}
                            <div
                              style={{
                                height: '36px',
                                padding: '0 0.65rem',
                                background: 'var(--navy-light)',
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.5rem',
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                boxSizing: 'border-box'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflow: 'hidden' }}>
                                <Info size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {!!pdfUrl ? 'Dinonaktifkan saat lembar PDF aktif.' : 'YouTube, Google Drive, Vimeo, MP4.'}
                                </span>
                              </div>
                              {q.video_url && !pdfUrl && (
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--success)', flexShrink: 0 }}>
                                  ✓ Siap
                                </span>
                              )}
                            </div>

                            {/* Pratinjau Video */}
                            {q.video_url && !pdfUrl && (
                              <div style={{ padding: '0.4rem', background: 'var(--navy-light)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                <QuestionVideoPlayer videoUrl={q.video_url} maxHeight={120} showTitle={false} />
                              </div>
                            )}
                          </div>

                          {/* Tipe 3: Modul Audio Listening CBT (TOEFL / IELTS) */}
                          <div style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
                            <QuestionAudioInput
                              questionId={q.id || `temp-q-${idx}`}
                              initialAudioUrl={q.audio_url || ''}
                              initialMaxPlays={q.max_plays || 1}
                              initialAllowPause={Boolean(q.allow_pause)}
                              onAudioSynced={({ audioUrl, maxPlays, allowPause }) => {
                                setQuestionItems(prev => prev.map((item, i) => i === idx ? {
                                  ...item,
                                  audio_url: audioUrl,
                                  max_plays: maxPlays,
                                  allow_pause: allowPause
                                } : item))
                              }}
                            />
                          </div>
                        </div>

                        {/* Footer Aksi Panel: Selesai & Ciutkan */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.625rem', borderTop: '1px solid var(--border)' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => shrinkAttachment(idx)}
                            style={{
                              padding: '0.35rem 0.85rem',
                              fontSize: '0.78rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              borderRadius: '6px'
                            }}
                            title="Selesai mengatur lampiran dan ciutkan panel ini"
                          >
                            <CheckCircle2 size={13} />
                            <span>Selesai & Ciutkan Lampiran</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}


              {/* ═══════════════ SURVEY QUESTION TYPE EDITORS ═══════════════ */}
              {isSurvey && q.type === 'SHORT_ANSWER' && (
                <div className="alert alert-info text-sm" style={{ opacity: 0.85 }}>
                  📝 Responden akan melihat kolom teks satu baris untuk menjawab pertanyaan ini secara bebas (tanpa opsi pilihan).
                </div>
              )}

              {isSurvey && q.type === 'PARAGRAPH' && (
                <div className="alert alert-info text-sm" style={{ opacity: 0.85 }}>
                  📝 Responden akan melihat kolom teks multi-baris (paragraf) untuk jawaban panjang secara bebas (tanpa opsi pilihan).
                </div>
              )}

              {isSurvey && q.type === 'LINEAR_SCALE' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Scale Presets Toolbar */}
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)',
                    gap: '0.5rem'
                  }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Rentang Skala Pilihan:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {[
                        { label: '1 - 5 (5 poin)', min: 1, max: 5 },
                        { label: '1 - 7 (7 poin)', min: 1, max: 7 },
                        { label: '1 - 10 (10 poin)', min: 1, max: 10 },
                        { label: '0 - 10 (11 poin)', min: 0, max: 10 },
                      ].map(preset => (
                        <button
                          key={preset.label}
                          type="button"
                          className={`btn btn-sm ${q.scale_min === preset.min && q.scale_max === preset.max ? 'btn-primary' : 'btn-ghost'}`}
                          style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', height: 24 }}
                          onClick={() => {
                            updateQuestion(idx, 'scale_min', preset.min)
                            updateQuestion(idx, 'scale_max', preset.max)
                          }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

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
                    <div className="text-xs text-muted" style={{ marginBottom: '0.5rem' }}>Pratinjau Skala ({((q.scale_max ?? 5) - (q.scale_min ?? 1) + 1)} Opsi Pilihan):</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
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
              {isSurvey && (q.type === 'MCQ_GRID' || q.type === 'CHECKBOX_GRID') && (() => {
                const rows = q.grid_rows || []
                const cols = q.grid_columns || []
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Grid Dimensions Toolbar */}
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)',
                      gap: '0.5rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Jumlah Baris:</span>
                          <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 6 }}>
                            <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0.15rem 0.45rem', height: 24 }} onClick={() => changeGridRowsCount(idx, rows.length - 1)} disabled={rows.length <= 1}>-</button>
                            <span style={{ fontWeight: 700, fontSize: '0.82rem', minWidth: 22, textAlign: 'center' }}>{rows.length}</span>
                            <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0.15rem 0.45rem', height: 24 }} onClick={() => changeGridRowsCount(idx, rows.length + 1)} disabled={rows.length >= 15}>+</button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Jumlah Kolom:</span>
                          <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 6 }}>
                            <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0.15rem 0.45rem', height: 24 }} onClick={() => changeGridColsCount(idx, cols.length - 1)} disabled={cols.length <= 1}>-</button>
                            <span style={{ fontWeight: 700, fontSize: '0.82rem', minWidth: 22, textAlign: 'center' }}>{cols.length}</span>
                            <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0.15rem 0.45rem', height: 24 }} onClick={() => changeGridColsCount(idx, cols.length + 1)} disabled={cols.length >= 10}>+</button>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-muted">Matriks: {rows.length} × {cols.length}</span>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Baris (Pernyataan)</label>
                      {rows.map((row, ri) => (
                        <div key={ri} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.375rem', alignItems: 'center' }}>
                          <span style={{ width: 20, textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{ri + 1}</span>
                          <input className="form-input" style={{ flex: 1, fontSize: '0.85rem' }} placeholder={`Pernyataan ${ri + 1}`} value={row} onChange={e => updateGridRow(idx, ri, e.target.value)} />
                          {rows.length > 1 && (
                            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '0.25rem' }} onClick={() => removeGridRow(idx, ri)}><Trash2 size={13} /></button>
                          )}
                        </div>
                      ))}
                      <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '0.8rem' }} onClick={() => addGridRow(idx)} disabled={rows.length >= 15}>
                        <Plus size={13} /> Tambah Baris
                      </button>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Kolom (Opsi)</label>
                      {cols.map((col, ci) => (
                        <div key={ci} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.375rem', alignItems: 'center' }}>
                          <span style={{ width: 20, textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{ci + 1}</span>
                          <input className="form-input" style={{ flex: 1, fontSize: '0.85rem' }} placeholder={`Opsi ${ci + 1}`} value={col} onChange={e => updateGridColumn(idx, ci, e.target.value)} />
                          {cols.length > 1 && (
                            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '0.25rem' }} onClick={() => removeGridColumn(idx, ci)}><Trash2 size={13} /></button>
                          )}
                        </div>
                      ))}
                      <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '0.8rem' }} onClick={() => addGridColumn(idx)} disabled={cols.length >= 10}>
                        <Plus size={13} /> Tambah Kolom
                      </button>
                    </div>
                    <div className="text-xs text-muted">
                      {q.type === 'MCQ_GRID' ? '○ Satu pilihan per baris (radio)' : '☑ Beberapa pilihan per baris (checkbox)'}
                    </div>
                  </div>
                )
              })()}

              {/* Survey MCQ / CHECKBOXES / DROPDOWN options editor */}
              {isSurvey && ['MCQ', 'CHECKBOXES', 'DROPDOWN'].includes(q.type) && (() => {
                const optKeys = Object.keys(q.options || {})
                const optCount = optKeys.length
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Survey options count toolbar (Automated Shrink / Expand) */}
                    {(() => {
                      const isSettingOpen = Boolean(openOptionSettings[`survey_${idx}`])
                      return (
                        <div
                          style={{
                            background: isSettingOpen ? 'var(--navy-mid)' : 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            padding: '0.45rem 0.75rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Sliders size={13} style={{ color: 'var(--accent)' }} />
                                Jumlah Opsi Pertanyaan #{q.number}:
                              </span>

                              {/* Stepper ringkas langsung di bar */}
                              <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '0.1rem 0.4rem', height: 24, fontSize: '0.82rem' }}
                                  onClick={() => changeSurveyOptionsCount(idx, optCount - 1)}
                                  disabled={optCount <= 2}
                                >-</button>
                                <span style={{ fontWeight: 700, fontSize: '0.82rem', minWidth: 22, textAlign: 'center', color: 'var(--accent)' }}>
                                  {optCount}
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '0.1rem 0.4rem', height: 24, fontSize: '0.82rem' }}
                                  onClick={() => changeSurveyOptionsCount(idx, optCount + 1)}
                                  disabled={optCount >= 10}
                                >+</button>
                              </div>

                              <span className="text-muted text-xs">
                                ({optCount} Pilihan)
                              </span>
                            </div>

                            {/* Tombol Toggle Preset Cepat */}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => toggleOptionSettings(`survey_${idx}`)}
                              style={{
                                height: 24,
                                padding: '0 0.45rem',
                                fontSize: '0.74rem',
                                color: isSettingOpen ? 'var(--primary)' : 'var(--text-secondary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                              title={isSettingOpen ? 'Ciutkan preset cepat' : 'Buka pilihan preset cepat'}
                            >
                              <span>{isSettingOpen ? 'Tutup Preset' : 'Preset Cepat'}</span>
                              {isSettingOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          </div>

                          {/* Konten Preset Terbuka (Otomatis ciut setelah dipilih) */}
                          {isSettingOpen && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem', paddingTop: '0.35rem', borderTop: '1px dashed var(--border)' }}>
                              <span className="text-muted text-xs">Pilih cepat jumlah opsi:</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {[2, 3, 4, 5].map(cnt => (
                                  <button
                                    key={cnt}
                                    type="button"
                                    className={`btn btn-sm ${optCount === cnt ? 'btn-primary' : 'btn-ghost'}`}
                                    style={{ padding: '0.15rem 0.5rem', fontSize: '0.74rem', height: 24, borderRadius: 5 }}
                                    onClick={() => {
                                      changeSurveyOptionsCount(idx, cnt)
                                      shrinkOptionSettings(`survey_${idx}`)
                                    }}
                                  >
                                    {cnt} Opsi
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {optKeys.map((key, i) => {
                      const hasImage = !!q.option_images?.[key]
                      const isInputOpen = Boolean(openOptionImageInputs[`${idx}_${key}`])
                      return (
                        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--navy)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                              {i + 1}
                            </span>
                            <input
                              className="form-input"
                              style={{ flex: 1 }}
                              placeholder={`Opsi ${i + 1}`}
                              value={q.options[key] || ''}
                              onChange={e => updateOption(idx, key, e.target.value)}
                            />

                            {/* Thumbnail Gambar Terlampir Ringkas (Automated Shrink) */}
                            {hasImage && !isInputOpen && (
                              <button
                                type="button"
                                className="option-thumb-compact-btn"
                                onClick={() => toggleOptionImageInput(idx, key)}
                                title={`Gambar Opsi ${i + 1} terlampir. Klik untuk kelola / ubah.`}
                              >
                                <img
                                  src={getDriveImageUrl(q.option_images[key])}
                                  alt=""
                                  className="option-thumb-img"
                                  onError={e => { e.currentTarget.style.display = 'none' }}
                                />
                                <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                                  Gambar ✓
                                </span>
                              </button>
                            )}

                            {/* Plus / Image button beside answer option */}
                            <button
                              type="button"
                              className={`btn btn-sm ${isInputOpen ? 'btn-primary' : 'btn-ghost'}`}
                              style={{
                                padding: '0.25rem 0.5rem',
                                height: 36,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.75rem',
                                flexShrink: 0,
                                border: (hasImage || isInputOpen) ? '1px solid var(--accent)' : '1px solid var(--border)',
                                background: isInputOpen ? 'var(--accent)' : hasImage ? 'rgba(79, 142, 247, 0.12)' : undefined,
                                color: isInputOpen ? '#ffffff' : hasImage ? 'var(--accent)' : 'var(--text-secondary)'
                              }}
                              onClick={() => toggleOptionImageInput(idx, key)}
                              title={isInputOpen ? `Ciutkan form gambar Opsi ${i + 1}` : hasImage ? `Kelola Gambar Opsi ${i + 1}` : `Tambah link gambar ke Opsi ${i + 1}`}
                            >
                              {isInputOpen ? (
                                <>
                                  <ChevronUp size={14} />
                                  <span style={{ fontWeight: 600 }}>Tutup</span>
                                </>
                              ) : (
                                <>
                                  <Plus size={14} />
                                  <ImageIcon size={14} />
                                  {!hasImage && <span>Gambar</span>}
                                </>
                              )}
                            </button>

                            {optCount > 2 && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger)', padding: '0.25rem' }}
                                onClick={() => removeSurveyOption(idx, key)}
                                title="Hapus opsi ini"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>

                          {/* Image URL attachment drawer (Automated Shrink / Expand) */}
                          {isInputOpen && (
                            <div style={{
                              marginLeft: 32,
                              padding: '0.5rem 0.75rem',
                              background: 'var(--navy-mid)',
                              border: '1px dashed var(--accent)',
                              borderRadius: 8,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.5rem',
                            }}>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                                  <ImageIcon size={13} /> Link Gambar Opsi {i + 1}:
                                </span>
                                <input
                                  type="url"
                                  className="form-input"
                                  style={{ flex: 1, minWidth: 200, fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 30 }}
                                  placeholder="Tempel link gambar (Google Drive publik atau URL langsung: https://...)"
                                  value={q.option_images?.[key] || ''}
                                  onChange={e => updateOptionImage(idx, key, e.target.value)}
                                />
                                {hasImage && (
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    style={{ color: 'var(--danger)', padding: '0.2rem 0.4rem', height: 28, fontSize: '0.75rem' }}
                                    onClick={() => updateOptionImage(idx, key, '')}
                                    title="Hapus gambar opsi ini"
                                  >
                                    <Trash2 size={13} style={{ marginRight: 2 }} /> Hapus
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  style={{ padding: '0.2rem 0.5rem', height: 28, fontSize: '0.74rem' }}
                                  onClick={() => shrinkOptionImageInput(idx, key)}
                                  title="Selesai dan ciutkan form gambar opsi ini"
                                >
                                  ✓ Selesai & Ciutkan
                                </button>
                              </div>


                              {/* Adaptive Live Preview */}
                              {hasImage && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    Pratinjau Gambar Opsi {i + 1} (Adaptif terhadap ukuran layar):
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                    <img
                                      src={getDriveImageUrl(q.option_images[key])}
                                      alt={`Pratinjau Opsi ${i + 1}`}
                                      className="option-image-preview"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none'
                                        const errEl = e.currentTarget.parentElement?.querySelector('.opt-img-err')
                                        if (errEl) errEl.style.display = 'block'
                                      }}
                                      onLoad={(e) => {
                                        e.currentTarget.style.display = 'block'
                                        const errEl = e.currentTarget.parentElement?.querySelector('.opt-img-err')
                                        if (errEl) errEl.style.display = 'none'
                                      }}
                                    />
                                    <div className="opt-img-err alert alert-warning text-xs" style={{ display: 'none', padding: '0.35rem 0.6rem' }}>
                                      ⚠️ Gambar tidak dapat dimuat. Pastikan URL valid dan link dapat diakses publik.
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ alignSelf: 'flex-start', fontSize: '0.8rem' }}
                      onClick={() => addSurveyOption(idx)}
                      disabled={optCount >= 10}
                    >
                      <Plus size={14} style={{ marginRight: '0.25rem' }} /> Tambah Opsi
                    </button>

                    {q.type === 'MCQ' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={q.allow_other || false}
                          onChange={e => updateQuestion(idx, 'allow_other', e.target.checked)}
                        />
                        Tampilkan opsi "Lainnya" (teks bebas)
                      </label>
                    )}
                    <div className="text-xs text-muted">
                      {q.type === 'MCQ' ? '○ Responden memilih satu jawaban' : q.type === 'CHECKBOXES' ? '☑ Responden dapat memilih beberapa jawaban' : '▾ Ditampilkan sebagai menu dropdown'}
                    </div>
                  </div>
                )
              })()}

              {/* ═══════════════ EXAM/QUIZ QUESTION TYPE EDITORS ═══════════════ */}
              {/* MCQ / COMPLEX_MCQ options (exam/quiz mode) */}
              {!isSurvey && (q.type === 'MCQ' || q.type === 'COMPLEX_MCQ') && (() => {
                const currentKeys = Object.keys(q.options || {})
                const currentCount = currentKeys.length
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Per-question options count controller toolbar (Automated Shrink / Expand) */}
                    {(() => {
                      const isSettingOpen = Boolean(openOptionSettings[idx])
                      return (
                        <div
                          style={{
                            background: isSettingOpen ? 'var(--navy-mid)' : 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            padding: '0.45rem 0.75rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Sliders size={13} style={{ color: 'var(--accent)' }} />
                                Jumlah Opsi Soal #{q.number}:
                              </span>

                              {/* Stepper ringkas langsung di bar */}
                              <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '0.1rem 0.4rem', height: 24, fontSize: '0.82rem' }}
                                  onClick={() => changeMcqOptionsCount(idx, currentCount - 1)}
                                  disabled={currentCount <= 2}
                                  title="Kurangi opsi"
                                >-</button>
                                <span style={{ fontWeight: 700, fontSize: '0.82rem', minWidth: 22, textAlign: 'center', color: 'var(--accent)' }}>
                                  {currentCount}
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '0.1rem 0.4rem', height: 24, fontSize: '0.82rem' }}
                                  onClick={() => changeMcqOptionsCount(idx, currentCount + 1)}
                                  disabled={currentCount >= 10}
                                  title="Tambah opsi"
                                >+</button>
                              </div>

                              <span className="text-muted text-xs" style={{ whiteSpace: 'nowrap' }}>
                                ({ALL_LETTERS[0]} s/d {ALL_LETTERS[currentCount - 1]})
                              </span>
                            </div>

                            {/* Tombol Toggle Preset Cepat */}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => toggleOptionSettings(idx)}
                              style={{
                                height: 24,
                                padding: '0 0.45rem',
                                fontSize: '0.74rem',
                                color: isSettingOpen ? 'var(--primary)' : 'var(--text-secondary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                              title={isSettingOpen ? 'Ciutkan pilihan cepat' : 'Buka pilihan preset cepat'}
                            >
                              <span>{isSettingOpen ? 'Tutup Preset' : 'Preset Cepat'}</span>
                              {isSettingOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          </div>

                          {/* Konten Preset Terbuka (Otomatis ciut setelah dipilih atau ditutup) */}
                          {isSettingOpen && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem', paddingTop: '0.35rem', borderTop: '1px dashed var(--border)' }}>
                              <span className="text-muted text-xs">Pilih cepat jumlah opsi:</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {[3, 4, 5, 6].map(cnt => (
                                  <button
                                    key={cnt}
                                    type="button"
                                    className={`btn btn-sm ${currentCount === cnt ? 'btn-primary' : 'btn-ghost'}`}
                                    style={{ padding: '0.15rem 0.5rem', fontSize: '0.74rem', height: 24, borderRadius: 5 }}
                                    onClick={() => {
                                      changeMcqOptionsCount(idx, cnt)
                                      shrinkOptionSettings(idx)
                                    }}
                                  >
                                    {cnt} Opsi ({ALL_LETTERS[0]}-{ALL_LETTERS[cnt - 1]})
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Options list */}
                    {currentKeys.map(key => {
                      const hasImage = !!q.option_images?.[key]
                      const isInputOpen = Boolean(openOptionImageInputs[`${idx}_${key}`])
                      return (
                        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--navy)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                              {key}
                            </span>
                            <input
                              className="form-input"
                              style={{ flex: 1 }}
                              placeholder={`Opsi ${key}`}
                              value={q.options?.[key] || ''}
                              onChange={e => updateOption(idx, key, e.target.value)}
                            />

                            {/* Thumbnail Gambar Terlampir Ringkas (Automated Shrink) */}
                            {hasImage && !isInputOpen && (
                              <button
                                type="button"
                                className="option-thumb-compact-btn"
                                onClick={() => toggleOptionImageInput(idx, key)}
                                title={`Gambar Opsi ${key} terlampir. Klik untuk kelola / ubah.`}
                              >
                                <img
                                  src={getDriveImageUrl(q.option_images[key])}
                                  alt=""
                                  className="option-thumb-img"
                                  onError={e => { e.currentTarget.style.display = 'none' }}
                                />
                                <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                                  Gambar ✓
                                </span>
                              </button>
                            )}

                            {/* Plus / Image button beside answer option */}
                            <button
                              type="button"
                              className={`btn btn-sm ${isInputOpen ? 'btn-primary' : 'btn-ghost'}`}
                              style={{
                                padding: '0.25rem 0.5rem',
                                height: 36,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.75rem',
                                flexShrink: 0,
                                border: (hasImage || isInputOpen) ? '1px solid var(--accent)' : '1px solid var(--border)',
                                background: isInputOpen ? 'var(--accent)' : hasImage ? 'rgba(79, 142, 247, 0.12)' : undefined,
                                color: isInputOpen ? '#ffffff' : hasImage ? 'var(--accent)' : 'var(--text-secondary)'
                              }}
                              onClick={() => toggleOptionImageInput(idx, key)}
                              title={isInputOpen ? `Ciutkan form gambar Opsi ${key}` : hasImage ? `Kelola Gambar Opsi ${key}` : `Tambah link gambar ke Opsi ${key}`}
                            >
                              {isInputOpen ? (
                                <>
                                  <ChevronUp size={14} />
                                  <span style={{ fontWeight: 600 }}>Tutup</span>
                                </>
                              ) : (
                                <>
                                  <Plus size={14} />
                                  <ImageIcon size={14} />
                                  {!hasImage && <span>Gambar</span>}
                                </>
                              )}
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }} title={q.type === 'MCQ' ? 'Kunci jawaban benar' : 'Centang jika opsi ini benar'}>
                              {q.type === 'MCQ' ? (
                                <input
                                  type="radio"
                                  name={`mcq_correct_${idx}`}
                                  checked={q.correct_answer === key}
                                  onChange={() => updateQuestion(idx, 'correct_answer', key)}
                                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                                />
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={Array.isArray(q.correct_answer) && q.correct_answer.includes(key)}
                                  onChange={e => {
                                    const prev = Array.isArray(q.correct_answer) ? q.correct_answer : []
                                    const next = e.target.checked ? [...prev, key] : prev.filter(k => k !== key)
                                    updateQuestion(idx, 'correct_answer', next)
                                  }}
                                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                                />
                              )}
                            </div>
                            {currentCount > 2 && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger)', padding: '0.25rem' }}
                                onClick={() => removeMcqOption(idx, key)}
                                title={`Hapus opsi ${key}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>

                          {/* Image URL attachment drawer (Automated Shrink / Expand) */}
                          {isInputOpen && (
                            <div style={{
                              marginLeft: 32,
                              padding: '0.5rem 0.75rem',
                              background: 'var(--navy-mid)',
                              border: '1px dashed var(--accent)',
                              borderRadius: 8,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.5rem',
                            }}>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}>
                                  <ImageIcon size={13} /> Link Gambar Opsi {key}:
                                </span>
                                <input
                                  type="url"
                                  className="form-input"
                                  style={{ flex: 1, minWidth: 200, fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: 30 }}
                                  placeholder="Tempel link gambar (Google Drive publik atau URL langsung: https://...)"
                                  value={q.option_images?.[key] || ''}
                                  onChange={e => updateOptionImage(idx, key, e.target.value)}
                                />
                                {hasImage && (
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    style={{ color: 'var(--danger)', padding: '0.2rem 0.4rem', height: 28, fontSize: '0.75rem' }}
                                    onClick={() => updateOptionImage(idx, key, '')}
                                    title="Hapus gambar opsi ini"
                                  >
                                    <Trash2 size={13} style={{ marginRight: 2 }} /> Hapus
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  style={{ padding: '0.2rem 0.5rem', height: 28, fontSize: '0.74rem' }}
                                  onClick={() => shrinkOptionImageInput(idx, key)}
                                  title="Selesai dan ciutkan form gambar opsi ini"
                                >
                                  ✓ Selesai & Ciutkan
                                </button>
                              </div>


                              {/* Adaptive Live Preview */}
                              {hasImage && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    Pratinjau Gambar Opsi {key} (Adaptif terhadap ukuran layar):
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                    <img
                                      src={getDriveImageUrl(q.option_images[key])}
                                      alt={`Pratinjau Opsi ${key}`}
                                      className="option-image-preview"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none'
                                        const errEl = e.currentTarget.parentElement?.querySelector('.opt-img-err')
                                        if (errEl) errEl.style.display = 'block'
                                      }}
                                      onLoad={(e) => {
                                        e.currentTarget.style.display = 'block'
                                        const errEl = e.currentTarget.parentElement?.querySelector('.opt-img-err')
                                        if (errEl) errEl.style.display = 'none'
                                      }}
                                    />
                                    <div className="opt-img-err alert alert-warning text-xs" style={{ display: 'none', padding: '0.35rem 0.6rem' }}>
                                      ⚠️ Gambar tidak dapat dimuat. Pastikan URL valid dan link dapat diakses publik.
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ alignSelf: 'flex-start', fontSize: '0.8rem' }}
                        onClick={() => addMcqOption(idx)}
                        disabled={currentCount >= 10}
                      >
                        <Plus size={14} style={{ marginRight: '0.25rem' }} />
                        Tambah Opsi ({ALL_LETTERS[currentCount] || 'Maksimal'})
                      </button>
                      <div className="text-xs text-muted">
                        {q.type === 'MCQ' ? '○ Pilih satu jawaban benar' : '☑ Centang semua jawaban yang benar'}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* True/False (exam/quiz mode) */}
              {!isSurvey && q.type === 'TRUE_FALSE' && (() => {
                const stmtKeys = Object.keys(q.options || {})
                const stmtCount = stmtKeys.length
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Statements count controller toolbar (Automated Shrink / Expand) */}
                    {(() => {
                      const isSettingOpen = Boolean(openOptionSettings[`tf_${idx}`])
                      return (
                        <div
                          style={{
                            background: isSettingOpen ? 'var(--navy-mid)' : 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            padding: '0.45rem 0.75rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Sliders size={13} style={{ color: 'var(--accent)' }} />
                                Jumlah Pernyataan Soal #{q.number}:
                              </span>
                              <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '0.1rem 0.4rem', height: 24, fontSize: '0.82rem' }}
                                  onClick={() => changeStatementsCount(idx, stmtCount - 1)}
                                  disabled={stmtCount <= 1}
                                  title="Kurangi pernyataan"
                                >-</button>
                                <span style={{ fontWeight: 700, fontSize: '0.82rem', minWidth: 22, textAlign: 'center', color: 'var(--accent)' }}>{stmtCount}</span>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '0.1rem 0.4rem', height: 24, fontSize: '0.82rem' }}
                                  onClick={() => changeStatementsCount(idx, stmtCount + 1)}
                                  disabled={stmtCount >= 10}
                                  title="Tambah pernyataan"
                                >+</button>
                              </div>
                              <span className="text-muted text-xs">({stmtCount} Pernyataan)</span>
                            </div>

                            {/* Tombol Toggle Preset Cepat */}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => toggleOptionSettings(`tf_${idx}`)}
                              style={{
                                height: 24,
                                padding: '0 0.45rem',
                                fontSize: '0.74rem',
                                color: isSettingOpen ? 'var(--primary)' : 'var(--text-secondary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                              title={isSettingOpen ? 'Ciutkan pilihan cepat' : 'Buka pilihan preset cepat'}
                            >
                              <span>{isSettingOpen ? 'Tutup Preset' : 'Preset Cepat'}</span>
                              {isSettingOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          </div>

                          {/* Konten Preset Terbuka (Otomatis ciut setelah dipilih) */}
                          {isSettingOpen && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.35rem', paddingTop: '0.35rem', borderTop: '1px dashed var(--border)' }}>
                              <span className="text-muted text-xs">Pilih cepat jumlah pernyataan:</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {[2, 3, 4, 5].map(cnt => (
                                  <button
                                    key={cnt}
                                    type="button"
                                    className={`btn btn-sm ${stmtCount === cnt ? 'btn-primary' : 'btn-ghost'}`}
                                    style={{ padding: '0.15rem 0.5rem', fontSize: '0.74rem', height: 24, borderRadius: 5 }}
                                    onClick={() => {
                                      changeStatementsCount(idx, cnt)
                                      shrinkOptionSettings(`tf_${idx}`)
                                    }}
                                  >
                                    {cnt} Baris
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}


                    {stmtKeys.map((key, i) => (
                      <div key={key} style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
                        <span style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--navy)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                          {i + 1}
                        </span>
                        <input
                          className="form-input"
                          style={{ flex: 1 }}
                          placeholder={`Pernyataan ${i + 1}`}
                          value={q.options[key] || ''}
                          onChange={e => updateOption(idx, key, e.target.value)}
                        />
                        
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--surface)', padding: '0.25rem 0.5rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                            <input
                              type="radio"
                              name={`tf_${idx}_${key}`}
                              checked={q.correct_answer?.[key] === 'true'}
                              onChange={() => {
                                const newAnswer = { ...(q.correct_answer || {}), [key]: 'true' }
                                updateQuestion(idx, 'correct_answer', newAnswer)
                              }}
                            /> Benar
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                            <input
                              type="radio"
                              name={`tf_${idx}_${key}`}
                              checked={q.correct_answer?.[key] === 'false'}
                              onChange={() => {
                                const newAnswer = { ...(q.correct_answer || {}), [key]: 'false' }
                                updateQuestion(idx, 'correct_answer', newAnswer)
                              }}
                            /> Salah
                          </label>
                        </div>

                        {stmtCount > 1 && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)', padding: '0.25rem' }}
                            onClick={() => removeStatement(idx, key)}
                            title="Hapus pernyataan ini"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ alignSelf: 'flex-start', marginTop: '0.25rem', fontSize: '0.8rem' }}
                      onClick={() => addStatement(idx)}
                      disabled={stmtCount >= 10}
                    >
                      <Plus size={14} style={{ marginRight: '0.25rem' }} /> Tambah Pernyataan
                    </button>
                  </div>
                )
              })()}

              {/* Matching (exam/quiz mode) */}
              {!isSurvey && q.type === 'MATCHING' && (() => {
                const leftKeys = Object.keys(q.options?.left || {})
                const rightKeys = Object.keys(q.options?.right || {})
                const pairCount = leftKeys.length
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Matching Toolbar */}
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)',
                      gap: '0.5rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Jumlah Pasangan Soal #{q.number}:</span>
                        <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 6 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0.15rem 0.45rem', height: 24, fontSize: '0.85rem' }}
                            onClick={() => changeMatchingCount(idx, pairCount - 1)}
                            disabled={pairCount <= 2}
                            title="Kurangi pasangan"
                          >-</button>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', minWidth: 24, textAlign: 'center' }}>{pairCount}</span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0.15rem 0.45rem', height: 24, fontSize: '0.85rem' }}
                            onClick={() => changeMatchingCount(idx, pairCount + 1)}
                            disabled={pairCount >= 10}
                            title="Tambah pasangan"
                          >+</button>
                        </div>
                        <span className="text-muted text-xs">Pasang</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span className="text-muted text-xs" style={{ marginRight: '0.25rem' }}>Cepat:</span>
                        {[2, 3, 4, 5, 6].map(cnt => (
                          <button
                            key={cnt}
                            type="button"
                            className={`btn btn-sm ${pairCount === cnt ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', height: 24 }}
                            onClick={() => changeMatchingCount(idx, cnt)}
                          >
                            {cnt} Pasang
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="alert alert-info text-xs" style={{ margin: 0, padding: '0.5rem 0.75rem' }}>
                      🔗 <strong>Petunjuk Menjodohkan:</strong> Tulis premis / pertanyaan di kolom kiri (1, 2, 3...), dan target jawaban di kolom kanan (A, B, C...). Tentukan kunci pasangan benar pada dropdown di samping setiap premis kiri.
                    </div>

                    {/* Grid of Left and Right Pairs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                      {/* Left Column (Premises + Answer Target) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Kolom Kiri (Premis / Soal) & Kunci Jawaban
                        </div>
                        {leftKeys.map((lKey, i) => (
                          <div key={lKey} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--navy-mid)', padding: '0.5rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <span style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                              {lKey}
                            </span>
                            <input
                              className="form-input"
                              style={{ flex: 1, fontSize: '0.82rem', padding: '0.35rem 0.5rem' }}
                              placeholder={`Premis ${lKey} (cth: Ibu kota Indonesia)`}
                              value={q.options?.left?.[lKey] || ''}
                              onChange={e => updateMatchingLeft(idx, lKey, e.target.value)}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--gold)' }}>➔ Kunci:</span>
                              <select
                                className="form-input"
                                style={{ width: 62, padding: '0.25rem 0.4rem', fontSize: '0.8rem', fontWeight: 700, borderColor: 'var(--gold)', color: 'var(--gold)' }}
                                value={q.correct_answer?.[lKey] || rightKeys[i] || 'A'}
                                onChange={e => updateMatchingAnswer(idx, lKey, e.target.value)}
                              >
                                {rightKeys.map(rKey => (
                                  <option key={rKey} value={rKey}>[{rKey}]</option>
                                ))}
                              </select>
                            </div>
                            {pairCount > 2 && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger)', padding: '0.25rem' }}
                                onClick={() => removeMatchingPair(idx, lKey)}
                                title="Hapus pasangan ini"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Right Column (Target Answers) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Kolom Kanan (Pilihan Pasangan Jawaban)
                        </div>
                        {rightKeys.map((rKey) => (
                          <div key={rKey} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--navy-mid)', padding: '0.5rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <span style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--navy)', border: '1px solid var(--border)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                              {rKey}
                            </span>
                            <input
                              className="form-input"
                              style={{ flex: 1, fontSize: '0.82rem', padding: '0.35rem 0.5rem' }}
                              placeholder={`Jawaban ${rKey} (cth: Jakarta)`}
                              value={q.options?.right?.[rKey] || ''}
                              onChange={e => updateMatchingRight(idx, rKey, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ alignSelf: 'flex-start', fontSize: '0.8rem' }}
                      onClick={() => addMatchingPair(idx)}
                      disabled={pairCount >= 10}
                    >
                      <Plus size={14} style={{ marginRight: '0.25rem' }} /> Tambah Pasangan ({pairCount + 1})
                    </button>
                  </div>
                )
              })()}

              {/* Sequencing (exam/quiz mode) */}
              {!isSurvey && q.type === 'SEQUENCING' && (() => {
                const items = q.options?.items || []
                const count = items.length
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Sequencing Toolbar */}
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)',
                      gap: '0.5rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Jumlah Langkah Urutan Soal #{q.number}:</span>
                        <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 6 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0.15rem 0.45rem', height: 24, fontSize: '0.85rem' }}
                            onClick={() => changeSequencingCount(idx, count - 1)}
                            disabled={count <= 2}
                            title="Kurangi langkah"
                          >-</button>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', minWidth: 24, textAlign: 'center' }}>{count}</span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0.15rem 0.45rem', height: 24, fontSize: '0.85rem' }}
                            onClick={() => changeSequencingCount(idx, count + 1)}
                            disabled={count >= 10}
                            title="Tambah langkah"
                          >+</button>
                        </div>
                        <span className="text-muted text-xs">Langkah</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span className="text-muted text-xs" style={{ marginRight: '0.25rem' }}>Cepat:</span>
                        {[3, 4, 5, 6].map(cnt => (
                          <button
                            key={cnt}
                            type="button"
                            className={`btn btn-sm ${count === cnt ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', height: 24 }}
                            onClick={() => changeSequencingCount(idx, cnt)}
                          >
                            {cnt} Langkah
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="alert alert-info text-xs" style={{ margin: 0, padding: '0.5rem 0.75rem' }}>
                      🔀 <strong>Urutan Kunci Jawaban Benar (Kronologis):</strong> Tulis langkah-langkah di bawah ini dalam susunan <strong>URUTAN YANG BENAR</strong> dari atas ke bawah (Langkah 1 s/d Langkah {count}). Gunakan tombol panah ▲/▼ untuk menukar urutan. Sistem akan otomatis mengacak susunannya saat siswa mengerjakan ujian.
                    </div>

                    {/* Items in chronological order */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {items.map((item, itemIdx) => (
                        <div key={item.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--surface)', padding: '0.5rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <span style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                            {itemIdx + 1}
                          </span>
                          <input
                            className="form-input"
                            style={{ flex: 1, fontSize: '0.85rem' }}
                            placeholder={`Langkah ke-${itemIdx + 1} (cth: Kepompong)`}
                            value={item.text || ''}
                            onChange={e => updateSequencingText(idx, item.id, e.target.value)}
                          />
                          <div style={{ display: 'flex', gap: '0.2rem' }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '0.2rem 0.4rem', height: 26 }}
                              onClick={() => moveSequencingItem(idx, itemIdx, -1)}
                              disabled={itemIdx === 0}
                              title="Pindah ke atas"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '0.2rem 0.4rem', height: 26 }}
                              onClick={() => moveSequencingItem(idx, itemIdx, 1)}
                              disabled={itemIdx === count - 1}
                              title="Pindah ke bawah"
                            >
                              ▼
                            </button>
                          </div>
                          {count > 2 && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--danger)', padding: '0.25rem' }}
                              onClick={() => removeSequencingItem(idx, item.id)}
                              title="Hapus langkah ini"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ alignSelf: 'flex-start', fontSize: '0.8rem' }}
                      onClick={() => addSequencingItem(idx)}
                      disabled={count >= 10}
                    >
                      <Plus size={14} style={{ marginRight: '0.25rem' }} /> Tambah Langkah ({count + 1})
                    </button>
                  </div>
                )
              })()}

              {/* Agree / Disagree (exam/quiz mode) */}
              {!isSurvey && q.type === 'AGREE_DISAGREE' && (() => {
                const stmtKeys = Object.keys(q.options || {})
                const stmtCount = stmtKeys.length
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* Agree Disagree Toolbar */}
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)',
                      gap: '0.5rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Jumlah Pernyataan Soal #{q.number}:</span>
                        <div style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--navy-mid)', border: '1px solid var(--border)', borderRadius: 6 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0.15rem 0.45rem', height: 24, fontSize: '0.85rem' }}
                            onClick={() => changeAgreeDisagreeCount(idx, stmtCount - 1)}
                            disabled={stmtCount <= 1}
                            title="Kurangi pernyataan"
                          >-</button>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', minWidth: 24, textAlign: 'center' }}>{stmtCount}</span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0.15rem 0.45rem', height: 24, fontSize: '0.85rem' }}
                            onClick={() => changeAgreeDisagreeCount(idx, stmtCount + 1)}
                            disabled={stmtCount >= 10}
                            title="Tambah pernyataan"
                          >+</button>
                        </div>
                        <span className="text-muted text-xs">Pernyataan</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span className="text-muted text-xs" style={{ marginRight: '0.25rem' }}>Cepat:</span>
                        {[2, 3, 4, 5].map(cnt => (
                          <button
                            key={cnt}
                            type="button"
                            className={`btn btn-sm ${stmtCount === cnt ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', height: 24 }}
                            onClick={() => changeAgreeDisagreeCount(idx, cnt)}
                          >
                            {cnt} Baris
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="alert alert-info text-xs" style={{ margin: 0, padding: '0.5rem 0.75rem' }}>
                      👍👎 <strong>Petunjuk Setuju / Tidak Setuju:</strong> Tulis pernyataan pada kolom teks, lalu pilih kunci jawaban yang diharapkan (Setuju atau Tidak Setuju).
                    </div>

                    {stmtKeys.map((key, i) => (
                      <div key={key} style={{ display: 'flex', gap: '0.625rem', alignItems: 'center' }}>
                        <span style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--navy)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                          {i + 1}
                        </span>
                        <input
                          className="form-input"
                          style={{ flex: 1 }}
                          placeholder={`Pernyataan ${i + 1}`}
                          value={q.options?.[key] || ''}
                          onChange={e => updateOption(idx, key, e.target.value)}
                        />
                        
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--surface)', padding: '0.25rem 0.5rem', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', color: q.correct_answer?.[key] === 'agree' ? 'var(--success)' : 'inherit', fontWeight: q.correct_answer?.[key] === 'agree' ? 700 : 400 }}>
                            <input
                              type="radio"
                              name={`ad_${idx}_${key}`}
                              checked={q.correct_answer?.[key] === 'agree'}
                              onChange={() => {
                                const newAnswer = { ...(q.correct_answer || {}), [key]: 'agree' }
                                updateQuestion(idx, 'correct_answer', newAnswer)
                              }}
                            /> 👍 Setuju
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', color: q.correct_answer?.[key] === 'disagree' ? 'var(--danger)' : 'inherit', fontWeight: q.correct_answer?.[key] === 'disagree' ? 700 : 400 }}>
                            <input
                              type="radio"
                              name={`ad_${idx}_${key}`}
                              checked={q.correct_answer?.[key] === 'disagree'}
                              onChange={() => {
                                const newAnswer = { ...(q.correct_answer || {}), [key]: 'disagree' }
                                updateQuestion(idx, 'correct_answer', newAnswer)
                              }}
                            /> 👎 Tidak Setuju
                          </label>
                        </div>

                        {stmtCount > 1 && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)', padding: '0.25rem' }}
                            onClick={() => removeAgreeDisagreeStatement(idx, key)}
                            title="Hapus pernyataan ini"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ alignSelf: 'flex-start', marginTop: '0.25rem', fontSize: '0.8rem' }}
                      onClick={() => addAgreeDisagreeStatement(idx)}
                      disabled={stmtCount >= 10}
                    >
                      <Plus size={14} style={{ marginRight: '0.25rem' }} /> Tambah Pernyataan ({stmtCount + 1})
                    </button>
                  </div>
                )
              })()}

              {!isSurvey && q.type === 'ESSAY' && (
                <div className="alert alert-info text-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>📝 Soal Esai / Uraian: Siswa mengetik jawaban teks secara bebas tanpa opsi pilihan. Guru menilai skor secara manual di menu Hasil Ujian.</span>
                </div>
              )}
                </div>
              )}
            </div>
          )})}

          <button className="btn btn-ghost" onClick={addQuestion} style={{ borderStyle: 'dashed', borderWidth: 2 }}>
            <Plus size={16} /> Tambah {isSurvey ? 'Pertanyaan' : 'Soal'}
          </button>
        </div>
      </div>

      {/* ─── UNSAVED CHANGES CONFIRMATION PROMPT MODAL ─── */}
      {showUnsavedModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 480, padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: '#fef3c7',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <AlertTriangle size={24} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Perubahan Belum Disimpan!
                </h3>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Anda memiliki perubahan pada {modeLabel.toLowerCase()} ini yang belum disimpan ke server. Jika Anda meninggalkan halaman ini sekarang, perubahan tersebut akan hilang.
                </p>
              </div>
            </div>

            <div style={{
              background: '#f8fafc',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1.5rem',
              fontSize: '0.8rem',
              color: 'var(--text-muted)'
            }}>
              💡 <strong>Tips Guru:</strong> Klik <em>&ldquo;Simpan Draf &amp; Keluar&rdquo;</em> untuk mengamankan pekerjaan Anda ke dalam draf agar dapat dilanjutkan kapan saja.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <button
                type="button"
                className="btn btn-gold"
                disabled={saving}
                onClick={async () => {
                  await handleSave(false, pendingNavPath || returnPath)
                }}
                style={{ width: '100%', justifyContent: 'center', fontWeight: 700, padding: '0.65rem 1rem' }}
              >
                <Save size={16} /> {saving ? 'Menyimpan...' : 'Simpan Draf & Keluar'}
              </button>

              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ flex: 1, justifyContent: 'center', border: '1px solid var(--border)' }}
                  onClick={() => {
                    setShowUnsavedModal(false)
                    setPendingNavPath(null)
                  }}
                >
                  Lanjut Mengedit
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ flex: 1, justifyContent: 'center', color: 'var(--danger)', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.04)' }}
                  onClick={() => {
                    isSavedRef.current = true
                    setShowUnsavedModal(false)
                    const dest = pendingNavPath || returnPath
                    if (dest.startsWith('http://') || dest.startsWith('https://')) {
                      window.location.href = dest
                    } else {
                      navigate(dest)
                    }
                  }}
                >
                  Tinggalkan Halaman
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
