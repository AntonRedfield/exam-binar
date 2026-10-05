/**
 * Database Module (BOLOS Engine) — Supabase PostgreSQL Backend
 * 
 * Interacts directly with Supabase PostgreSQL:
 * - Profiles / Users (SNT 10 Kupang Admin, Teachers, and Students)
 * - Exams & Surveys
 * - Questions (MCQ, Complex MCQ, True/False, Matching, Sequencing, Essay, Survey fields)
 * - Exam Sessions & Real-time Proctoring
 * - Results & Grading
 * - Survey Notifications
 */

import { supabase, isSupabaseConfigured } from './supabase'

// ─── Clean up any conflicting legacy local mock storage ─────────────────────
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem('binar_exam_local_db_v2')
    window.localStorage.removeItem('binar_exam_local_db')
  }
} catch (e) {
  // Ignore in non-browser environment
}

function generateId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`
}

// ─── USERS API ────────────────────────────────────────────────────────────────

export const users = {
  _mapProfile: (p) => {
    if (!p) return null
    let role = 'student'
    if (p.role_level === 4) {
      role = 'admin'
    } else if (p.role_level === 3) {
      role = 'teacher'
    } else if (p.role_level === 2) {
      role = 'officer'
    } else {
      role = 'student'
    }

    return {
      id: p.id,
      email: p.contact_email || p.email || `${p.username}@exam.binar.internal`,
      username: p.username,
      full_name: p.display_name || p.fullname || p.full_name || p.username,
      name: p.display_name || p.fullname || p.full_name || p.username,
      display_name: p.display_name || p.fullname || p.full_name || p.username,
      kelas: p.class_section || p.kelas || '',
      class_section: p.class_section || p.kelas || '',
      role: role,
      role_level: p.role_level || (role === 'admin' ? 4 : (role === 'teacher' ? 3 : 1)),
      phone_number: p.contact_phone || p.phone || p.phone_number || '',
      classes: (p.class_section || p.kelas) ? { name: p.class_section || p.kelas } : null,
    }
  },

  list: async () => {
    if (!isSupabaseConfigured || !supabase) {
      return { data: [], error: { message: 'Supabase backend belum terkonfigurasi' } }
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('fullname', { ascending: true })

    if (error) return { data: [], error }
    return { data: (data || []).map(users._mapProfile), error: null }
  },

  listByRole: async (role) => {
    const { data, error } = await users.list()
    if (error) return { data: [], error }

    let filtered
    if (role === 'USER') {
      filtered = (data || []).filter(u => u.role === 'student' || u.role === 'officer' || u.role === 'parent')
    } else if (role === 'MODERATOR') {
      filtered = (data || []).filter(u => u.role === 'teacher')
    } else if (role === 'SUPERADMIN') {
      filtered = (data || []).filter(u => u.role === 'admin')
    } else {
      filtered = data || []
    }
    return { data: filtered, error: null }
  },

  getById: async (id) => {
    if (!isSupabaseConfigured || !supabase) {
      return { data: null, error: { message: 'Supabase tidak terkonfigurasi' } }
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error || !data) return { data: null, error: error || { message: 'User tidak ditemukan' } }
    return { data: users._mapProfile(data), error: null }
  },

  getByUsername: async (username) => {
    if (!isSupabaseConfigured || !supabase) return null
    const clean = username.trim().toLowerCase()
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.${clean},email.ilike.${clean}`)
      .maybeSingle()

    return data ? users._mapProfile(data) : null
  },

  create: async (data) => {
    if (!isSupabaseConfigured || !supabase) {
      return { data: null, error: { message: 'Supabase tidak terkonfigurasi' } }
    }

    const rawName = (data.full_name || 'user').toLowerCase().trim().replace(/[^a-z0-9]/g, '.')
    let username = data.username || rawName
    const roleLevel = data.role === 'admin' ? 4 : (data.role === 'teacher' ? 3 : (data.role === 'officer' ? 2 : 1))

    try {
      const { data: uid, error: rpcErr } = await supabase.rpc('register_seed_user', {
        p_username: username,
        p_password: data.password || 'password',
        p_full_name: data.full_name,
        p_display_name: data.full_name,
        p_email: data.email || `${username}@exam.binar.internal`,
        p_role: data.role || 'student',
        p_role_level: roleLevel,
        p_class_section: data.kelas || null,
        p_phone: data.phone_number || null
      })

      if (rpcErr) throw rpcErr

      const { data: newProfile } = await supabase.from('profiles').select('*').eq('id', uid).single()
      return { data: users._mapProfile(newProfile), error: null }
    } catch (err) {
      return { data: null, error: err }
    }
  },

  update: async (id, data) => {
    if (!isSupabaseConfigured || !supabase) {
      return { data: null, error: { message: 'Supabase tidak terkonfigurasi' } }
    }

    const updatePayload = {}
    if (data.full_name) {
      updatePayload.fullname = data.full_name
      updatePayload.display_name = data.full_name
    }
    if (data.kelas !== undefined) updatePayload.class_section = data.kelas
    if (data.phone_number !== undefined) updatePayload.phone = data.phone_number
    if (data.role) {
      updatePayload.role_level = data.role === 'admin' ? 4 : (data.role === 'teacher' ? 3 : (data.role === 'officer' ? 2 : 1))
    }

    const { data: updated, error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (error) return { data: null, error }
    return { data: users._mapProfile(updated), error: null }
  },

  delete: async (id) => {
    if (!isSupabaseConfigured || !supabase) {
      return { data: null, error: { message: 'Supabase tidak terkonfigurasi' } }
    }
    const { error } = await supabase.from('profiles').delete().eq('id', id)
    return { data: null, error }
  },

  getDistinctKelas: async () => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    const { data } = await supabase.from('classes').select('name').order('name')
    if (data && data.length > 0) {
      return { data: data.map(c => c.name), error: null }
    }
    const { data: profs } = await supabase.from('profiles').select('class_section')
    const unique = Array.from(new Set((profs || []).map(p => p.class_section).filter(Boolean))).sort()
    return { data: unique, error: null }
  }
}

// ─── EXAMS API ────────────────────────────────────────────────────────────────

export const exams = {
  _attachRelations: (exam) => {
    if (!exam) return null
    if (exam.profiles) {
      const p = exam.profiles
      return {
        ...exam,
        profiles: { display_name: p.display_name || p.fullname },
        users: { name: p.display_name || p.fullname, username: p.username }
      }
    }
    return {
      ...exam,
      profiles: null,
      users: null
    }
  },

  list: async () => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    const { data, error } = await supabase
      .from('exams')
      .select('*, profiles:created_by(id, display_name, fullname, username)')
      .order('created_at', { ascending: false })

    if (error) return { data: [], error }
    return { data: (data || []).map(exams._attachRelations), error: null }
  },

  listByTeacher: async (teacherId) => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    const { data, error } = await supabase
      .from('exams')
      .select('*, profiles:created_by(id, display_name, fullname, username)')
      .eq('created_by', teacherId)
      .order('created_at', { ascending: false })

    if (error) return { data: [], error }
    return { data: (data || []).map(exams._attachRelations), error: null }
  },

  getById: async (id) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }
    const { data, error } = await supabase
      .from('exams')
      .select('*, profiles:created_by(id, display_name, fullname, username)')
      .eq('id', id)
      .maybeSingle()

    if (error || !data) return { data: null, error: error || { message: 'Ujian tidak ditemukan' } }
    return { data: exams._attachRelations(data), error: null }
  },

  create: async (data) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }
    const newExam = {
      id: data.id || generateId('exam'),
      created_at: new Date().toISOString(),
      status: 'draft',
      mode: 'exam',
      ...data,
    }

    const { data: created, error } = await supabase
      .from('exams')
      .insert([newExam])
      .select()
      .single()

    if (error) return { data: null, error }
    return { data: exams._attachRelations(created), error: null }
  },

  update: async (id, data) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }
    const { data: updated, error } = await supabase
      .from('exams')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) return { data: null, error }
    return { data: exams._attachRelations(updated), error: null }
  },

  delete: async (id) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    const { error } = await supabase.from('exams').delete().eq('id', id)
    return { data: null, error }
  },

  listPublished: async () => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    const { data, error } = await supabase
      .from('exams')
      .select('*, profiles:created_by(id, display_name, fullname, username)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })

    if (error) return { data: [], error }
    return { data: (data || []).map(exams._attachRelations), error: null }
  }
}

// ─── QUESTIONS API ────────────────────────────────────────────────────────────

export const questions = {
  listByExam: async (examId) => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('exam_id', examId)
      .order('number', { ascending: true })

    if (error) return { data: [], error }
    return { data: data || [], error: null }
  },

  listByExamAndVariant: async (examId, variant) => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    let q = supabase
      .from('questions')
      .select('*')
      .eq('exam_id', examId)
      .order('number', { ascending: true })

    if (variant) q = q.eq('variant', variant)
    const { data, error } = await q
    if (error) return { data: [], error }
    return { data: data || [], error: null }
  },

  create: async (data) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }
    const newQ = {
      id: data.id || generateId('q'),
      ...data
    }

    const { data: created, error } = await supabase
      .from('questions')
      .insert([newQ])
      .select()
      .single()

    if (error) return { data: null, error }
    return { data: created, error: null }
  },

  createMany: async (dataArr) => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    const created = dataArr.map(d => ({
      id: d.id || generateId('q'),
      ...d
    }))

    const { data: inserted, error } = await supabase
      .from('questions')
      .insert(created)
      .select()

    if (error) return { data: null, error }
    return { data: inserted || [], error: null }
  },

  update: async (id, data) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    const { data: updated, error } = await supabase
      .from('questions')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error) return { data: null, error }
    return { data: updated, error: null }
  },

  delete: async (id) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    const { error } = await supabase.from('questions').delete().eq('id', id)
    return { data: null, error }
  },

  deleteByExam: async (examId) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    const { error } = await supabase.from('questions').delete().eq('exam_id', examId)
    return { data: null, error }
  }
}

// ─── SESSIONS API ─────────────────────────────────────────────────────────────

export const sessions = {
  getOrCreate: async (examId, studentId, variant = 'A') => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }

    const { data: existing } = await supabase
      .from('exam_sessions')
      .select('*')
      .eq('exam_id', examId)
      .eq('student_id', studentId)
      .maybeSingle()

    if (existing) return { data: existing, error: null }

    const newSession = {
      id: generateId('sess'),
      student_id: studentId,
      exam_id: examId,
      variant: variant || 'A',
      status: 'active',
      answers: {},
      violation_count: 0,
      current_question: 1,
      started_at: new Date().toISOString(),
      last_sync: new Date().toISOString(),
    }

    const { data: created, error } = await supabase
      .from('exam_sessions')
      .insert([newSession])
      .select()
      .single()

    if (error) return { data: null, error }
    return { data: created, error: null }
  },

  update: async (sessionId, data) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    const { data: updated, error } = await supabase
      .from('exam_sessions')
      .update({ ...data, last_sync: new Date().toISOString() })
      .eq('id', sessionId)
      .select()
      .single()

    if (error) return { data: null, error }
    return { data: updated, error: null }
  },

  getById: async (id) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    const { data, error } = await supabase
      .from('exam_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error || !data) return { data: null, error: error || { message: 'Sesi tidak ditemukan' } }
    return { data, error: null }
  },

  listByExam: async (examId) => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    const { data, error } = await supabase
      .from('exam_sessions')
      .select('*')
      .eq('exam_id', examId)

    if (error) return { data: [], error }
    return { data: data || [], error: null }
  },

  get: async (studentId, examId) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    const { data, error } = await supabase
      .from('exam_sessions')
      .select('*')
      .eq('exam_id', examId)
      .eq('student_id', studentId)
      .maybeSingle()
    if (error) return { data: null, error }
    return { data: data || null, error: null }
  },

  create: async (data) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }
    const now = new Date().toISOString()
    const payload = {
      id: generateId('sess'),
      variant: 'A',
      status: 'active',
      answers: {},
      violation_count: 0,
      current_question: 1,
      started_at: now,
      last_sync: now,
      ...data,
    }
    const { data: created, error } = await supabase
      .from('exam_sessions')
      .insert([payload])
      .select()
      .single()
    if (error) {
      console.error('sessions.create failed:', error)
      return { data: null, error }
    }
    return { data: created, error: null }
  },

  // Accepts reset(sessionId) or reset(studentId, examId)
  reset: async (sessionIdOrStudentId, examId) => {
    let sessionId = sessionIdOrStudentId
    if (examId) {
      const { data: existing } = await sessions.get(sessionIdOrStudentId, examId)
      if (!existing) return { data: null, error: { message: 'Sesi tidak ditemukan' } }
      sessionId = existing.id
    }
    return sessions.update(sessionId, {
      status: 'reset',
      violation_count: 0,
      answers: {},
      current_question: 1,
      started_at: new Date().toISOString()
    })
  }
}

// ─── RESULTS API ──────────────────────────────────────────────────────────────

export const results = {
  _attachRelations: (result) => {
    if (!result) return null
    if (result.profiles) {
      return {
        ...result,
        student: {
          display_name: result.profiles.display_name || result.profiles.fullname,
          full_name: result.profiles.display_name || result.profiles.fullname,
          kelas: result.profiles.class_section || '',
          class_section: result.profiles.class_section || '',
          username: result.profiles.username,
        }
      }
    }
    return {
      ...result,
      student: null
    }
  },

  create: async (data) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }
    const newResult = {
      id: data.id || generateId('res'),
      submitted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      ...data,
      breakdown: typeof data.breakdown === 'string' ? data.breakdown : JSON.stringify(data.breakdown || [])
    }

    const { data: created, error } = await supabase
      .from('results')
      .insert([newResult])
      .select()
      .single()

    if (error) return { data: null, error }
    return { data: created, error: null }
  },

  getByExamAndStudent: async (examId, studentId) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    const { data, error } = await supabase
      .from('results')
      .select('*')
      .eq('exam_id', examId)
      .eq('student_id', studentId)
      .maybeSingle()

    return { data: data || null, error }
  },

  listByExam: async (examId) => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    const { data, error } = await supabase
      .from('results')
      .select('*, profiles:student_id(id, display_name, fullname, username, class_section)')
      .eq('exam_id', examId)
      .order('created_at', { ascending: false })

    if (error) return { data: [], error }
    return { data: (data || []).map(results._attachRelations), error: null }
  },

  getById: async (id) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    const { data, error } = await supabase
      .from('results')
      .select('*, profiles:student_id(id, display_name, fullname, username, class_section)')
      .eq('id', id)
      .maybeSingle()

    if (error || !data) return { data: null, error: error || { message: 'Hasil tidak ditemukan' } }
    return { data: results._attachRelations(data), error: null }
  },

  updateEssayScore: async (id, essayScore) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    const { data: updated, error } = await supabase
      .from('results')
      .update({ essay_score: Number(essayScore) })
      .eq('id', id)
      .select()
      .single()

    if (error) return { data: null, error }
    return { data: updated, error: null }
  }
}

// ─── NOTIFICATIONS API ────────────────────────────────────────────────────────

export const notifications = {
  listByUser: async (userId) => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    const { data, error } = await supabase
      .from('survey_notifications')
      .select('*, exams:exam_id(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) return { data: [], error }
    return { data: data || [], error: null }
  },

  markAsRead: async (id) => {
    if (!isSupabaseConfigured || !supabase) return { error: null }
    const { error } = await supabase
      .from('survey_notifications')
      .update({ is_read: true })
      .eq('id', id)
    return { error }
  },

  create: async (data) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    const newNotif = {
      id: generateId('notif'),
      created_at: new Date().toISOString(),
      is_read: false,
      ...data
    }

    const { data: created, error } = await supabase
      .from('survey_notifications')
      .insert([newNotif])
      .select()
      .single()

    if (error) return { data: null, error }
    return { data: created, error: null }
  }
}

// ─── SURVEYS API ──────────────────────────────────────────────────────────────

export const surveys = {
  listActive: async (userClass = '') => {
    const { data: allPublished } = await exams.listPublished()
    const surveyList = (allPublished || []).filter(e => e.mode === 'survey')
    if (!userClass) return { data: surveyList, error: null }

    const filtered = surveyList.filter(s => {
      if (!s.target_kelas || s.target_kelas === 'all') return true
      const targetList = s.target_kelas.split(',').map(c => c.trim())
      return targetList.includes(userClass)
    })
    return { data: filtered, error: null }
  }
}

// ─── LOCAL DB STATS (Supabase Backend) ────────────────────────────────────────

export const localDb = {
  resetToInitial: () => {
    try {
      localStorage.removeItem('binar_exam_local_db_v2')
      localStorage.removeItem('binar_exam_local_db')
    } catch (e) {}
    return { users: [], exams: [], questions: [], exam_sessions: [], results: [] }
  },

  getRawData: () => ({}),

  getTeacherStats: async (teacherId) => {
    const { data: teacherExamsList } = await exams.listByTeacher(teacherId)
    const teacherExams = teacherExamsList || []
    const teacherExamIds = teacherExams.map(e => e.id)

    const activeExams = teacherExams.filter(e => e.status === 'published').length
    const draftExams = teacherExams.filter(e => e.status === 'draft').length
    const closedExams = teacherExams.filter(e => e.status === 'closed').length

    let relevantSessions = []
    let relevantResults = []

    if (isSupabaseConfigured && supabase && teacherExamIds.length > 0) {
      const [sessRes, resultsRes] = await Promise.all([
        supabase.from('exam_sessions').select('*').in('exam_id', teacherExamIds),
        supabase.from('results').select('*, profiles:student_id(id, display_name, fullname, username, class_section)').in('exam_id', teacherExamIds)
      ])
      if (sessRes.data) relevantSessions = sessRes.data
      if (resultsRes.data) relevantResults = resultsRes.data.map(r => results._attachRelations(r))
    }

    const { data: userList } = await users.list()

    return {
      examList: teacherExams,
      totalExams: teacherExams.length,
      activeExams,
      draftExams,
      closedExams,
      totalSessions: relevantSessions.length,
      recentResults: relevantResults,
      profiles: (userList || []).map(u => ({ class_section: u.class_section || u.kelas, username: u.username }))
    }
  },

  getAdminStats: async () => {
    const { data: userList } = await users.list()
    const { data: allExams } = await exams.list()

    const allProfiles = (userList || []).map(u => ({
      class_section: u.class_section || u.kelas,
      username: u.username,
      display_name: u.display_name,
      role: u.role
    }))

    const examItems = allExams || []
    const totalExams = examItems.length
    const activeExams = examItems.filter(e => e.status === 'published').length
    
    let totalSessions = 0
    let recentResults = []

    if (isSupabaseConfigured && supabase) {
      const [sessRes, resultsRes] = await Promise.all([
        supabase.from('exam_sessions').select('id', { count: 'exact', head: true }),
        supabase.from('results').select('*, profiles:student_id(id, display_name, fullname, username, class_section)').order('created_at', { ascending: false }).limit(10)
      ])
      totalSessions = sessRes.count ?? 0
      if (resultsRes.data) recentResults = resultsRes.data.map(r => results._attachRelations(r))
    }

    const sortedExams = [...examItems]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 5)

    return {
      profiles: allProfiles,
      totalExams,
      activeExams,
      totalSessions,
      recentResults,
      latestExams: sortedExams
    }
  },

  getAnalyticsStats: async () => {
    const { data: userList } = await users.list()
    const { data: allExams } = await exams.list()

    const usersArr = userList || []
    const totalUsers = usersArr.filter(u => u.role === 'student' || u.role === 'officer' || u.role === 'parent').length
    const totalTeachers = usersArr.filter(u => u.role === 'teacher').length
    const totalExams = (allExams || []).length

    let totalSessions = 0
    let recentResults = []

    if (isSupabaseConfigured && supabase) {
      const [sessRes, resultsRes] = await Promise.all([
        supabase.from('exam_sessions').select('id', { count: 'exact', head: true }),
        supabase.from('results').select('*, profiles:student_id(id, display_name, fullname, username, class_section)').order('created_at', { ascending: false }).limit(20)
      ])
      totalSessions = sessRes.count ?? 0
      if (resultsRes.data) recentResults = resultsRes.data.map(r => results._attachRelations(r))
    }

    return {
      totalUsers,
      totalTeachers,
      totalExams,
      totalSessions,
      recentResults
    }
  }
}
