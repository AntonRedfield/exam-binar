-- ==============================================================================
-- MIGRATION: 20261020070000_peer_monitoring_active_exams.sql
-- DESCRIPTION:
--   Enables peer-to-peer / backup exam monitoring for all teachers across the school.
--   Allows any teacher (level >= 3 / MODERATOR) to update active/published exams
--   (for returnee token generation, token extension, and duration adjustments)
--   and live-edit questions for active/published exams during proctoring sessions.
-- ==============================================================================

-- 1. Update EXAMS table RLS: allow teachers to update active/published exams
DROP POLICY IF EXISTS "exams: teacher update own" ON public.exams;
DROP POLICY IF EXISTS "exams: teacher update own or active" ON public.exams;

CREATE POLICY "exams: teacher update own or active"
  ON public.exams FOR UPDATE
  TO authenticated
  USING (
    public.is_teacher_or_above()
    AND (created_by = auth.uid()::text OR status = 'published')
  )
  WITH CHECK (
    public.is_teacher_or_above()
    AND (created_by = auth.uid()::text OR status = 'published')
  );

-- 2. Update QUESTIONS table RLS: allow teachers to live-correct questions for active/published exams
DROP POLICY IF EXISTS "questions: teacher write" ON public.questions;

CREATE POLICY "questions: teacher write"
  ON public.questions FOR ALL
  TO authenticated
  USING (
    public.is_teacher_or_above()
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_id
        AND (e.created_by = auth.uid()::text OR e.status = 'published' OR public.is_admin())
    )
  )
  WITH CHECK (
    public.is_teacher_or_above()
    AND EXISTS (
      SELECT 1 FROM public.exams e
      WHERE e.id = exam_id
        AND (e.created_by = auth.uid()::text OR e.status = 'published' OR public.is_admin())
    )
  );
