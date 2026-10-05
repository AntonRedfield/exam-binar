/**
 * Database Module (BOLOS Engine) — Supabase PostgreSQL Backend with Offline-First Local Cache
 * 
 * Provides unified access to:
 * - Users / Profiles (Admin, Teacher, Students, Officers)
 * - Exams & Surveys
 * - Questions (MCQ, Complex MCQ, True/False, Essay, Survey fields)
 * - Sessions & Autosave
 * - Results & Grading
 * - Survey Notifications
 */

import { supabase, isSupabaseConfigured } from './supabase'

const STORAGE_KEY = 'binar_exam_local_db_v2'

// ─── Default Initial Seed Data (Fallback & Local Offline Cache) ───────────────

const INITIAL_ADMINS = [
  {
    id: '89aabacf-c540-4491-9752-244e55c0e1c3',
    username: 'admin1',
    password: 'admin1',
    display_name: 'Administrator 1',
    full_name: 'Administrator 1',
    contact_email: 'admin1@exam.binar.internal',
    email: 'admin1@exam.binar.internal',
    role: 'admin',
    level: 4,
    class_section: '',
    contact_phone: '081200000001',
    created_at: new Date('2026-01-01T08:00:00Z').toISOString(),
  },
  {
    id: '4c589657-316f-47fd-bf23-d16137257d5f',
    username: 'admin2',
    password: 'admin2',
    display_name: 'Administrator 2',
    full_name: 'Administrator 2',
    contact_email: 'admin2@exam.binar.internal',
    email: 'admin2@exam.binar.internal',
    role: 'admin',
    level: 4,
    class_section: '',
    contact_phone: '081200000002',
    created_at: new Date('2026-01-01T08:30:00Z').toISOString(),
  },
  {
    id: 'c702496a-cec9-42d7-8b9b-9b9f15380ef5',
    username: 'admin3',
    password: 'admin3',
    display_name: 'Administrator 3',
    full_name: 'Administrator 3',
    contact_email: 'admin3@exam.binar.internal',
    email: 'admin3@exam.binar.internal',
    role: 'admin',
    level: 4,
    class_section: '',
    contact_phone: '081200000003',
    created_at: new Date('2026-01-01T09:00:00Z').toISOString(),
  }
]

const TEACHER_MAP = [
  'Matematika', 'Fisika', 'Biologi', 'Kimia', 'Bahasa Indonesia',
  'Bahasa Inggris', 'Sejarah', 'Geografi', 'Sosiologi', 'Ekonomi'
]

const INITIAL_TEACHERS = Array.from({ length: 10 }, (_, i) => {
  const num = i + 1
  const mapel = TEACHER_MAP[i]
  return {
    id: `usr-teacher-${String(num).padStart(2, '0')}`,
    username: `guru-${num}`,
    password: `guru-${num}`,
    display_name: `Guru ${num} (${mapel})`,
    full_name: `Guru Pengajar ${num} (${mapel}), S.Pd.`,
    contact_email: `guru-${num}@exam.binar.internal`,
    email: `guru-${num}@exam.binar.internal`,
    role: 'teacher',
    level: 3,
    class_section: '',
    contact_phone: `0812100000${String(num).padStart(2, '0')}`,
    created_at: new Date('2026-01-02T08:00:00Z').toISOString(),
  }
})

const INITIAL_STUDENTS = Array.from({ length: 20 }, (_, i) => {
  const num = i + 1
  const kelas = num <= 10 ? 'XII-IPA-1' : 'XII-IPS-1'
  return {
    id: `usr-student-${String(num).padStart(2, '0')}`,
    username: `murid-${num}`,
    password: `murid-${num}`,
    display_name: `Murid ${String(num).padStart(2, '0')}`,
    full_name: `Siswa Murid ${String(num).padStart(2, '0')}`,
    contact_email: `murid-${num}@exam.binar.internal`,
    email: `murid-${num}@exam.binar.internal`,
    role: 'student',
    level: 1,
    class_section: kelas,
    contact_phone: `0813200000${String(num).padStart(2, '0')}`,
    created_at: new Date('2026-01-03T08:00:00Z').toISOString(),
  }
})

const INITIAL_USERS = [
  ...INITIAL_ADMINS,
  ...INITIAL_TEACHERS,
  ...INITIAL_STUDENTS,
]

const INITIAL_EXAMS = [
  {
    id: 'exam-matematika-01',
    title: 'Ujian Akhir Semester - Matematika Wajib',
    description: 'Ujian Akhir Semester Matematika Wajib Kelas XII',
    subject: 'Matematika',
    duration_minutes: 60,
    passing_grade: 75,
    status: 'published',
    mode: 'exam',
    target_kelas: 'all',
    created_by: '20e6fecf-3374-46c6-821a-a3e40d0ac97f',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    monitoring_level: 2,
    quiz_timer_type: 'uniform',
    question_order: 'ORDER',
    uniform_time: 30,
    pdf_url: '',
    information: 'Kerjakan soal dengan teliti dan jujur. Fitur anti-curang aktif.',
  },
  {
    id: 'survey-evaluasi-01',
    title: 'Survei Evaluasi Pembelajaran Semester',
    description: 'Kuesioner evaluasi proses belajar mengajar dan fasilitas',
    subject: 'Evaluasi Pembelajaran',
    duration_minutes: 30,
    passing_grade: 0,
    status: 'published',
    mode: 'survey',
    target_kelas: 'all',
    created_by: '20e6fecf-3374-46c6-821a-a3e40d0ac97f',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    monitoring_level: 1,
    quiz_timer_type: 'uniform',
    question_order: 'ORDER',
    uniform_time: 30,
    pdf_url: '',
    information: 'Survei ini bertujuan untuk perbaikan kualitas pembelajaran.',
  }
]

const INITIAL_QUESTIONS = [
  {
    id: 'q-mat-1',
    exam_id: 'exam-matematika-01',
    number: 1,
    type: 'MCQ',
    question_text: 'Nilai dari lim (x → 3) [(x² - 9) / (x - 3)] adalah...',
    image_url: '',
    options: { A: '3', B: '6', C: '9', D: '12' },
    correct_answer: 'B',
    points: 25,
    variant: 'A',
    time_limit: null,
  },
  {
    id: 'q-mat-2',
    exam_id: 'exam-matematika-01',
    number: 2,
    type: 'MCQ',
    question_text: 'Turunan pertama dari f(x) = 3x² + 5x - 7 adalah...',
    image_url: '',
    options: { A: '6x + 5', B: '3x + 5', C: '6x - 7', D: '3x² + 5' },
    correct_answer: 'A',
    points: 25,
    variant: 'A',
    time_limit: null,
  },
  {
    id: 'q-mat-3',
    exam_id: 'exam-matematika-01',
    number: 3,
    type: 'TRUE_FALSE',
    question_text: 'Tentukan kebenaran dari setiap pernyataan matematika berikut:',
    image_url: '',
    options: {
      stmt_1: 'Dua garis dikatakan saling tegak lurus jika hasil kali kedua gradiennya sama dengan -1 (m₁ · m₂ = -1).',
      stmt_2: 'Dua garis sejajar memiliki gradien yang saling berkebalikan negatif.',
      stmt_3: 'Garis dengan persamaan y = 3x + 2 memiliki gradien 3.'
    },
    correct_answer: {
      stmt_1: 'true',
      stmt_2: 'false',
      stmt_3: 'true'
    },
    points: 25,
    variant: 'A',
    time_limit: null,
  },
  {
    id: 'q-mat-4',
    exam_id: 'exam-matematika-01',
    number: 4,
    type: 'ESSAY',
    question_text: 'Jelaskan bagaimana konsep turunan dapat digunakan untuk menentukan titik stasioner dan jenisnya (maksimum/minimum)!',
    image_url: '',
    options: {},
    correct_answer: '',
    points: 25,
    variant: 'A',
    time_limit: null,
  },
  {
    id: 'q-surv-1',
    exam_id: 'survey-evaluasi-01',
    number: 1,
    type: 'LINEAR_SCALE',
    question_text: 'Seberapa jelas materi yang disampaikan oleh guru pengajar selama pembelajaran semester ini?',
    image_url: '',
    options: {},
    scale_min: 1,
    scale_max: 5,
    scale_min_label: 'Sangat Kurang',
    scale_max_label: 'Sangat Jelas',
    required: true,
    points: 0,
    variant: 'A',
  },
  {
    id: 'q-surv-2',
    exam_id: 'survey-evaluasi-01',
    number: 2,
    type: 'MCQ',
    question_text: 'Metode pembelajaran apa yang paling Anda sukai?',
    image_url: '',
    options: {
      A: 'Diskusi interaktif dan tanya jawab',
      B: 'Studi kasus dan proyek kelompok',
      C: 'Praktikum / simulasi langsung',
      D: 'Penjelasan teori mendalam'
    },
    required: true,
    points: 0,
    variant: 'A',
  },
  {
    id: 'q-surv-3',
    exam_id: 'survey-evaluasi-01',
    number: 3,
    type: 'PARAGRAPH',
    question_text: 'Tuliskan masukan atau saran konstruktif Anda untuk pembelajaran ke depannya.',
    image_url: '',
    options: {},
    required: false,
    points: 0,
    variant: 'A',
  }
]

const INITIAL_SESSIONS = [
  {
    id: 'sess-01',
    student_id: '2aa446e5-9b87-4572-962f-806e2692c0d2',
    exam_id: 'exam-matematika-01',
    status: 'submitted',
    started_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    end_timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    answers: {
      '1': 'B',
      '2': 'A',
      '3': { stmt_1: 'true', stmt_2: 'false', stmt_3: 'true' },
      '4': 'Turunan f\'(x) = 0 mencari titik stasioner. Menggunakan uji turunan kedua f\'\'(x) untuk mengetahui apakah titik tersebut maksimum (< 0) atau minimum (> 0).'
    },
    violation_count: 0,
    current_question: 4,
    last_sync: new Date(Date.now() - 3600000 * 4).toISOString(),
  }
]

const INITIAL_RESULTS = [
  {
    id: 'res-01',
    student_id: '2aa446e5-9b87-4572-962f-806e2692c0d2',
    exam_id: 'exam-matematika-01',
    session_id: 'sess-01',
    auto_score: 75,
    max_auto_score: 75,
    essay_score: 25,
    violation_count: 0,
    breakdown: JSON.stringify([
      { number: 1, type: 'MCQ', studentAnswer: 'B', correctAnswer: 'B', points: 25, earned: 25, status: 'correct' },
      { number: 2, type: 'MCQ', studentAnswer: 'A', correctAnswer: 'A', points: 25, earned: 25, status: 'correct' },
      { number: 3, type: 'TRUE_FALSE', studentAnswer: { stmt_1: 'true', stmt_2: 'false', stmt_3: 'true' }, correctAnswer: { stmt_1: 'true', stmt_2: 'false', stmt_3: 'true' }, points: 25, earned: 25, status: 'correct' },
      { number: 4, type: 'ESSAY', studentAnswer: 'Turunan f\'(x) = 0 mencari titik stasioner...', correctAnswer: '', points: 25, earned: 25, status: 'graded' }
    ]),
    submitted_at: new Date(Date.now() - 3600000 * 4).toISOString(),
  }
]

const INITIAL_NOTIFICATIONS = [
  {
    id: 'notif-01',
    exam_id: 'survey-evaluasi-01',
    user_id: '2aa446e5-9b87-4572-962f-806e2692c0d2',
    is_read: false,
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
  }
]

// ─── Local Database Cache Management ──────────────────────────────────────────

function getDatabase() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.users && parsed.users.length >= 3) {
        return parsed
      }
    }
  } catch (err) {
    console.warn('[DB] Failed reading local storage db:', err)
  }

  const initial = {
    users: INITIAL_USERS,
    exams: INITIAL_EXAMS,
    questions: INITIAL_QUESTIONS,
    exam_sessions: INITIAL_SESSIONS,
    results: INITIAL_RESULTS,
    survey_notifications: INITIAL_NOTIFICATIONS,
  }
  saveDatabase(initial)
  return initial
}

function saveDatabase(db) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch (err) {
    console.error('[DB] Failed writing database to localStorage:', err)
  }
}

function generateId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`
}

// ─── USERS API ────────────────────────────────────────────────────────────────

export const users = {
  _mapProfile: (p) => {
    if (!p) return null
    let role = p.role || 'student'
    if (p.role_level) {
      if (p.role_level === 4) role = 'admin'
      else if (p.role_level === 3) role = 'teacher'
      else if (p.role_level === 2) role = 'officer'
      else role = 'student'
    } else {
      const uname = (p.username || '').toLowerCase()
      if (uname.startsWith('admin') || uname === 'super_admin' || p.role === 'admin') {
        role = 'admin'
      } else if (uname.startsWith('guru') || p.role === 'teacher') {
        role = 'teacher'
      } else if (uname.startsWith('officer.') || p.role === 'officer') {
        role = 'officer'
      } else if (uname.startsWith('partner.') || uname.startsWith('parent.') || p.role === 'parent') {
        role = 'parent'
      } else {
        role = 'student'
      }
    }

    return {
      id: p.id,
      email: p.contact_email || p.email || `${p.username}@exam.binar.internal`,
      username: p.username,
      full_name: p.display_name || p.fullname || p.full_name,
      name: p.display_name || p.fullname || p.full_name,
      display_name: p.display_name || p.fullname || p.full_name,
      kelas: p.class_section || p.kelas || '',
      class_section: p.class_section || p.kelas || '',
      role: role,
      role_level: p.role_level || (role === 'admin' ? 4 : (role === 'teacher' ? 3 : (role === 'officer' ? 2 : 1))),
      phone_number: p.contact_phone || p.phone || p.phone_number || '',
      classes: (p.class_section || p.kelas) ? { name: p.class_section || p.kelas } : null,
      password: p.password || 'password'
    }
  },

  list: async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order('fullname', { ascending: true })

        if (!error && Array.isArray(data)) {
          const mapped = data.map(users._mapProfile)
          // Update local cache
          const db = getDatabase()
          db.users = mapped
          saveDatabase(db)
          return { data: mapped, error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase users.list error, fallback to cache:', e)
      }
    }

    const db = getDatabase()
    const mapped = (db.users || []).map(users._mapProfile)
    mapped.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
    return { data: mapped, error: null }
  },

  listByRole: async (role) => {
    const { data } = await users.list()
    let filtered
    if (role === 'USER') {
      filtered = (data || []).filter(u => u.role === 'student' || u.role === 'parent' || u.role === 'officer')
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
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .maybeSingle()
        if (!error && data) {
          return { data: users._mapProfile(data), error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase users.getById fallback:', e)
      }
    }

    const db = getDatabase()
    const found = (db.users || []).find(u => u.id === id)
    if (!found) return { data: null, error: { message: 'User not found' } }
    return { data: users._mapProfile(found), error: null }
  },

  getByUsername: async (username) => {
    const clean = username.trim().toLowerCase()
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .or(`username.ilike.${clean},email.ilike.${clean}`)
          .maybeSingle()
        if (!error && data) {
          return users._mapProfile(data)
        }
      } catch (e) {
        console.warn('[DB] Supabase users.getByUsername fallback:', e)
      }
    }

    const db = getDatabase()
    const found = (db.users || []).find(u => 
      (u.username && u.username.toLowerCase() === clean) || 
      (u.contact_email && u.contact_email.toLowerCase() === clean) ||
      (u.email && u.email.toLowerCase() === clean)
    )
    return found ? users._mapProfile(found) : null
  },

  create: async (data) => {
    const rawName = (data.full_name || 'user').toLowerCase().trim().replace(/[^a-z0-9]/g, '.')
    let username = data.username || rawName
    if (data.role === 'parent' && !username.startsWith('partner.')) {
      username = `partner.${rawName}`
    } else if (data.role === 'officer' && !username.startsWith('officer.')) {
      username = `officer.${rawName}`
    }

    const roleLevel = data.role === 'admin' ? 4 : (data.role === 'teacher' ? 3 : (data.role === 'officer' ? 2 : 1))

    if (isSupabaseConfigured && supabase) {
      try {
        // Try calling register_seed_user stored procedure in Supabase
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

        if (!rpcErr && uid) {
          const { data: newProfile } = await supabase.from('profiles').select('*').eq('id', uid).single()
          return { data: users._mapProfile(newProfile), error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase users.create RPC fallback:', e)
      }
    }

    const db = getDatabase()
    const newUser = {
      id: generateId('usr'),
      username,
      password: data.password || 'password',
      display_name: data.full_name,
      full_name: data.full_name,
      contact_email: data.email || `${username}@exam.binar.internal`,
      email: data.email || `${username}@exam.binar.internal`,
      role: data.role || 'student',
      role_level: roleLevel,
      class_section: data.kelas || '',
      contact_phone: data.phone_number || '',
      created_at: new Date().toISOString(),
    }
    db.users.push(newUser)
    saveDatabase(db)
    return { data: users._mapProfile(newUser), error: null }
  },

  update: async (id, data) => {
    if (isSupabaseConfigured && supabase) {
      try {
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

        if (!error && updated) {
          return { data: users._mapProfile(updated), error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase users.update fallback:', e)
      }
    }

    const db = getDatabase()
    const idx = db.users.findIndex(u => u.id === id)
    if (idx === -1) return { data: null, error: { message: 'User not found' } }

    const existing = db.users[idx]
    db.users[idx] = {
      ...existing,
      display_name: data.full_name ?? existing.display_name,
      full_name: data.full_name ?? existing.full_name,
      contact_phone: data.phone_number ?? existing.contact_phone,
      class_section: data.kelas ?? existing.class_section,
      contact_email: data.email ?? existing.contact_email,
      role: data.role ?? existing.role
    }

    saveDatabase(db)
    return { data: users._mapProfile(db.users[idx]), error: null }
  },

  delete: async (id) => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('profiles').delete().eq('id', id)
      } catch (e) {
        console.warn('[DB] Supabase users.delete fallback:', e)
      }
    }

    const db = getDatabase()
    db.users = db.users.filter(u => u.id !== id)
    saveDatabase(db)
    return { data: null, error: null }
  },

  getDistinctKelas: async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data } = await supabase.from('classes').select('name').order('name')
        if (data && data.length > 0) {
          return { data: data.map(c => c.name), error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase getDistinctKelas fallback:', e)
      }
    }

    const db = getDatabase()
    const classes = (db.users || [])
      .map(u => u.class_section || u.kelas)
      .filter(Boolean)
    const unique = Array.from(new Set(classes)).sort()
    return { data: unique, error: null }
  }
}

// ─── EXAMS API ────────────────────────────────────────────────────────────────

export const exams = {
  _attachRelations: (exam, dbUsers = []) => {
    if (!exam) return null
    // If profiles was joined from Supabase
    if (exam.profiles) {
      const p = exam.profiles
      return {
        ...exam,
        profiles: { display_name: p.display_name || p.fullname },
        users: { name: p.display_name || p.fullname, username: p.username }
      }
    }
    const creator = dbUsers.find(u => u.id === exam.created_by)
    return {
      ...exam,
      users: creator ? { name: creator.display_name || creator.full_name, username: creator.username } : null,
      profiles: creator ? { display_name: creator.display_name || creator.full_name } : null
    }
  },

  list: async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('exams')
          .select('*, profiles:created_by(id, display_name, fullname, username)')
          .order('created_at', { ascending: false })

        if (!error && Array.isArray(data)) {
          const list = data.map(e => exams._attachRelations(e))
          return { data: list, error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase exams.list fallback:', e)
      }
    }

    const db = getDatabase()
    const list = (db.exams || []).map(e => exams._attachRelations(e, db.users))
    list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    return { data: list, error: null }
  },

  listByTeacher: async (teacherId) => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('exams')
          .select('*, profiles:created_by(id, display_name, fullname, username)')
          .eq('created_by', teacherId)
          .order('created_at', { ascending: false })

        if (!error && Array.isArray(data)) {
          const list = data.map(e => exams._attachRelations(e))
          return { data: list, error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase exams.listByTeacher fallback:', e)
      }
    }

    const db = getDatabase()
    const list = (db.exams || [])
      .filter(e => e.created_by === teacherId)
      .map(e => exams._attachRelations(e, db.users))
    list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    return { data: list, error: null }
  },

  getById: async (id) => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('exams')
          .select('*, profiles:created_by(id, display_name, fullname, username)')
          .eq('id', id)
          .maybeSingle()

        if (!error && data) {
          return { data: exams._attachRelations(data), error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase exams.getById fallback:', e)
      }
    }

    const db = getDatabase()
    const exam = (db.exams || []).find(e => e.id === id)
    if (!exam) return { data: null, error: { message: 'Exam not found' } }
    return { data: exams._attachRelations(exam, db.users), error: null }
  },

  create: async (data) => {
    const newExam = {
      id: data.id || generateId('exam'),
      created_at: new Date().toISOString(),
      status: 'draft',
      mode: 'exam',
      ...data,
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: created, error } = await supabase
          .from('exams')
          .insert([newExam])
          .select()
          .single()

        if (!error && created) {
          // Also save in local cache
          const db = getDatabase()
          db.exams.push(created)
          saveDatabase(db)
          return { data: exams._attachRelations(created), error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase exams.create fallback:', e)
      }
    }

    const db = getDatabase()
    db.exams.push(newExam)
    saveDatabase(db)
    return { data: exams._attachRelations(newExam, db.users), error: null }
  },

  update: async (id, data) => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: updated, error } = await supabase
          .from('exams')
          .update(data)
          .eq('id', id)
          .select()
          .single()

        if (!error && updated) {
          const db = getDatabase()
          const idx = db.exams.findIndex(e => e.id === id)
          if (idx !== -1) db.exams[idx] = { ...db.exams[idx], ...updated }
          saveDatabase(db)
          return { data: exams._attachRelations(updated), error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase exams.update fallback:', e)
      }
    }

    const db = getDatabase()
    const idx = db.exams.findIndex(e => e.id === id)
    if (idx === -1) return { data: null, error: { message: 'Exam not found' } }

    db.exams[idx] = { ...db.exams[idx], ...data }
    saveDatabase(db)
    return { data: exams._attachRelations(db.exams[idx], db.users), error: null }
  },

  delete: async (id) => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('exams').delete().eq('id', id)
      } catch (e) {
        console.warn('[DB] Supabase exams.delete fallback:', e)
      }
    }

    const db = getDatabase()
    db.exams = db.exams.filter(e => e.id !== id)
    db.questions = db.questions.filter(q => q.exam_id !== id)
    db.exam_sessions = db.exam_sessions.filter(s => s.exam_id !== id)
    db.results = db.results.filter(r => r.exam_id !== id)
    saveDatabase(db)
    return { data: null, error: null }
  },

  listPublished: async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('exams')
          .select('*, profiles:created_by(id, display_name, fullname, username)')
          .eq('status', 'published')
          .order('created_at', { ascending: false })

        if (!error && Array.isArray(data)) {
          const list = data.map(e => exams._attachRelations(e))
          return { data: list, error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase exams.listPublished fallback:', e)
      }
    }

    const db = getDatabase()
    const list = (db.exams || [])
      .filter(e => e.status === 'published')
      .map(e => exams._attachRelations(e, db.users))
    list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    return { data: list, error: null }
  }
}

// ─── QUESTIONS API ────────────────────────────────────────────────────────────

export const questions = {
  listByExam: async (examId) => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('questions')
          .select('*')
          .eq('exam_id', examId)
          .order('number', { ascending: true })

        if (!error && Array.isArray(data)) {
          return { data, error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase questions.listByExam fallback:', e)
      }
    }

    const db = getDatabase()
    const list = (db.questions || [])
      .filter(q => q.exam_id === examId)
      .sort((a, b) => (a.number || 0) - (b.number || 0))
    return { data: list, error: null }
  },

  listByExamAndVariant: async (examId, variant) => {
    if (isSupabaseConfigured && supabase) {
      try {
        let q = supabase
          .from('questions')
          .select('*')
          .eq('exam_id', examId)
          .order('number', { ascending: true })

        if (variant) q = q.eq('variant', variant)
        const { data, error } = await q
        if (!error && Array.isArray(data)) {
          return { data, error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase questions.listByExamAndVariant fallback:', e)
      }
    }

    const db = getDatabase()
    const list = (db.questions || [])
      .filter(q => q.exam_id === examId && (!variant || q.variant === variant))
      .sort((a, b) => (a.number || 0) - (b.number || 0))
    return { data: list, error: null }
  },

  create: async (data) => {
    const newQ = {
      id: data.id || generateId('q'),
      ...data
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: created, error } = await supabase
          .from('questions')
          .insert([newQ])
          .select()
          .single()

        if (!error && created) return { data: created, error: null }
      } catch (e) {
        console.warn('[DB] Supabase questions.create fallback:', e)
      }
    }

    const db = getDatabase()
    db.questions.push(newQ)
    saveDatabase(db)
    return { data: newQ, error: null }
  },

  createMany: async (dataArr) => {
    const created = dataArr.map(d => ({
      id: d.id || generateId('q'),
      ...d
    }))

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: inserted, error } = await supabase
          .from('questions')
          .insert(created)
          .select()

        if (!error && inserted) {
          const db = getDatabase()
          db.questions.push(...inserted)
          saveDatabase(db)
          return { data: inserted, error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase questions.createMany fallback:', e)
      }
    }

    const db = getDatabase()
    db.questions.push(...created)
    saveDatabase(db)
    return { data: created, error: null }
  },

  update: async (id, data) => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: updated, error } = await supabase
          .from('questions')
          .update(data)
          .eq('id', id)
          .select()
          .single()

        if (!error && updated) return { data: updated, error: null }
      } catch (e) {
        console.warn('[DB] Supabase questions.update fallback:', e)
      }
    }

    const db = getDatabase()
    const idx = db.questions.findIndex(q => q.id === id)
    if (idx === -1) return { data: null, error: { message: 'Question not found' } }

    db.questions[idx] = { ...db.questions[idx], ...data }
    saveDatabase(db)
    return { data: db.questions[idx], error: null }
  },

  delete: async (id) => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('questions').delete().eq('id', id)
      } catch (e) {
        console.warn('[DB] Supabase questions.delete fallback:', e)
      }
    }

    const db = getDatabase()
    db.questions = db.questions.filter(q => q.id !== id)
    saveDatabase(db)
    return { data: null, error: null }
  },

  deleteByExam: async (examId) => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('questions').delete().eq('exam_id', examId)
      } catch (e) {
        console.warn('[DB] Supabase questions.deleteByExam fallback:', e)
      }
    }

    const db = getDatabase()
    db.questions = db.questions.filter(q => q.exam_id !== examId)
    saveDatabase(db)
    return { data: null, error: null }
  }
}

// ─── SESSIONS API ─────────────────────────────────────────────────────────────

export const sessions = {
  getOrCreate: async (examId, studentId, variant = 'A') => {
    if (isSupabaseConfigured && supabase) {
      try {
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

        if (!error && created) return { data: created, error: null }
      } catch (e) {
        console.warn('[DB] Supabase sessions.getOrCreate fallback:', e)
      }
    }

    const db = getDatabase()
    const found = (db.exam_sessions || []).find(s => s.exam_id === examId && s.student_id === studentId)
    if (found) return { data: found, error: null }

    const newSession = {
      id: generateId('sess'),
      student_id: studentId,
      exam_id: examId,
      variant: variant || 'A',
      status: 'active',
      started_at: new Date().toISOString(),
      answers: {},
      violation_count: 0,
      current_question: 1,
      last_sync: new Date().toISOString(),
    }
    db.exam_sessions.push(newSession)
    saveDatabase(db)
    return { data: newSession, error: null }
  },

  update: async (sessionId, data) => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: updated, error } = await supabase
          .from('exam_sessions')
          .update({ ...data, last_sync: new Date().toISOString() })
          .eq('id', sessionId)
          .select()
          .single()

        if (!error && updated) return { data: updated, error: null }
      } catch (e) {
        console.warn('[DB] Supabase sessions.update fallback:', e)
      }
    }

    const db = getDatabase()
    const idx = db.exam_sessions.findIndex(s => s.id === sessionId)
    if (idx === -1) return { data: null, error: { message: 'Session not found' } }

    db.exam_sessions[idx] = {
      ...db.exam_sessions[idx],
      ...data,
      last_sync: new Date().toISOString()
    }
    saveDatabase(db)
    return { data: db.exam_sessions[idx], error: null }
  },

  getById: async (id) => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('exam_sessions')
          .select('*')
          .eq('id', id)
          .maybeSingle()
        if (!error && data) return { data, error: null }
      } catch (e) {
        console.warn('[DB] Supabase sessions.getById fallback:', e)
      }
    }

    const db = getDatabase()
    const found = (db.exam_sessions || []).find(s => s.id === id)
    return { data: found || null, error: found ? null : { message: 'Session not found' } }
  },

  listByExam: async (examId) => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('exam_sessions')
          .select('*')
          .eq('exam_id', examId)
        if (!error && Array.isArray(data)) return { data, error: null }
      } catch (e) {
        console.warn('[DB] Supabase sessions.listByExam fallback:', e)
      }
    }

    const db = getDatabase()
    const list = (db.exam_sessions || []).filter(s => s.exam_id === examId)
    return { data: list, error: null }
  },

  reset: async (sessionId) => {
    return sessions.update(sessionId, {
      status: 'active',
      violation_count: 0,
      answers: {},
      current_question: 1,
      started_at: new Date().toISOString()
    })
  }
}

// ─── RESULTS API ──────────────────────────────────────────────────────────────

export const results = {
  _attachRelations: (result, db) => {
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
    const student = (db?.users || []).find(u => u.id === result.student_id)
    return {
      ...result,
      student: student ? {
        display_name: student.display_name || student.full_name,
        full_name: student.display_name || student.full_name,
        kelas: student.class_section || student.kelas,
        class_section: student.class_section || student.kelas,
        username: student.username,
      } : null
    }
  },

  create: async (data) => {
    const newResult = {
      id: data.id || generateId('res'),
      submitted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      ...data,
      breakdown: typeof data.breakdown === 'string' ? data.breakdown : JSON.stringify(data.breakdown || [])
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: created, error } = await supabase
          .from('results')
          .insert([newResult])
          .select()
          .single()

        if (!error && created) {
          const db = getDatabase()
          db.results.push(created)
          saveDatabase(db)
          return { data: created, error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase results.create fallback:', e)
      }
    }

    const db = getDatabase()
    db.results.push(newResult)
    saveDatabase(db)
    return { data: newResult, error: null }
  },

  getByExamAndStudent: async (examId, studentId) => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('results')
          .select('*')
          .eq('exam_id', examId)
          .eq('student_id', studentId)
          .maybeSingle()

        if (!error && data) return { data, error: null }
      } catch (e) {
        console.warn('[DB] Supabase results.getByExamAndStudent fallback:', e)
      }
    }

    const db = getDatabase()
    const found = (db.results || []).find(r => r.exam_id === examId && r.student_id === studentId)
    return { data: found || null, error: null }
  },

  listByExam: async (examId) => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('results')
          .select('*, profiles:student_id(id, display_name, fullname, username, class_section)')
          .eq('exam_id', examId)
          .order('created_at', { ascending: false })

        if (!error && Array.isArray(data)) {
          const list = data.map(r => results._attachRelations(r))
          return { data: list, error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase results.listByExam fallback:', e)
      }
    }

    const db = getDatabase()
    const list = (db.results || [])
      .filter(r => r.exam_id === examId)
      .map(r => results._attachRelations(r, db))
    return { data: list, error: null }
  },

  getById: async (id) => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('results')
          .select('*, profiles:student_id(id, display_name, fullname, username, class_section)')
          .eq('id', id)
          .maybeSingle()
        if (!error && data) return { data: results._attachRelations(data), error: null }
      } catch (e) {
        console.warn('[DB] Supabase results.getById fallback:', e)
      }
    }

    const db = getDatabase()
    const found = (db.results || []).find(r => r.id === id)
    if (!found) return { data: null, error: { message: 'Result not found' } }
    return { data: results._attachRelations(found, db), error: null }
  },

  updateEssayScore: async (id, essayScore) => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: updated, error } = await supabase
          .from('results')
          .update({ essay_score: Number(essayScore) })
          .eq('id', id)
          .select()
          .single()

        if (!error && updated) return { data: updated, error: null }
      } catch (e) {
        console.warn('[DB] Supabase results.updateEssayScore fallback:', e)
      }
    }

    const db = getDatabase()
    const idx = db.results.findIndex(r => r.id === id)
    if (idx === -1) return { data: null, error: { message: 'Result not found' } }

    db.results[idx].essay_score = Number(essayScore)
    saveDatabase(db)
    return { data: db.results[idx], error: null }
  }
}

// ─── NOTIFICATIONS API ────────────────────────────────────────────────────────

export const notifications = {
  listByUser: async (userId) => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('survey_notifications')
          .select('*, exams:exam_id(*)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        if (!error && Array.isArray(data)) {
          return { data, error: null }
        }
      } catch (e) {
        console.warn('[DB] Supabase notifications.listByUser fallback:', e)
      }
    }

    const db = getDatabase()
    const list = (db.survey_notifications || [])
      .filter(n => n.user_id === userId)
      .map(n => {
        const exam = (db.exams || []).find(e => e.id === n.exam_id)
        return { ...n, exams: exam || null }
      })
    return { data: list, error: null }
  },

  markAsRead: async (id) => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('survey_notifications')
          .update({ is_read: true })
          .eq('id', id)
      } catch (e) {
        console.warn('[DB] Supabase notifications.markAsRead fallback:', e)
      }
    }

    const db = getDatabase()
    const idx = db.survey_notifications.findIndex(n => n.id === id)
    if (idx !== -1) {
      db.survey_notifications[idx].is_read = true
      saveDatabase(db)
    }
    return { error: null }
  },

  create: async (data) => {
    const newNotif = {
      id: generateId('notif'),
      created_at: new Date().toISOString(),
      is_read: false,
      ...data
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: created, error } = await supabase
          .from('survey_notifications')
          .insert([newNotif])
          .select()
          .single()

        if (!error && created) return { data: created, error: null }
      } catch (e) {
        console.warn('[DB] Supabase notifications.create fallback:', e)
      }
    }

    const db = getDatabase()
    db.survey_notifications.push(newNotif)
    saveDatabase(db)
    return { data: newNotif, error: null }
  }
}

// ─── SURVEYS API ──────────────────────────────────────────────────────────────

export const surveys = {
  listActive: async (userClass = '') => {
    const { data: allPublished } = await exams.listPublished()
    const surveys = (allPublished || []).filter(e => e.mode === 'survey')
    if (!userClass) return { data: surveys, error: null }

    const filtered = surveys.filter(s => {
      if (!s.target_kelas || s.target_kelas === 'all') return true
      const targetList = s.target_kelas.split(',').map(c => c.trim())
      return targetList.includes(userClass)
    })
    return { data: filtered, error: null }
  }
}

// ─── LOCAL DB STATS (Aggregated / Cached) ─────────────────────────────────────

export const localDb = {
  resetToInitial: () => {
    localStorage.removeItem(STORAGE_KEY)
    return getDatabase()
  },

  getRawData: () => getDatabase(),

  getTeacherStats: async (teacherId) => {
    const { data: teacherExamsList } = await exams.listByTeacher(teacherId)
    const teacherExams = teacherExamsList || []
    const teacherExamIds = new Set(teacherExams.map(e => e.id))

    const activeExams = teacherExams.filter(e => e.status === 'published').length
    const draftExams = teacherExams.filter(e => e.status === 'draft').length
    const closedExams = teacherExams.filter(e => e.status === 'closed').length

    let relevantSessions = []
    let relevantResults = []
    
    if (isSupabaseConfigured && supabase && teacherExams.length > 0) {
      try {
        const examIdsArray = Array.from(teacherExamIds)
        const [sessRes, resultsRes] = await Promise.all([
          supabase.from('exam_sessions').select('*').in('exam_id', examIdsArray),
          supabase.from('results').select('*, profiles:student_id(id, display_name, fullname, username, class_section)').in('exam_id', examIdsArray)
        ])
        if (sessRes.data) relevantSessions = sessRes.data
        if (resultsRes.data) relevantResults = resultsRes.data.map(r => results._attachRelations(r))
      } catch (e) {
        console.warn('[DB] Supabase getTeacherStats query fallback:', e)
      }
    }

    if (relevantSessions.length === 0 && relevantResults.length === 0) {
      const db = getDatabase()
      relevantSessions = (db.exam_sessions || []).filter(s => teacherExamIds.has(s.exam_id))
      relevantResults = (db.results || [])
        .filter(r => teacherExamIds.has(r.exam_id))
        .map(r => results._attachRelations(r, db))
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
      try {
        const [sessRes, resultsRes] = await Promise.all([
          supabase.from('exam_sessions').select('id', { count: 'exact', head: true }),
          supabase.from('results').select('*, profiles:student_id(id, display_name, fullname, username, class_section)').order('created_at', { ascending: false }).limit(10)
        ])
        totalSessions = sessRes.count ?? 0
        if (resultsRes.data) recentResults = resultsRes.data.map(r => results._attachRelations(r))
      } catch (e) {
        console.warn('[DB] Supabase getAdminStats query fallback:', e)
      }
    }

    if (totalSessions === 0 && recentResults.length === 0) {
      const db = getDatabase()
      totalSessions = (db.exam_sessions || []).length
      recentResults = (db.results || []).map(r => results._attachRelations(r, db))
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
      try {
        const [sessRes, resultsRes] = await Promise.all([
          supabase.from('exam_sessions').select('id', { count: 'exact', head: true }),
          supabase.from('results').select('*, profiles:student_id(id, display_name, fullname, username, class_section)').order('created_at', { ascending: false }).limit(20)
        ])
        totalSessions = sessRes.count ?? 0
        if (resultsRes.data) recentResults = resultsRes.data.map(r => results._attachRelations(r))
      } catch (e) {
        console.warn('[DB] Supabase getAnalyticsStats fallback:', e)
      }
    }

    if (totalSessions === 0 && recentResults.length === 0) {
      const db = getDatabase()
      totalSessions = (db.exam_sessions || []).length
      recentResults = (db.results || []).map(r => results._attachRelations(r, db))
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
