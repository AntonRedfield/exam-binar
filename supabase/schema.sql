-- ============================================================
-- SNT 10 KUPANG & BINAR EXAM (BOLOS) - SUPABASE POSTGRESQL SCHEMA
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. classes
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  grade_level SMALLINT,
  academic_year VARCHAR(20) NOT NULL DEFAULT '2025/2026',
  homeroom_teacher_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. academic_periods
CREATE TABLE IF NOT EXISTS public.academic_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(50) UNIQUE,
  fullname VARCHAR(150) NOT NULL,
  display_name VARCHAR(150),
  birth_date DATE,
  email VARCHAR(255) NOT NULL UNIQUE,
  role_level SMALLINT NOT NULL DEFAULT 1,
  phone VARCHAR(20),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),
  avatar_url TEXT,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  class_section VARCHAR(50),
  active_session_id TEXT,
  last_login_at TIMESTAMPTZ,
  last_login_device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. features
CREATE TABLE IF NOT EXISTS public.features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key VARCHAR(60) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  module VARCHAR(30) NOT NULL DEFAULT 'general',
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. feature_access
CREATE TABLE IF NOT EXISTS public.feature_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key VARCHAR(60) NOT NULL REFERENCES public.features(feature_key) ON DELETE CASCADE,
  role_level SMALLINT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_granted BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. exams
CREATE TABLE IF NOT EXISTS public.exams (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  subject VARCHAR(100),
  information TEXT,
  pdf_url TEXT,
  duration_minutes SMALLINT NOT NULL DEFAULT 60,
  passing_grade DECIMAL(5,2) NOT NULL DEFAULT 60.00,
  target_kelas VARCHAR(255) DEFAULT 'all',
  created_by TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  mode VARCHAR(20) NOT NULL DEFAULT 'exam',
  quiz_timer_type VARCHAR(20) DEFAULT 'uniform',
  monitoring_level SMALLINT NOT NULL DEFAULT 1,
  question_order VARCHAR(10) DEFAULT 'ORDER',
  uniform_time SMALLINT DEFAULT 30,
  survey_type VARCHAR(20),
  survey_recurrence VARCHAR(20),
  survey_notify_time VARCHAR(10),
  survey_valid_from TIMESTAMPTZ,
  survey_valid_until TIMESTAMPTZ,
  survey_allow_edit BOOLEAN NOT NULL DEFAULT false,
  default_options_count SMALLINT DEFAULT 4,
  default_statements_count SMALLINT DEFAULT 3,
  default_matching_count SMALLINT DEFAULT 3,
  default_sequencing_count SMALLINT DEFAULT 4,
  default_agree_disagree_count SMALLINT DEFAULT 3,
  default_survey_options_count SMALLINT DEFAULT 4,
  default_grid_rows_count SMALLINT DEFAULT 3,
  default_grid_cols_count SMALLINT DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. questions
CREATE TABLE IF NOT EXISTS public.questions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  exam_id TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  number SMALLINT NOT NULL,
  type VARCHAR(30) NOT NULL,
  question_text TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  options JSONB DEFAULT '{}'::jsonb,
  option_images JSONB DEFAULT '{}'::jsonb,
  correct_answer JSONB,
  points DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  variant VARCHAR(5) NOT NULL DEFAULT 'A',
  time_limit SMALLINT,
  scale_min SMALLINT DEFAULT 1,
  scale_max SMALLINT DEFAULT 5,
  scale_min_label VARCHAR(100),
  scale_max_label VARCHAR(100),
  grid_rows JSONB,
  grid_columns JSONB,
  allow_other BOOLEAN NOT NULL DEFAULT false,
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. exam_sessions
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id TEXT NOT NULL,
  exam_id TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  variant VARCHAR(5) NOT NULL DEFAULT 'A',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  violation_count SMALLINT NOT NULL DEFAULT 0,
  current_question SMALLINT NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_timestamp TIMESTAMPTZ,
  last_sync TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. results
CREATE TABLE IF NOT EXISTS public.results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id TEXT NOT NULL,
  exam_id TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES public.exam_sessions(id) ON DELETE SET NULL,
  auto_score DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  max_auto_score DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  essay_score DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  violation_count SMALLINT NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. survey_notifications
CREATE TABLE IF NOT EXISTS public.survey_notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  exam_id TEXT NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. lms_courses
CREATE TABLE IF NOT EXISTS public.lms_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_id UUID REFERENCES public.academic_periods(id) ON DELETE SET NULL,
  course_code VARCHAR(20) NOT NULL UNIQUE,
  course_name VARCHAR(150) NOT NULL,
  description TEXT,
  class_group VARCHAR(30),
  credit_hours SMALLINT NOT NULL DEFAULT 2,
  status VARCHAR(15) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. lms_enrollments
CREATE TABLE IF NOT EXISTS public.lms_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.lms_courses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status VARCHAR(15) NOT NULL DEFAULT 'active'
);

-- 13. academic_marks
CREATE TABLE IF NOT EXISTS public.academic_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.lms_courses(id) ON DELETE CASCADE,
  mark_type VARCHAR(20) NOT NULL,
  title VARCHAR(200) NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  max_score DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  weight DECIMAL(3,2) NOT NULL DEFAULT 1.00,
  graded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  graded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. report_cards
CREATE TABLE IF NOT EXISTS public.report_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.lms_courses(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.academic_periods(id) ON DELETE CASCADE,
  final_grade DECIMAL(5,2) NOT NULL,
  letter_grade CHAR(2),
  gpa_points DECIMAL(3,2),
  teacher_notes TEXT,
  status VARCHAR(15) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. attendance
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  status VARCHAR(15) NOT NULL DEFAULT 'present',
  check_in_method VARCHAR(20) NOT NULL DEFAULT 'manual',
  geo_lat DECIMAL(10,7),
  geo_lng DECIMAL(10,7),
  face_confidence DECIMAL(5,4),
  device_info JSONB DEFAULT '{}'::jsonb,
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. violation_logs
CREATE TABLE IF NOT EXISTS public.violation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  violation_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  severity SMALLINT NOT NULL,
  incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
  resolution TEXT,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Registration Function
CREATE OR REPLACE FUNCTION public.register_seed_user(
  p_username TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_display_name TEXT,
  p_email TEXT,
  p_role TEXT,
  p_role_level SMALLINT,
  p_class_section TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_enc_pass TEXT;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email OR raw_user_meta_data->>'username' = p_username;
  
  v_enc_pass := extensions.crypt(p_password, extensions.gen_salt('bf'));

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change_token_current,
      reauthentication_token,
      phone_change_token,
      phone_change,
      email_change,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      p_email,
      v_enc_pass,
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'username', p_username,
        'full_name', p_full_name,
        'display_name', p_display_name,
        'role', p_role,
        'level', p_role_level,
        'kelas', COALESCE(p_class_section, ''),
        'class_id', COALESCE(p_class_section, '')
      ),
      now(),
      now()
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', p_email),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    );
  ELSE
    UPDATE auth.users 
    SET encrypted_password = v_enc_pass,
        raw_user_meta_data = jsonb_build_object(
          'username', p_username,
          'full_name', p_full_name,
          'display_name', p_display_name,
          'role', p_role,
          'level', p_role_level,
          'kelas', COALESCE(p_class_section, ''),
          'class_id', COALESCE(p_class_section, '')
        ),
        confirmation_token = '',
        recovery_token = '',
        email_change_token_new = '',
        email_change_token_current = '',
        reauthentication_token = '',
        phone_change_token = '',
        phone_change = '',
        email_change = ''
    WHERE id = v_user_id;
  END IF;

  INSERT INTO public.profiles (
    id,
    username,
    fullname,
    display_name,
    email,
    role_level,
    contact_email,
    contact_phone,
    phone,
    class_section,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    p_username,
    p_full_name,
    p_display_name,
    p_email,
    p_role_level,
    p_email,
    p_phone,
    p_phone,
    p_class_section,
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    fullname = EXCLUDED.fullname,
    display_name = EXCLUDED.display_name,
    role_level = EXCLUDED.role_level,
    class_section = EXCLUDED.class_section;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
