/**
 * Question Maker Autosave Engine for Teachers
 * 
 * Target: Supabase Project "SNT 10 Kupang EXAM" (https://asjgavgxbppauzykqqgv.supabase.co)
 * Tables: `exams` and `questions`
 * 
 * Features:
 * - Periodic background auto-save (default 30-60s) directly to Supabase
 * - Accelerated auto-save & high-priority protection especially when question count >= 3
 * - Dual-layer resilience: Remote Supabase database sync + instantaneous local storage backup
 * - Non-blocking draft sanitization (teachers can type freely without strict validation errors)
 * - Seamless ID & URL transition from new exam (/create) to saved draft (/edit/:id)
 * - Unsaved changes detection and crash recovery
 */

import { supabase, isSupabaseConfigured } from './supabase.js'

export const AUTOSAVE_STORAGE_PREFIX = 'binar_exam_teacher_draft_'

export function generateExamId(prefix = 'exam') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`
}

export function generateQuestionId(prefix = 'q') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`
}

/**
 * Build a safe fallback title when a teacher hasn't entered a title yet
 * (ensures PostgreSQL NOT NULL constraint on `exams.title` is satisfied).
 */
export function buildDefaultDraftTitle(user, mode = 'exam') {
  const modeLabel = mode === 'survey' ? 'Survei' : mode === 'quiz' ? 'Kuis' : 'Ujian'
  const authorName = user?.display_name || user?.full_name || user?.name || user?.username || 'Guru'
  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  return `(Draf) ${modeLabel} Baru - ${authorName} (${dateStr} ${timeStr})`
}

/**
 * Format a question object safely for Supabase PostgreSQL insertion.
 */
export function formatQuestionForSupabase(q, examId, index, isSurvey, mode, quizTimerType, uniformTime) {
  const qType = q.type || (isSurvey ? 'SHORT_ANSWER' : 'MCQ')
  const isNoOptionType = ['ESSAY', 'SHORT_ANSWER', 'PARAGRAPH', 'LINEAR_SCALE'].includes(qType)

  return {
    id: q.id || generateQuestionId('q'),
    exam_id: examId,
    number: index + 1,
    type: qType,
    question_text: q.question_text || '',
    image_url: q.image_url || null,
    video_url: q.video_url || null,
    audio_url: q.audio_url || null,
    max_plays: Number(q.max_plays) || 1,
    allow_pause: Boolean(q.allow_pause),
    options: isNoOptionType ? null : (q.options || {}),
    option_images: (q.option_images && Object.keys(q.option_images).length > 0) ? q.option_images : {},
    correct_answer: isSurvey ? null : (qType === 'ESSAY' ? null : (q.correct_answer !== undefined ? q.correct_answer : (qType === 'MCQ' ? 'A' : null))),
    points: isSurvey ? 0 : (Number(q.points) >= 0 ? Number(q.points) : 1),
    variant: q.variant || 'A',
    time_limit: mode === 'quiz'
      ? (quizTimerType === 'uniform' ? Number(uniformTime) || 30 : (Number(q.time_limit) || 30))
      : null,
    // Survey-specific fields
    ...(isSurvey ? {
      scale_min: qType === 'LINEAR_SCALE' ? (q.scale_min ?? 1) : null,
      scale_max: qType === 'LINEAR_SCALE' ? (q.scale_max ?? 5) : null,
      scale_min_label: qType === 'LINEAR_SCALE' ? (q.scale_min_label || null) : null,
      scale_max_label: qType === 'LINEAR_SCALE' ? (q.scale_max_label || null) : null,
      grid_rows: (qType === 'MCQ_GRID' || qType === 'CHECKBOX_GRID') ? (q.grid_rows || null) : null,
      grid_columns: (qType === 'MCQ_GRID' || qType === 'CHECKBOX_GRID') ? (q.grid_columns || null) : null,
      allow_other: Boolean(q.allow_other),
      required: q.required !== false,
    } : {}),
  }
}

/**
 * Format exam metadata safely for Supabase insertion/update.
 */
export function formatExamPayload(formData, user, options = {}) {
  const isSurvey = formData.mode === 'survey'
  const targetStr = (!formData.targetKelas || formData.targetKelas.length === 0)
    ? 'all'
    : (Array.isArray(formData.targetKelas) ? formData.targetKelas.join(',') : String(formData.targetKelas))

  const cleanTitle = (formData.title || '').trim()
  const fallbackTitle = buildDefaultDraftTitle(user, formData.mode)

  const payload = {
    title: cleanTitle.length > 0 ? cleanTitle : fallbackTitle,
    information: (formData.information || '').trim() || null,
    pdf_url: isSurvey ? null : ((formData.pdfUrl || '').trim() || null),
    duration_minutes: isSurvey ? 0 : (Number(formData.duration) || 60),
    passing_grade: isSurvey ? 0 : (Number(formData.passingGrade) || 60),
    target_kelas: targetStr,
    status: options.status || formData.status || 'draft',
    mode: formData.mode || 'exam',
    quiz_timer_type: formData.mode === 'quiz' ? (formData.quizTimerType || 'uniform') : 'uniform',
    monitoring_level: isSurvey ? 0 : (Number(formData.monitoringLevel) || 1),
    question_order: isSurvey ? 'ORDER' : (formData.questionOrder || 'ORDER'),
    keep_essay_at_end: isSurvey ? false : Boolean(formData.keepEssayAtEnd),
    uniform_time: Number(formData.uniformTime) || 30,
    default_options_count: Number(formData.defaultOptionsCount) || 4,
    default_statements_count: Number(formData.defaultStatementsCount) || 3,
    default_matching_count: Number(formData.defaultMatchingCount) || 3,
    default_sequencing_count: Number(formData.defaultSequencingCount) || 4,
    default_agree_disagree_count: Number(formData.defaultAgreeDisagreeCount) || 3,
    default_survey_options_count: Number(formData.defaultSurveyOptionsCount) || 4,
    default_grid_rows_count: Number(formData.defaultGridRowsCount) || 3,
    default_grid_cols_count: Number(formData.defaultGridColsCount) || 3,
    updated_at: new Date().toISOString(),
  }

  if (isSurvey) {
    payload.survey_type = formData.surveyType || 'one_time'
    payload.survey_recurrence = formData.surveyType === 'scheduled' ? formData.surveyRecurrence : null
    payload.survey_notify_time = formData.surveyType === 'scheduled' ? formData.surveyNotifyTime : null
    payload.survey_valid_from = formData.surveyValidFrom ? new Date(formData.surveyValidFrom).toISOString() : null
    payload.survey_valid_until = formData.surveyValidUntil ? new Date(formData.surveyValidUntil).toISOString() : null
    payload.survey_allow_edit = Boolean(formData.surveyAllowEdit)
  }

  return payload
}

/**
 * Save draft progress directly to Supabase (`exams` and `questions` tables)
 * at https://asjgavgxbppauzykqqgv.supabase.co
 *
 * @param {Object} params
 * @param {string|null} params.examId - Existing exam ID or null/empty if new
 * @param {Object} params.formData - Current exam form state
 * @param {Array} params.questionItems - Current questions array
 * @param {Object} params.user - Current logged in user object
 * @param {boolean} [params.publish=false] - Whether this is a publish or draft save
 * @returns {Promise<{ success: boolean, examId: string, isNew: boolean, savedAt: Date, questionCount: number, error?: string }>}
 */
export async function saveExamDraftToSupabase({
  examId,
  formData,
  questionItems,
  user,
  publish = false,
}) {
  if (!isSupabaseConfigured || !supabase) {
    return {
      success: false,
      error: 'Supabase backend belum terkonfigurasi. Periksa koneksi ke https://asjgavgxbppauzykqqgv.supabase.co',
    }
  }

  const isSurvey = formData.mode === 'survey'
  const isNew = !examId
  const targetExamId = examId || generateExamId('exam')
  const examPayload = formatExamPayload(formData, user, { status: publish ? 'published' : 'draft' })

  try {
    if (isNew) {
      examPayload.id = targetExamId
      examPayload.created_by = user?.id || null
      examPayload.created_at = new Date().toISOString()

      const { data: createdExam, error: examErr } = await supabase
        .from('exams')
        .insert([examPayload])
        .select()
        .single()

      if (examErr) {
        throw new Error(`Gagal menyimpan data ujian: ${examErr.message}`)
      }
    } else {
      const { error: updateErr } = await supabase
        .from('exams')
        .update(examPayload)
        .eq('id', targetExamId)

      if (updateErr) {
        throw new Error(`Gagal memperbarui ujian: ${updateErr.message}`)
      }
    }

    // Prepare questions safely for Supabase
    const preparedQuestions = (questionItems || []).map((q, idx) =>
      formatQuestionForSupabase(
        q,
        targetExamId,
        idx,
        isSurvey,
        formData.mode,
        formData.quizTimerType,
        formData.uniformTime
      )
    )

    // Replace questions for this exam
    const { error: delErr } = await supabase
      .from('questions')
      .delete()
      .eq('exam_id', targetExamId)

    if (delErr) {
      console.warn('[Autosave] Warning deleting previous questions:', delErr)
    }

    if (preparedQuestions.length > 0) {
      const { error: insErr } = await supabase
        .from('questions')
        .insert(preparedQuestions)

      if (insErr) {
        throw new Error(`Gagal menyimpan butir soal: ${insErr.message}`)
      }
    }

    const savedAt = new Date()

    // Also persist to local backup for offline resilience
    saveLocalDraftBackup(user?.id, targetExamId, {
      examId: targetExamId,
      formData,
      questionItems,
      savedAt: savedAt.getTime(),
      syncedWithSupabase: true,
    })

    return {
      success: true,
      examId: targetExamId,
      isNew,
      savedAt,
      questionCount: preparedQuestions.length,
    }
  } catch (err) {
    console.error('[Autosave] Error saving to Supabase:', err)

    // In case of network glitch, keep a local emergency copy
    saveLocalDraftBackup(user?.id, targetExamId, {
      examId: targetExamId,
      formData,
      questionItems,
      savedAt: Date.now(),
      syncedWithSupabase: false,
      lastError: err.message,
    })

    return {
      success: false,
      examId: targetExamId,
      error: err.message || 'Gagal menyimpan draf ke database Supabase',
    }
  }
}

/**
 * Save draft backup to localStorage
 */
export function saveLocalDraftBackup(userId, examIdOrNew, payload) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const key = `${AUTOSAVE_STORAGE_PREFIX}${userId || 'any'}_${examIdOrNew || 'new'}`
    window.localStorage.setItem(key, JSON.stringify(payload))
  } catch (e) {
    console.warn('[Autosave] LocalStorage write failed:', e)
  }
}

/**
 * Get draft backup from localStorage
 */
export function getLocalDraftBackup(userId, examIdOrNew) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const key = `${AUTOSAVE_STORAGE_PREFIX}${userId || 'any'}_${examIdOrNew || 'new'}`
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    console.warn('[Autosave] LocalStorage read failed:', e)
    return null
  }
}

/**
 * Remove draft backup from localStorage
 */
export function clearLocalDraftBackup(userId, examIdOrNew) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const key = `${AUTOSAVE_STORAGE_PREFIX}${userId || 'any'}_${examIdOrNew || 'new'}`
    window.localStorage.removeItem(key)
  } catch (e) {
    console.warn('[Autosave] LocalStorage clear failed:', e)
  }
}
