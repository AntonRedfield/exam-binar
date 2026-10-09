-- ==============================================================================
-- MIGRATION: 20261009000000_exam_token_duration.sql
-- Description: Centralized Exam Token System (OSN Exambro & TKA System)
-- Adds token duration and expiration to exams table.
-- ==============================================================================

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS returnee_token_expires_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS returnee_token_duration INTEGER DEFAULT 60;

-- Optional index to speed up token lookup / queries
CREATE INDEX IF NOT EXISTS idx_exams_returnee_token ON public.exams(returnee_token);
