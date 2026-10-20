-- ============================================================
-- Migration: Complete RLS Policies for All Tables
-- Timestamp: 2026-10-20
-- Project: SNT 10 Kupang — BOLOS Exam System
-- 
-- Design principles:
--   • The app uses the anon/authenticated Supabase JS client.
--   • "Admin" = role_level 4, "Teacher/Secretary" = 3,
--     "Officer" = 2, "Student/Parent" = 1.
--   • We use a helper function get_my_role_level() that reads
--     the current JWT's app_metadata.level claim (set by
--     register_seed_user / GoTrue) so policies stay simple.
--   • SECURITY DEFINER RPCs (register_seed_user,
--     prepare_student_login, start_audio_playback,
--     cascade_delete_student_records) bypass RLS entirely
--     because they run as the DB owner — no changes needed there.
--   • login_logs already has policies from schema.sql; we keep them.
-- ============================================================

-- ─── Helper: read role_level from JWT + profiles table ──────────────────────
-- NOTE: register_seed_user stores `level` in raw_user_meta_data (user_metadata).
-- GoTrue also mirrors it into app_metadata after first login for some setups.
-- We check both JWT paths, then fall back to the profiles table for reliability.
CREATE OR REPLACE FUNCTION public.get_my_role_level()
RETURNS SMALLINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_level SMALLINT;
BEGIN
  -- 1. Try app_metadata.level (set by GoTrue/service role)
  v_level := (auth.jwt() -> 'app_metadata' ->> 'level')::smallint;
  IF v_level IS NOT NULL THEN RETURN v_level; END IF;

  -- 2. Try user_metadata.level (set by register_seed_user RPC)
  v_level := (auth.jwt() -> 'user_metadata' ->> 'level')::smallint;
  IF v_level IS NOT NULL THEN RETURN v_level; END IF;

  -- 3. Fall back to profiles table (most reliable source of truth)
  SELECT role_level INTO v_level
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  RETURN COALESCE(v_level, 1);
EXCEPTION WHEN OTHERS THEN
  RETURN 1;
END;
$$;

-- ─── Helper: is current user an admin (level 4)? ────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.get_my_role_level() >= 4;
$$;

-- ─── Helper: is current user a teacher or above (level >= 3)? ───────────────
CREATE OR REPLACE FUNCTION public.is_teacher_or_above()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.get_my_role_level() >= 3;
$$;


-- ==============================================================================
-- TABLE: profiles
-- Rules:
--   SELECT: authenticated users can read all profiles (needed for name lookups,
--           class lists, exam oversight, etc.)
--   INSERT: only via SECURITY DEFINER RPC (register_seed_user) — no direct insert
--   UPDATE: own profile (any authenticated), or admin can update anyone
--   DELETE: admin only (cascade_delete_student_records trigger handles children)
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: authenticated read all"      ON public.profiles;
DROP POLICY IF EXISTS "profiles: own update"                  ON public.profiles;
DROP POLICY IF EXISTS "profiles: admin update any"            ON public.profiles;
DROP POLICY IF EXISTS "profiles: admin delete"                ON public.profiles;
DROP POLICY IF EXISTS "profiles: service role full"           ON public.profiles;

-- Service role bypass (used by Edge Functions & admin RPC calls)
CREATE POLICY "profiles: service role full"
  ON public.profiles FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- All authenticated users can read any profile (teacher needs student names, etc.)
CREATE POLICY "profiles: authenticated read all"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can update their own profile
CREATE POLICY "profiles: own update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can update any profile
CREATE POLICY "profiles: admin update any"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admins can delete any profile
CREATE POLICY "profiles: admin delete"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- Admins can insert profiles directly (fallback, primary path is RPC)
DROP POLICY IF EXISTS "profiles: admin insert" ON public.profiles;
CREATE POLICY "profiles: admin insert"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());


-- ==============================================================================
-- TABLE: classes
-- Rules:
--   SELECT: all authenticated users (students need class list for dropdowns)
--   INSERT/UPDATE/DELETE: admin only
-- ==============================================================================
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "classes: authenticated read"     ON public.classes;
DROP POLICY IF EXISTS "classes: admin write"            ON public.classes;
DROP POLICY IF EXISTS "classes: service role full"      ON public.classes;

CREATE POLICY "classes: service role full"
  ON public.classes FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "classes: authenticated read"
  ON public.classes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "classes: admin write"
  ON public.classes FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ==============================================================================
-- TABLE: academic_periods
-- Rules:
--   SELECT: all authenticated users
--   INSERT/UPDATE/DELETE: admin only
-- ==============================================================================
ALTER TABLE public.academic_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "academic_periods: authenticated read"  ON public.academic_periods;
DROP POLICY IF EXISTS "academic_periods: admin write"         ON public.academic_periods;
DROP POLICY IF EXISTS "academic_periods: service role full"   ON public.academic_periods;

CREATE POLICY "academic_periods: service role full"
  ON public.academic_periods FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "academic_periods: authenticated read"
  ON public.academic_periods FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "academic_periods: admin write"
  ON public.academic_periods FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ==============================================================================
-- TABLE: features
-- Rules:
--   SELECT: all authenticated users (feature flags need to be read by everyone)
--   INSERT/UPDATE/DELETE: admin only
-- ==============================================================================
ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "features: authenticated read"   ON public.features;
DROP POLICY IF EXISTS "features: admin write"          ON public.features;
DROP POLICY IF EXISTS "features: service role full"    ON public.features;

CREATE POLICY "features: service role full"
  ON public.features FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "features: authenticated read"
  ON public.features FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "features: admin write"
  ON public.features FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ==============================================================================
-- TABLE: feature_access
-- Rules:
--   SELECT: all authenticated (app checks own feature access)
--   INSERT/UPDATE/DELETE: admin only
-- ==============================================================================
ALTER TABLE public.feature_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_access: authenticated read"  ON public.feature_access;
DROP POLICY IF EXISTS "feature_access: admin write"         ON public.feature_access;
DROP POLICY IF EXISTS "feature_access: service role full"   ON public.feature_access;

CREATE POLICY "feature_access: service role full"
  ON public.feature_access FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "feature_access: authenticated read"
  ON public.feature_access FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "feature_access: admin write"
  ON public.feature_access FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ==============================================================================
-- TABLE: exams
-- Rules:
--   SELECT: 
--     • Published exams visible to all authenticated users (students take them)
--     • Draft/closed: only creator (teacher) or admin
--   INSERT: teacher or above
--   UPDATE: creator (teacher) or admin
--   DELETE: creator (teacher) or admin
-- ==============================================================================
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exams: read published"           ON public.exams;
DROP POLICY IF EXISTS "exams: teacher read own"         ON public.exams;
DROP POLICY IF EXISTS "exams: admin read all"           ON public.exams;
DROP POLICY IF EXISTS "exams: teacher insert"           ON public.exams;
DROP POLICY IF EXISTS "exams: teacher update own"       ON public.exams;
DROP POLICY IF EXISTS "exams: admin update any"         ON public.exams;
DROP POLICY IF EXISTS "exams: teacher delete own"       ON public.exams;
DROP POLICY IF EXISTS "exams: admin delete any"         ON public.exams;
DROP POLICY IF EXISTS "exams: service role full"        ON public.exams;

CREATE POLICY "exams: service role full"
  ON public.exams FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Published exams visible to all authenticated (students)
CREATE POLICY "exams: read published"
  ON public.exams FOR SELECT
  TO authenticated
  USING (status = 'published');

-- Teachers can read their own exams (any status)
CREATE POLICY "exams: teacher read own"
  ON public.exams FOR SELECT
  TO authenticated
  USING (
    public.is_teacher_or_above()
    AND created_by = auth.uid()::text
  );

-- Admins can read all exams
CREATE POLICY "exams: admin read all"
  ON public.exams FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Teachers/admins can insert exams
CREATE POLICY "exams: teacher insert"
  ON public.exams FOR INSERT
  TO authenticated
  WITH CHECK (public.is_teacher_or_above());

-- Teachers can update/delete their own exams; admins can update/delete any
CREATE POLICY "exams: teacher update own"
  ON public.exams FOR UPDATE
  TO authenticated
  USING (
    public.is_teacher_or_above()
    AND created_by = auth.uid()::text
  )
  WITH CHECK (
    public.is_teacher_or_above()
    AND created_by = auth.uid()::text
  );

CREATE POLICY "exams: admin update any"
  ON public.exams FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "exams: teacher delete own"
  ON public.exams FOR DELETE
  TO authenticated
  USING (
    public.is_teacher_or_above()
    AND created_by = auth.uid()::text
  );

CREATE POLICY "exams: admin delete any"
  ON public.exams FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ==============================================================================
-- TABLE: questions
-- Rules:
--   SELECT: all authenticated (students load questions during exam)
--   INSERT/UPDATE/DELETE: teacher who owns the parent exam, or admin
-- ==============================================================================
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "questions: authenticated read"    ON public.questions;
DROP POLICY IF EXISTS "questions: teacher write"         ON public.questions;
DROP POLICY IF EXISTS "questions: admin write"           ON public.questions;
DROP POLICY IF EXISTS "questions: service role full"     ON public.questions;

CREATE POLICY "questions: service role full"
  ON public.questions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- All authenticated users can read questions (students need them during exam)
CREATE POLICY "questions: authenticated read"
  ON public.questions FOR SELECT
  TO authenticated
  USING (true);

-- Teachers can write questions for exams they own
CREATE POLICY "questions: teacher write"
  ON public.questions FOR ALL
  TO authenticated
  USING (
    public.is_teacher_or_above()
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_id
        AND (e.created_by = auth.uid()::text OR public.is_admin())
    )
  )
  WITH CHECK (
    public.is_teacher_or_above()
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_id
        AND (e.created_by = auth.uid()::text OR public.is_admin())
    )
  );

-- Admins can write any question
CREATE POLICY "questions: admin write"
  ON public.questions FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ==============================================================================
-- TABLE: exam_sessions
-- Rules:
--   SELECT: own session (student), or teacher/admin for monitoring
--   INSERT: authenticated students can create their own session
--   UPDATE: own session (student syncing answers), or teacher/admin
--   DELETE: admin only (teachers can reset via sessions.reset which calls update)
-- ==============================================================================
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exam_sessions: own read"              ON public.exam_sessions;
DROP POLICY IF EXISTS "exam_sessions: teacher read all"      ON public.exam_sessions;
DROP POLICY IF EXISTS "exam_sessions: own insert"            ON public.exam_sessions;
DROP POLICY IF EXISTS "exam_sessions: own update"            ON public.exam_sessions;
DROP POLICY IF EXISTS "exam_sessions: teacher update"        ON public.exam_sessions;
DROP POLICY IF EXISTS "exam_sessions: admin all"             ON public.exam_sessions;
DROP POLICY IF EXISTS "exam_sessions: service role full"     ON public.exam_sessions;

CREATE POLICY "exam_sessions: service role full"
  ON public.exam_sessions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Students can read their own sessions
CREATE POLICY "exam_sessions: own read"
  ON public.exam_sessions FOR SELECT
  TO authenticated
  USING (student_id = auth.uid()::text);

-- Teachers & admins can read all sessions (for proctoring/oversight)
CREATE POLICY "exam_sessions: teacher read all"
  ON public.exam_sessions FOR SELECT
  TO authenticated
  USING (public.is_teacher_or_above());

-- Students can insert their own session
CREATE POLICY "exam_sessions: own insert"
  ON public.exam_sessions FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid()::text);

-- Students can update their own session (answer sync)
CREATE POLICY "exam_sessions: own update"
  ON public.exam_sessions FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid()::text)
  WITH CHECK (student_id = auth.uid()::text);

-- Teachers & admins can update any session (add time, unlock returnee, etc.)
CREATE POLICY "exam_sessions: teacher update"
  ON public.exam_sessions FOR UPDATE
  TO authenticated
  USING (public.is_teacher_or_above())
  WITH CHECK (public.is_teacher_or_above());

-- Admins can delete sessions
CREATE POLICY "exam_sessions: admin all"
  ON public.exam_sessions FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ==============================================================================
-- TABLE: results
-- Rules:
--   SELECT: own result (student), teacher/admin can read all
--   INSERT: authenticated (students submit results at end of exam)
--   UPDATE: teacher/admin (essay scoring)
--   DELETE: admin only
-- ==============================================================================
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "results: own read"               ON public.results;
DROP POLICY IF EXISTS "results: teacher read all"       ON public.results;
DROP POLICY IF EXISTS "results: student insert"         ON public.results;
DROP POLICY IF EXISTS "results: student upsert"         ON public.results;
DROP POLICY IF EXISTS "results: teacher update"         ON public.results;
DROP POLICY IF EXISTS "results: admin delete"           ON public.results;
DROP POLICY IF EXISTS "results: service role full"      ON public.results;

CREATE POLICY "results: service role full"
  ON public.results FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Students can read their own results
CREATE POLICY "results: own read"
  ON public.results FOR SELECT
  TO authenticated
  USING (student_id = auth.uid()::text);

-- Teachers & admins can read all results
CREATE POLICY "results: teacher read all"
  ON public.results FOR SELECT
  TO authenticated
  USING (public.is_teacher_or_above());

-- Students can insert their own result (exam submission)
CREATE POLICY "results: student insert"
  ON public.results FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid()::text);

-- Students can update their own result (score improvement logic in app)
CREATE POLICY "results: student upsert"
  ON public.results FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid()::text)
  WITH CHECK (student_id = auth.uid()::text);

-- Teachers/admins can update any result (essay scoring)
CREATE POLICY "results: teacher update"
  ON public.results FOR UPDATE
  TO authenticated
  USING (public.is_teacher_or_above())
  WITH CHECK (public.is_teacher_or_above());

-- Admins can delete results
CREATE POLICY "results: admin delete"
  ON public.results FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ==============================================================================
-- TABLE: survey_notifications
-- Rules:
--   SELECT: own notifications (student/user)
--   INSERT: teacher/admin creates notifications for students
--   UPDATE: own (mark as read)
--   DELETE: admin or own
-- ==============================================================================
ALTER TABLE public.survey_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "survey_notif: own read"          ON public.survey_notifications;
DROP POLICY IF EXISTS "survey_notif: teacher insert"    ON public.survey_notifications;
DROP POLICY IF EXISTS "survey_notif: own update"        ON public.survey_notifications;
DROP POLICY IF EXISTS "survey_notif: admin delete"      ON public.survey_notifications;
DROP POLICY IF EXISTS "survey_notif: service role full" ON public.survey_notifications;

CREATE POLICY "survey_notif: service role full"
  ON public.survey_notifications FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "survey_notif: own read"
  ON public.survey_notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text);

CREATE POLICY "survey_notif: teacher insert"
  ON public.survey_notifications FOR INSERT
  TO authenticated
  WITH CHECK (public.is_teacher_or_above());

CREATE POLICY "survey_notif: own update"
  ON public.survey_notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "survey_notif: admin delete"
  ON public.survey_notifications FOR DELETE
  TO authenticated
  USING (public.is_admin() OR user_id = auth.uid()::text);


-- ==============================================================================
-- TABLE: student_listening_logs
-- Rules:
--   SELECT: own logs (student), teacher/admin can read all
--   INSERT/UPDATE: handled exclusively by start_audio_playback SECURITY DEFINER RPC
--                  but also allow authenticated to insert their own log
--   DELETE: admin only
-- ==============================================================================
ALTER TABLE public.student_listening_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "listening_logs: own read"          ON public.student_listening_logs;
DROP POLICY IF EXISTS "listening_logs: teacher read all"  ON public.student_listening_logs;
DROP POLICY IF EXISTS "listening_logs: own insert"        ON public.student_listening_logs;
DROP POLICY IF EXISTS "listening_logs: own update"        ON public.student_listening_logs;
DROP POLICY IF EXISTS "listening_logs: admin delete"      ON public.student_listening_logs;
DROP POLICY IF EXISTS "listening_logs: service role full" ON public.student_listening_logs;

CREATE POLICY "listening_logs: service role full"
  ON public.student_listening_logs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "listening_logs: own read"
  ON public.student_listening_logs FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "listening_logs: teacher read all"
  ON public.student_listening_logs FOR SELECT
  TO authenticated
  USING (public.is_teacher_or_above());

CREATE POLICY "listening_logs: own insert"
  ON public.student_listening_logs FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "listening_logs: own update"
  ON public.student_listening_logs FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "listening_logs: admin delete"
  ON public.student_listening_logs FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ==============================================================================
-- TABLE: login_logs
-- (Policies already defined in schema.sql — just ensure RLS is enabled)
-- Rules:
--   INSERT: anon + authenticated (login attempts happen before auth)
--   SELECT: authenticated (admin views login logs)
-- We re-apply cleanly to avoid conflicts.
-- ==============================================================================
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert to login_logs"       ON public.login_logs;
DROP POLICY IF EXISTS "Allow authenticated read login_logs"     ON public.login_logs;
DROP POLICY IF EXISTS "Allow read login_logs"                   ON public.login_logs;
DROP POLICY IF EXISTS "login_logs: public insert"               ON public.login_logs;
DROP POLICY IF EXISTS "login_logs: authenticated read"          ON public.login_logs;
DROP POLICY IF EXISTS "login_logs: service role full"           ON public.login_logs;

CREATE POLICY "login_logs: service role full"
  ON public.login_logs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Allow anon + authenticated to insert login attempt records
CREATE POLICY "login_logs: public insert"
  ON public.login_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only authenticated (admin/teacher) can read login logs
CREATE POLICY "login_logs: authenticated read"
  ON public.login_logs FOR SELECT
  TO authenticated
  USING (true);


-- ==============================================================================
-- TABLE: lms_courses  (if created — forward-compat)
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lms_courses'
  ) THEN
    EXECUTE 'ALTER TABLE public.lms_courses ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "lms_courses: authenticated read" ON public.lms_courses';
    EXECUTE 'DROP POLICY IF EXISTS "lms_courses: teacher write"      ON public.lms_courses';
    EXECUTE 'DROP POLICY IF EXISTS "lms_courses: service role full"  ON public.lms_courses';

    EXECUTE $p$
      CREATE POLICY "lms_courses: service role full"
        ON public.lms_courses FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    $p$;

    EXECUTE $p$
      CREATE POLICY "lms_courses: authenticated read"
        ON public.lms_courses FOR SELECT TO authenticated
        USING (true);
    $p$;

    EXECUTE $p$
      CREATE POLICY "lms_courses: teacher write"
        ON public.lms_courses FOR ALL TO authenticated
        USING (public.is_teacher_or_above())
        WITH CHECK (public.is_teacher_or_above());
    $p$;
  END IF;
END $$;


-- ==============================================================================
-- TABLE: lms_enrollments  (forward-compat)
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lms_enrollments'
  ) THEN
    EXECUTE 'ALTER TABLE public.lms_enrollments ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "lms_enrollments: authenticated read" ON public.lms_enrollments';
    EXECUTE 'DROP POLICY IF EXISTS "lms_enrollments: teacher write"      ON public.lms_enrollments';
    EXECUTE 'DROP POLICY IF EXISTS "lms_enrollments: service role full"  ON public.lms_enrollments';

    EXECUTE $p$
      CREATE POLICY "lms_enrollments: service role full"
        ON public.lms_enrollments FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    $p$;

    EXECUTE $p$
      CREATE POLICY "lms_enrollments: authenticated read"
        ON public.lms_enrollments FOR SELECT TO authenticated
        USING (true);
    $p$;

    EXECUTE $p$
      CREATE POLICY "lms_enrollments: teacher write"
        ON public.lms_enrollments FOR ALL TO authenticated
        USING (public.is_teacher_or_above())
        WITH CHECK (public.is_teacher_or_above());
    $p$;
  END IF;
END $$;


-- ==============================================================================
-- TABLE: academic_marks  (forward-compat)
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'academic_marks'
  ) THEN
    EXECUTE 'ALTER TABLE public.academic_marks ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "academic_marks: authenticated read" ON public.academic_marks';
    EXECUTE 'DROP POLICY IF EXISTS "academic_marks: teacher write"      ON public.academic_marks';
    EXECUTE 'DROP POLICY IF EXISTS "academic_marks: service role full"  ON public.academic_marks';

    EXECUTE $p$
      CREATE POLICY "academic_marks: service role full"
        ON public.academic_marks FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    $p$;

    EXECUTE $p$
      CREATE POLICY "academic_marks: authenticated read"
        ON public.academic_marks FOR SELECT TO authenticated
        USING (true);
    $p$;

    EXECUTE $p$
      CREATE POLICY "academic_marks: teacher write"
        ON public.academic_marks FOR ALL TO authenticated
        USING (public.is_teacher_or_above())
        WITH CHECK (public.is_teacher_or_above());
    $p$;
  END IF;
END $$;


-- ==============================================================================
-- TABLE: report_cards  (forward-compat)
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'report_cards'
  ) THEN
    EXECUTE 'ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "report_cards: authenticated read" ON public.report_cards';
    EXECUTE 'DROP POLICY IF EXISTS "report_cards: teacher write"      ON public.report_cards';
    EXECUTE 'DROP POLICY IF EXISTS "report_cards: service role full"  ON public.report_cards';

    EXECUTE $p$
      CREATE POLICY "report_cards: service role full"
        ON public.report_cards FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    $p$;

    EXECUTE $p$
      CREATE POLICY "report_cards: authenticated read"
        ON public.report_cards FOR SELECT TO authenticated
        USING (true);
    $p$;

    EXECUTE $p$
      CREATE POLICY "report_cards: teacher write"
        ON public.report_cards FOR ALL TO authenticated
        USING (public.is_teacher_or_above())
        WITH CHECK (public.is_teacher_or_above());
    $p$;
  END IF;
END $$;


-- ==============================================================================
-- TABLE: attendance  (forward-compat)
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'attendance'
  ) THEN
    EXECUTE 'ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "attendance: authenticated read" ON public.attendance';
    EXECUTE 'DROP POLICY IF EXISTS "attendance: teacher write"      ON public.attendance';
    EXECUTE 'DROP POLICY IF EXISTS "attendance: service role full"  ON public.attendance';

    EXECUTE $p$
      CREATE POLICY "attendance: service role full"
        ON public.attendance FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    $p$;

    EXECUTE $p$
      CREATE POLICY "attendance: authenticated read"
        ON public.attendance FOR SELECT TO authenticated
        USING (true);
    $p$;

    EXECUTE $p$
      CREATE POLICY "attendance: teacher write"
        ON public.attendance FOR ALL TO authenticated
        USING (public.is_teacher_or_above())
        WITH CHECK (public.is_teacher_or_above());
    $p$;
  END IF;
END $$;


-- ==============================================================================
-- TABLE: violation_logs  (forward-compat)
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'violation_logs'
  ) THEN
    EXECUTE 'ALTER TABLE public.violation_logs ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "violation_logs: authenticated read" ON public.violation_logs';
    EXECUTE 'DROP POLICY IF EXISTS "violation_logs: teacher write"      ON public.violation_logs';
    EXECUTE 'DROP POLICY IF EXISTS "violation_logs: service role full"  ON public.violation_logs';

    EXECUTE $p$
      CREATE POLICY "violation_logs: service role full"
        ON public.violation_logs FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    $p$;

    EXECUTE $p$
      CREATE POLICY "violation_logs: authenticated read"
        ON public.violation_logs FOR SELECT TO authenticated
        USING (true);
    $p$;

    EXECUTE $p$
      CREATE POLICY "violation_logs: teacher write"
        ON public.violation_logs FOR ALL TO authenticated
        USING (public.is_teacher_or_above())
        WITH CHECK (public.is_teacher_or_above());
    $p$;
  END IF;
END $$;


-- ==============================================================================
-- GRANT EXECUTE on helper functions to authenticated role
-- ==============================================================================
GRANT EXECUTE ON FUNCTION public.get_my_role_level() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher_or_above() TO authenticated;
