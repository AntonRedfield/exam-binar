-- ============================================================
-- BINAR EXAM SYSTEM — Supabase SQL Migration
-- Run this in full in the Supabase SQL Editor (supabase.com)
-- ============================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  password TEXT,
  name TEXT NOT NULL,
  kelas TEXT,
  role TEXT NOT NULL CHECK (role IN ('SUPERADMIN','TEACHER','USER'))
);

-- 2. EXAMS TABLE
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  target_kelas TEXT DEFAULT 'all',
  created_by TEXT REFERENCES users(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  passing_grade INT DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. QUESTIONS TABLE
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  number INT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('MCQ','COMPLEX_MCQ','TRUE_FALSE','ESSAY')),
  options JSONB,
  correct_answer JSONB,
  points INT DEFAULT 1,
  variant TEXT DEFAULT 'A'
);

-- 4. EXAM SESSIONS TABLE
CREATE TABLE IF NOT EXISTS exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT REFERENCES users(id),
  exam_id UUID REFERENCES exams(id),
  variant TEXT DEFAULT 'A',
  end_timestamp TIMESTAMPTZ,
  answers JSONB DEFAULT '{}',
  violation_count INT DEFAULT 0,
  current_question INT DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','submitted','time_up','reset')),
  started_at TIMESTAMPTZ DEFAULT now(),
  last_sync TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, exam_id)
);

-- 5. RESULTS TABLE
CREATE TABLE IF NOT EXISTS results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id TEXT REFERENCES users(id),
  exam_id UUID REFERENCES exams(id),
  session_id UUID REFERENCES exam_sessions(id),
  auto_score NUMERIC DEFAULT 0,
  max_auto_score NUMERIC DEFAULT 0,
  essay_score NUMERIC DEFAULT 0,
  violation_count INT DEFAULT 0,
  breakdown TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- 6. DISABLE RLS (or enable with permissive policies for anon key usage)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE exams DISABLE ROW LEVEL SECURITY;
ALTER TABLE questions DISABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE results DISABLE ROW LEVEL SECURITY;
