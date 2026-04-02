import { supabase } from './supabase'

// ─── USERS ────────────────────────────────────────────────────────────────────
export const users = {
  list: () => supabase.from('users').select('*').order('name'),
  listByRole: (role) => supabase.from('users').select('*').eq('role', role).order('name'),
  getById: (id) => supabase.from('users').select('*').eq('id', id).single(),
  create: (data) => supabase.from('users').insert(data).select().single(),
  update: (id, data) => supabase.from('users').update(data).eq('id', id).select().single(),
  delete: (id) => supabase.from('users').delete().eq('id', id),
  getDistinctKelas: async () => {
    // Fetch all non-null kelas, then deduplicate
    const { data, error } = await supabase.from('users').select('kelas').neq('kelas', null)
    if (error || !data) return { data: [], error }
    const unique = [...new Set(data.map(d => d.kelas).filter(Boolean))]
    return { data: unique.sort((a, b) => a.localeCompare(b, undefined, {numeric: true})), error: null }
  }
}

// ─── EXAMS ────────────────────────────────────────────────────────────────────
export const exams = {
  list: () => supabase.from('exams').select('*, users(name)').order('created_at', { ascending: false }),
  listByTeacher: (teacherId) =>
    supabase.from('exams').select('*').eq('created_by', teacherId).order('created_at', { ascending: false }),
  getById: (id) => supabase.from('exams').select('*').eq('id', id).single(),
  create: (data) => supabase.from('exams').insert(data).select().single(),
  update: (id, data) => supabase.from('exams').update(data).eq('id', id).select().single(),
  delete: (id) => supabase.from('exams').delete().eq('id', id),
  listPublished: () =>
    supabase.from('exams').select('*').eq('status', 'published').order('created_at', { ascending: false }),
}

// ─── QUESTIONS ────────────────────────────────────────────────────────────────
export const questions = {
  listByExam: (examId) =>
    supabase.from('questions').select('*').eq('exam_id', examId).order('number'),
  listByExamAndVariant: (examId, variant) =>
    supabase.from('questions').select('*').eq('exam_id', examId).eq('variant', variant).order('number'),
  create: (data) => supabase.from('questions').insert(data).select().single(),
  createMany: (dataArr) => supabase.from('questions').insert(dataArr).select(),
  update: (id, data) => supabase.from('questions').update(data).eq('id', id).select().single(),
  delete: (id) => supabase.from('questions').delete().eq('id', id),
  deleteByExam: (examId) => supabase.from('questions').delete().eq('exam_id', examId),
}

// ─── EXAM SESSIONS ────────────────────────────────────────────────────────────
export const sessions = {
  get: (studentId, examId) =>
    supabase.from('exam_sessions').select('*').eq('student_id', studentId).eq('exam_id', examId).maybeSingle(),
  create: (data) => supabase.from('exam_sessions').insert(data).select().single(),
  update: (id, data) =>
    supabase.from('exam_sessions').update({ ...data, last_sync: new Date().toISOString() }).eq('id', id).select().single(),
  listByExam: (examId) =>
    supabase
      .from('exam_sessions')
      .select('*, users(name, kelas)')
      .eq('exam_id', examId)
      .order('started_at'),
  reset: (studentId, examId) =>
    supabase
      .from('exam_sessions')
      .update({ status: 'reset', answers: {}, violation_count: 0, current_question: 1, end_timestamp: null })
      .eq('student_id', studentId)
      .eq('exam_id', examId),
}

// ─── RESULTS ──────────────────────────────────────────────────────────────────
export const results = {
  get: (studentId, examId) =>
    supabase.from('results').select('*').eq('student_id', studentId).eq('exam_id', examId).maybeSingle(),
  getById: (id) => supabase.from('results').select('*, users(name, kelas), exams(title, status, passing_grade)').eq('id', id).single(),
  listByExam: (examId) =>
    supabase
      .from('results')
      .select('*, breakdown, users(name, kelas)')
      .eq('exam_id', examId)
      .order('auto_score', { ascending: false }),
  create: (data) => supabase.from('results').insert(data).select().single(),
  update: (id, data) => supabase.from('results').update(data).eq('id', id).select().single(),
  updateEssayScore: (id, essayScore) =>
    supabase.from('results').update({ essay_score: essayScore }).eq('id', id).select().single(),
}
