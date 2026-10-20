-- ============================================================
-- Migration: Passive Hidden Selfie & Anti-Piloting (Anti-Joki)
-- Timestamp: 2026-10-20
-- Description:
-- Adds passive selfie verification fields to exam_sessions to ensure
-- students taking exams are physically present and not piloted remotely.
-- ============================================================

ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS selfie_image TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS selfie_status VARCHAR(30) DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS selfie_captured_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS selfie_failure_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS teacher_confirmed_by TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS teacher_confirmed_at TIMESTAMPTZ DEFAULT NULL;

-- Index for quickly querying unverified or piloted sessions in teacher monitor
CREATE INDEX IF NOT EXISTS idx_exam_sessions_selfie_status ON public.exam_sessions(selfie_status);
