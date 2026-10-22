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

import { supabase, isSupabaseConfigured } from './supabase.js'
import {
  markSessionAsReturnee,
  markActiveSessionsAsReturnee,
  setExamReturneeToken,
  extendExamReturneeToken,
  clearExamReturneeToken,
  setStudentReturneeToken,
  unlockStudentReturnee,
  verifyAndUnlockReturnee,
  generateReturneeToken,
  isValidReturneeToken,
  sanitizeReturneeToken,
  getExamTokenInfo
} from './returnee.js'
import { broadcastExamLiveUpdate } from './liveExamSync.js'
import { getCurrentUser } from './auth.js'

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
    if (data.username) {
      updatePayload.username = data.username.trim().toLowerCase()
    }
    if (data.kelas !== undefined) updatePayload.class_section = data.kelas
    if (data.phone_number !== undefined) updatePayload.phone = data.phone_number
    if (data.role) {
      updatePayload.role_level = data.role === 'admin' ? 4 : (data.role === 'teacher' ? 3 : (data.role === 'officer' ? 2 : 1))
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id).trim())
    let query = supabase.from('profiles').update(updatePayload)
    if (isUuid) {
      query = query.eq('id', id)
    } else {
      query = query.eq('username', String(id).trim().toLowerCase())
    }
    const { data: updated, error } = await query.select().single()

    if (error) return { data: null, error }

    // If new password is provided, reset it in auth.users as well
    if (data.password && data.password.trim().length >= 6) {
      await users.resetPassword(users._mapProfile(updated), data.password)
    }

    return { data: users._mapProfile(updated), error: null }
  },

  resetPassword: async (target, newPassword) => {
    if (!isSupabaseConfigured || !supabase) {
      return { data: null, error: { message: 'Supabase tidak terkonfigurasi' } }
    }
    if (!newPassword || newPassword.trim().length < 6) {
      return { data: null, error: { message: 'Password minimal 6 karakter' } }
    }

    let userObj = target
    if (typeof target === 'string') {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.trim())
      if (isUuid) {
        const { data, error } = await users.getById(target)
        if (error || !data) return { data: null, error: error || { message: 'Pengguna tidak ditemukan' } }
        userObj = data
      } else {
        const found = await users.getByUsername(target)
        if (!found) return { data: null, error: { message: 'Pengguna tidak ditemukan' } }
        userObj = found
      }
    }

    const username = (userObj.username || userObj.email?.split('@')[0] || '').toLowerCase().trim()
    const roleLevel = userObj.role === 'admin' ? 4 : (userObj.role === 'teacher' ? 3 : (userObj.role === 'officer' ? 2 : 1))
    const fullName = userObj.full_name || userObj.display_name || userObj.name || username

    try {
      const { data: uid, error: rpcErr } = await supabase.rpc('register_seed_user', {
        p_username: username,
        p_password: newPassword.trim(),
        p_full_name: fullName,
        p_display_name: fullName,
        p_email: userObj.email || `${username}@exam.binar.internal`,
        p_role: userObj.role || 'student',
        p_role_level: roleLevel,
        p_class_section: userObj.kelas || null,
        p_phone: userObj.phone_number || null
      })

      if (rpcErr) throw rpcErr
      return { data: { id: uid || userObj.id, success: true }, error: null }
    } catch (err) {
      console.error('[DB] resetPassword error:', err)
      return { data: null, error: err }
    }
  },

  delete: async (id) => {
    if (!isSupabaseConfigured || !supabase) {
      return { data: null, error: { message: 'Supabase tidak terkonfigurasi' } }
    }
    try {
      // Find user profile to get both UUID id and username if available
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, username')
        .or(`id.eq.${id},username.eq.${id}`)
        .maybeSingle()

      const idsToClean = [id]
      if (prof) {
        if (prof.id && !idsToClean.includes(prof.id)) idsToClean.push(prof.id)
        if (prof.username && !idsToClean.includes(prof.username)) idsToClean.push(prof.username)
      }

      // Cascade delete student records across all related tables
      await Promise.allSettled([
        supabase.from('results').delete().in('student_id', idsToClean),
        supabase.from('exam_sessions').delete().in('student_id', idsToClean),
        supabase.from('survey_notifications').delete().in('user_id', idsToClean),
        supabase.from('feature_access').delete().in('user_id', idsToClean),
        supabase.from('student_listening_logs').delete().in('student_id', idsToClean)
      ])

      const { error } = await supabase.from('profiles').delete().or(`id.eq.${id},username.eq.${id}`)
      return { data: null, error }
    } catch (err) {
      console.error('[DB] users.delete error:', err)
      const { error } = await supabase.from('profiles').delete().eq('id', id)
      return { data: null, error: error || err }
    }
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

// ─── CLASSES API ─────────────────────────────────────────────────────────────

export const classes = {
  list: async () => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .order('name', { ascending: true })
    return { data: data || [], error }
  },

  getById: async (id) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    return { data, error }
  },

  create: async (classData) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Supabase tidak terkonfigurasi' } }
    const payload = {
      name: classData.name.trim(),
      grade_level: classData.grade_level ? parseInt(classData.grade_level, 10) : null,
      academic_year: classData.academic_year || '2025/2026',
      homeroom_teacher_id: classData.homeroom_teacher_id || null
    }
    const { data, error } = await supabase
      .from('classes')
      .insert(payload)
      .select()
      .single()
    return { data, error }
  },

  update: async (id, classData) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Supabase tidak terkonfigurasi' } }
    const payload = {}
    if (classData.name !== undefined) payload.name = classData.name.trim()
    if (classData.grade_level !== undefined) payload.grade_level = classData.grade_level ? parseInt(classData.grade_level, 10) : null
    if (classData.academic_year !== undefined) payload.academic_year = classData.academic_year
    if (classData.homeroom_teacher_id !== undefined) payload.homeroom_teacher_id = classData.homeroom_teacher_id || null

    const { data, error } = await supabase
      .from('classes')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    return { data, error }
  },

  delete: async (id) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Supabase tidak terkonfigurasi' } }
    const { error } = await supabase
      .from('classes')
      .delete()
      .eq('id', id)
    return { data: null, error }
  }
}

// ─── ACADEMIC PERIODS API ───────────────────────────────────────────────────

export const academicPeriods = {
  list: async () => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    const { data, error } = await supabase
      .from('academic_periods')
      .select('*')
      .order('start_date', { ascending: false })
    return { data: data || [], error }
  },

  getById: async (id) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    const { data, error } = await supabase
      .from('academic_periods')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    return { data, error }
  },

  create: async (periodData) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Supabase tidak terkonfigurasi' } }
    const payload = {
      name: periodData.name.trim(),
      start_date: periodData.start_date,
      end_date: periodData.end_date,
      is_active: periodData.is_active ?? false
    }
    if (payload.is_active) {
      await supabase.from('academic_periods').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000')
    }
    const { data, error } = await supabase
      .from('academic_periods')
      .insert(payload)
      .select()
      .single()
    return { data, error }
  },

  update: async (id, periodData) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Supabase tidak terkonfigurasi' } }
    const payload = {}
    if (periodData.name !== undefined) payload.name = periodData.name.trim()
    if (periodData.start_date !== undefined) payload.start_date = periodData.start_date
    if (periodData.end_date !== undefined) payload.end_date = periodData.end_date
    if (periodData.is_active !== undefined) {
      payload.is_active = periodData.is_active
      if (periodData.is_active) {
        await supabase.from('academic_periods').update({ is_active: false }).neq('id', id)
      }
    }

    const { data, error } = await supabase
      .from('academic_periods')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    return { data, error }
  },

  delete: async (id) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Supabase tidak terkonfigurasi' } }
    const { error } = await supabase
      .from('academic_periods')
      .delete()
      .eq('id', id)
    return { data: null, error }
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

  _fetchProfilesMap: async (creatorIds) => {
    if (!isSupabaseConfigured || !supabase) return {}
    const validIds = Array.from(new Set(creatorIds)).filter(Boolean)
    if (validIds.length === 0) return {}
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, fullname, username')
        .in('id', validIds)
      if (error) {
        console.warn('[DB] exams._fetchProfilesMap error:', error)
        return {}
      }
      const map = {}
      for (const p of data || []) {
        map[p.id] = p
      }
      return map
    } catch (err) {
      console.warn('[DB] exams._fetchProfilesMap exception:', err)
      return {}
    }
  },

  list: async () => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    const { data, error } = await supabase
      .from('exams')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[DB] exams.list error:', error)
      return { data: [], error }
    }
    const examList = data || []
    const creatorIds = examList.map(e => e.created_by).filter(Boolean)
    const profMap = await exams._fetchProfilesMap(creatorIds)
    const attached = examList.map(e => {
      const prof = profMap[e.created_by]
      return exams._attachRelations({ ...e, profiles: prof })
    })
    return { data: attached, error: null }
  },

  listByTeacher: async (teacherId) => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    const { data, error } = await supabase
      .from('exams')
      .select('*')
      .eq('created_by', teacherId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[DB] exams.listByTeacher error:', error)
      return { data: [], error }
    }
    const examList = data || []
    const profMap = await exams._fetchProfilesMap([teacherId])
    const attached = examList.map(e => {
      const prof = profMap[e.created_by]
      return exams._attachRelations({ ...e, profiles: prof })
    })
    return { data: attached, error: null }
  },

  getById: async (id) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }
    const { data, error } = await supabase
      .from('exams')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error || !data) return { data: null, error: error || { message: 'Ujian tidak ditemukan' } }
    if (data.created_by) {
      const profMap = await exams._fetchProfilesMap([data.created_by])
      data.profiles = profMap[data.created_by] || null
    }
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
    if (created?.created_by) {
      const profMap = await exams._fetchProfilesMap([created.created_by])
      created.profiles = profMap[created.created_by] || null
    }
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
    if (updated?.created_by) {
      const profMap = await exams._fetchProfilesMap([updated.created_by])
      updated.profiles = profMap[updated.created_by] || null
    }
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
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[DB] exams.listPublished error:', error)
      return { data: [], error }
    }
    const examList = data || []
    const creatorIds = examList.map(e => e.created_by).filter(Boolean)
    const profMap = await exams._fetchProfilesMap(creatorIds)
    const attached = examList.map(e => {
      const prof = profMap[e.created_by]
      return exams._attachRelations({ ...e, profiles: prof })
    })
    return { data: attached, error: null }
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

// ─── SHARED STUDENT PROFILES MAP HELPER ───────────────────────────────────────

export async function fetchStudentProfilesMap(studentIds) {
  if (!isSupabaseConfigured || !supabase) return {}
  const rawIds = Array.from(new Set(studentIds)).filter(Boolean)
  if (rawIds.length === 0) return {}
  try {
    const isUuid = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(str).trim())
    const uuidIds = rawIds.filter(isUuid).map(id => String(id).trim().toLowerCase())

    const map = {}
    const addProfileToMap = (p) => {
      if (!p) return
      if (p.id) {
        map[p.id] = p
        map[String(p.id).toLowerCase()] = p
      }
      if (p.username) {
        map[p.username] = p
        map[String(p.username).toLowerCase()] = p
      }
      if (p.email) {
        map[p.email] = p
        map[String(p.email).toLowerCase()] = p
      }
    }

    if (uuidIds.length > 0) {
      const { data: uuidMatches, error: uuidErr } = await supabase
        .from('profiles')
        .select('*')
        .in('id', uuidIds)

      if (!uuidErr && uuidMatches) {
        for (const p of uuidMatches) {
          addProfileToMap(p)
        }
      }
    }

    const missing = rawIds.filter(id => !map[id] && !map[String(id).toLowerCase()])
    if (missing.length > 0) {
      const { data: userMatches, error: userErr } = await supabase
        .from('profiles')
        .select('*')
        .in('username', missing.map(m => String(m).trim().toLowerCase()))

      if (!userErr && userMatches) {
        for (const p of userMatches) {
          addProfileToMap(p)
        }
      }
    }

    return new Proxy(map, {
      get(target, prop) {
        if (typeof prop === 'string') {
          return target[prop] || target[prop.trim()] || target[prop.trim().toLowerCase()] || null
        }
        return target[prop]
      }
    })
  } catch (err) {
    console.warn('[DB] fetchStudentProfilesMap exception:', err)
    return {}
  }
}

// ─── SESSIONS API ─────────────────────────────────────────────────────────────

export const sessions = {
  create: async (data) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }
    const newSession = {
      id: data.id || generateId('sess'),
      variant: data.variant || 'A',
      status: data.status || 'active',
      answers: data.answers || {},
      violation_count: data.violation_count || 0,
      current_question: data.current_question || 1,
      started_at: data.started_at || new Date().toISOString(),
      last_sync: new Date().toISOString(),
      ...data,
    }

    const { data: created, error } = await supabase
      .from('exam_sessions')
      .insert([newSession])
      .select()
      .single()

    if (error) return { data: null, error }
    return { data: created, error: null }
  },

  delete: async (id) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }
    const { error } = await supabase.from('exam_sessions').delete().eq('id', id)
    return { data: null, error }
  },

  deleteByStudent: async (studentId) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }
    const { error } = await supabase.from('exam_sessions').delete().eq('student_id', studentId)
    return { data: null, error }
  },

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

  syncMinimal: async (sessionId, data) => {
    if (!isSupabaseConfigured || !supabase) return { error: null }
    // Updates session with minimal return header (HTTP 204 No Content, zero response body parsing)
    const { error } = await supabase
      .from('exam_sessions')
      .update({ ...data, last_sync: new Date().toISOString() })
      .eq('id', sessionId)

    if (error) return { error }
    return { error: null }
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
    const sessionList = data || []
    const studentIds = sessionList.map(s => s.student_id).filter(Boolean)
    const profMap = await fetchStudentProfilesMap(studentIds)

    const validSessions = []

    for (const s of sessionList) {
      const p = profMap[s.student_id]
      if (p) {
        const name = p.display_name || p.fullname || p.full_name || p.username || 'Siswa'
        const full_name = p.fullname || p.display_name || p.full_name || p.username || name
        const kelas = p.class_section || p.kelas || '—'
        const userObj = {
          id: s.student_id,
          name,
          full_name,
          display_name: name,
          username: p.username || '',
          kelas,
          class_section: kelas,
          classes: { name: kelas }
        }
        s.users = userObj
        s.student = userObj
        validSessions.push(s)
      }
    }

    return { data: validSessions, error: null }
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

  // Accepts reset(sessionId) or reset(studentId, examId) — strictly restricted to Admin account only
  reset: async (sessionIdOrStudentId, examId) => {
    const currentUser = getCurrentUser()
    const isAdmin = currentUser?.level === 4 || currentUser?.role === 'SUPERADMIN' || currentUser?.dbRole === 'admin' || currentUser?.role === 'admin'
    if (currentUser && !isAdmin) {
      return {
        data: null,
        error: { message: 'Akses ditolak: Fitur reset sesi ujian hanya diizinkan untuk akun Admin guna mencegah terhapusnya jawaban siswa secara tidak sengaja.' }
      }
    }

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
      started_at: new Date().toISOString(),
      returnee_token_required: false,
      returnee_token: null,
      returnee_reason: null
    })
  },

  // Add extra time to a student's session (in minute units) without resetting existing answers
  addExtraTime: async (sessionIdOrStudentId, extraMinutes, examId = null) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }
    let session = null
    const { data: byId } = await sessions.getById(sessionIdOrStudentId)
    if (byId) {
      session = byId
    } else if (examId) {
      const { data: byStudent } = await sessions.get(sessionIdOrStudentId, examId)
      session = byStudent
    }
    if (!session) return { data: null, error: { message: 'Sesi ujian tidak ditemukan' } }

    const minutes = Number(extraMinutes) || 0
    if (minutes <= 0) {
      return { data: null, error: { message: 'Jumlah menit tambahan harus lebih dari 0' } }
    }

    const now = Date.now()
    const currentEnd = session.end_timestamp ? new Date(session.end_timestamp).getTime() : now
    // If the session is already expired or ended, start the extra time from NOW.
    // If it's still running, extend from the current end_timestamp.
    const baseTime = currentEnd < now ? now : currentEnd
    const newEndTimestamp = new Date(baseTime + minutes * 60 * 1000).toISOString()

    const updatePayload = {
      status: 'active',
      end_timestamp: newEndTimestamp,
      returnee_token_required: false,
      returnee_token: null,
      returnee_reason: null,
      returnee_unlocked_at: new Date().toISOString(),
      last_sync: new Date().toISOString()
    }

    const { data: updated, error: updateErr } = await supabase
      .from('exam_sessions')
      .update(updatePayload)
      .eq('id', session.id)
      .select()
      .single()

    if (updateErr) return { data: null, error: updateErr }

    // If an auto-submitted premature result exists, remove it so the student can complete the exam
    try {
      await supabase
        .from('results')
        .delete()
        .eq('student_id', session.student_id)
        .eq('exam_id', session.exam_id)
    } catch (delErr) {
      console.warn('[DB] Failed to remove premature result on extra time grant:', delErr)
    }

    // Broadcast live event to open exam room
    try {
      await broadcastExamLiveUpdate(session.exam_id, {
        type: 'EXTRA_TIME_GRANTED',
        studentId: session.student_id,
        sessionId: session.id,
        extraMinutes: minutes,
        newEndTimestamp,
        message: `Pengawas telah menambahkan waktu ujian sebesar +${minutes} menit.`
      })
    } catch (bcErr) {
      console.warn('[DB] Broadcast extra time event error:', bcErr)
    }

    return { data: updated, error: null, newEndTimestamp }
  },

  // Bulk add extra time for multiple sessions
  addExtraTimeBulk: async (sessionIds, extraMinutes, examId = null) => {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return { data: [], error: { message: 'Daftar sesi kosong' } }
    }
    const resultsList = []
    const errors = []
    for (const sid of sessionIds) {
      const res = await sessions.addExtraTime(sid, extraMinutes, examId)
      if (res.error) {
        errors.push({ id: sid, error: res.error.message })
      } else {
        resultsList.push(res.data)
      }
    }
    return { data: resultsList, errors: errors.length > 0 ? errors : null, success: resultsList.length > 0 }
  },

  // Returnee helpers
  markReturnee: markSessionAsReturnee,
  markActiveReturnee: markActiveSessionsAsReturnee,
  setReturneeToken: setStudentReturneeToken,
  unlockReturnee: unlockStudentReturnee,
  verifyReturnee: verifyAndUnlockReturnee,
  setExamReturneeToken,
  extendExamReturneeToken,
  clearExamReturneeToken,
  generateReturneeToken,
  isValidReturneeToken,
  sanitizeReturneeToken,
  getExamTokenInfo
}

// ─── RESULTS API ──────────────────────────────────────────────────────────────

export const results = {
  _attachRelations: (result) => {
    if (!result) return null
    const p = result.profiles || null
    const fallbackName = result.student_id ? `Siswa (${result.student_id.slice(0, 8)})` : 'Siswa'
    const name = p?.fullname || p?.display_name || p?.full_name || p?.name || p?.username || result.users?.full_name || result.users?.name || result.student?.full_name || result.student?.name || fallbackName
    const full_name = p?.fullname || p?.display_name || p?.full_name || p?.name || p?.username || result.users?.full_name || result.student?.full_name || name
    const kelas = p?.class_section || p?.kelas || result.users?.kelas || result.users?.classes?.name || result.student?.kelas || result.student?.class_section || '—'
    const username = p?.username || result.users?.username || result.student?.username || ''

    const userObj = {
      id: p?.id || result.student_id,
      name,
      full_name,
      display_name: name,
      username,
      email: p?.email || p?.contact_email || result.users?.email || '',
      kelas,
      class_section: kelas,
      classes: { name: kelas }
    }

    return {
      ...result,
      student: userObj,
      users: userObj,
      profiles: p || result.profiles || null
    }
  },

  create: async (data) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }

    // Guard against duplicate results for the same student on the same exam
    if (data.exam_id && data.student_id) {
      const { data: existing } = await supabase
        .from('results')
        .select('*')
        .eq('exam_id', data.exam_id)
        .eq('student_id', data.student_id)
        .maybeSingle()

      if (existing) {
        // If existing result already has equal or higher auto_score, preserve it
        const existingScore = (existing.auto_score || 0) + (existing.essay_score || 0)
        const incomingScore = (data.auto_score || 0) + (data.essay_score || 0)
        if (existingScore >= incomingScore) {
          return { data: existing, error: null }
        }
        return results.update(existing.id, data)
      }
    }

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

  get: async (studentIdOrExamId, examIdOrStudentId) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    // Support both get(studentId, examId) and get(examId, studentId)
    const { data, error } = await supabase
      .from('results')
      .select('*')
      .or(`and(student_id.eq.${studentIdOrExamId},exam_id.eq.${examIdOrStudentId}),and(student_id.eq.${examIdOrStudentId},exam_id.eq.${studentIdOrExamId})`)
      .maybeSingle()

    if (error) return { data: null, error }
    return { data: data || null, error: null }
  },

  update: async (id, data) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }
    const updatePayload = { ...data }
    if (updatePayload.breakdown && typeof updatePayload.breakdown !== 'string') {
      updatePayload.breakdown = JSON.stringify(updatePayload.breakdown)
    }

    const { data: updated, error } = await supabase
      .from('results')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (error) return { data: null, error }
    return { data: updated, error: null }
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

  delete: async (id) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }
    const { error } = await supabase.from('results').delete().eq('id', id)
    return { data: null, error }
  },

  deleteByStudent: async (studentId) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: { message: 'Database offline' } }
    const { error } = await supabase.from('results').delete().eq('student_id', studentId)
    return { data: null, error }
  },

  _fetchStudentProfilesMap: fetchStudentProfilesMap,

  listByExam: async (examId) => {
    if (!isSupabaseConfigured || !supabase) return { data: [], error: null }
    const { data, error } = await supabase
      .from('results')
      .select('*')
      .eq('exam_id', examId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[DB] results.listByExam error:', error)
      return { data: [], error }
    }
    const studentIds = (data || []).map(r => r.student_id).filter(Boolean)
    const profMap = await fetchStudentProfilesMap(studentIds)

    const validResults = []
    for (const r of data || []) {
      const p = profMap[r.student_id] || null
      validResults.push(results._attachRelations({ ...r, profiles: p }))
    }

    return { data: validResults, error: null }
  },

  getById: async (id) => {
    if (!isSupabaseConfigured || !supabase) return { data: null, error: null }
    const { data, error } = await supabase
      .from('results')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error || !data) return { data: null, error: error || { message: 'Hasil tidak ditemukan' } }
    if (data.student_id) {
      const profMap = await results._fetchStudentProfilesMap([data.student_id])
      data.profiles = profMap[data.student_id] || null
    }
    if (data.exam_id) {
      const { data: examData } = await exams.getById(data.exam_id)
      data.exams = examData || null
    }
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
    try {
      const [{ data: teacherExamsList }, { data: allPubList }] = await Promise.all([
        teacherId ? exams.listByTeacher(teacherId) : exams.list(),
        exams.listPublished()
      ])
      const teacherExams = teacherExamsList || []
      const teacherExamIds = teacherExams.map(e => e.id)

      const activeExams = teacherExams.filter(e => e.status === 'published').length
      const draftExams = teacherExams.filter(e => e.status === 'draft').length
      const closedExams = teacherExams.filter(e => e.status === 'closed').length
      const allActiveExamsSchool = (allPubList || []).length

      let relevantSessions = []
      let relevantResults = []

      if (isSupabaseConfigured && supabase && teacherExamIds.length > 0) {
        const [sessRes, resultsRes] = await Promise.all([
          supabase.from('exam_sessions').select('*').in('exam_id', teacherExamIds),
          supabase.from('results').select('*').in('exam_id', teacherExamIds)
        ])
        if (sessRes?.data) relevantSessions = sessRes.data
        if (resultsRes?.data) {
          const studentIds = resultsRes.data.map(r => r.student_id).filter(Boolean)
          const profMap = await fetchStudentProfilesMap(studentIds)
          relevantResults = resultsRes.data
            .filter(r => profMap[r.student_id])
            .map(r => results._attachRelations({ ...r, profiles: profMap[r.student_id] }))
        }
      }

      const { data: userList } = await users.list()

      return {
        examList: teacherExams,
        totalExams: teacherExams.length,
        activeExams,
        draftExams,
        closedExams,
        allActiveExamsSchool,
        totalSessions: relevantSessions.length,
        recentResults: relevantResults,
        profiles: (userList || []).map(u => ({ class_section: u.class_section || u.kelas, username: u.username }))
      }
    } catch (err) {
      console.error('[DB] getTeacherStats error:', err)
      return {
        examList: [],
        totalExams: 0,
        activeExams: 0,
        draftExams: 0,
        closedExams: 0,
        allActiveExamsSchool: 0,
        totalSessions: 0,
        recentResults: [],
        profiles: []
      }
    }
  },

  getAdminStats: async () => {
    try {
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
          supabase.from('results').select('*').order('created_at', { ascending: false }).limit(10)
        ])
        totalSessions = sessRes?.count ?? 0
        if (resultsRes?.data) {
          const studentIds = resultsRes.data.map(r => r.student_id).filter(Boolean)
          const profMap = await fetchStudentProfilesMap(studentIds)
          recentResults = resultsRes.data
            .filter(r => profMap[r.student_id])
            .map(r => results._attachRelations({ ...r, profiles: profMap[r.student_id] }))
        }
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
    } catch (err) {
      console.error('[DB] getAdminStats error:', err)
      return {
        profiles: [],
        totalExams: 0,
        activeExams: 0,
        totalSessions: 0,
        recentResults: [],
        latestExams: []
      }
    }
  },

  getAnalyticsStats: async () => {
    try {
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
          supabase.from('results').select('*').order('created_at', { ascending: false }).limit(20)
        ])
        totalSessions = sessRes?.count ?? 0
        if (resultsRes?.data) {
          const studentIds = resultsRes.data.map(r => r.student_id).filter(Boolean)
          const profMap = await fetchStudentProfilesMap(studentIds)
          recentResults = resultsRes.data
            .filter(r => profMap[r.student_id])
            .map(r => results._attachRelations({ ...r, profiles: profMap[r.student_id] }))
        }
      }

      return {
        totalUsers,
        totalTeachers,
        totalExams,
        totalSessions,
        recentResults
      }
    } catch (err) {
      console.error('[DB] getAnalyticsStats error:', err)
      return {
        totalUsers: 0,
        totalTeachers: 0,
        totalExams: 0,
        totalSessions: 0,
        recentResults: []
      }
    }
  }
}
