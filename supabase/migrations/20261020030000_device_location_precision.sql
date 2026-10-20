-- ============================================================
-- Migration: Device Location Verification (200-300m Precision)
-- Timestamp: 2026-10-20
-- Description:
-- Adds location columns & update policies for login_logs and exam_sessions
-- to record slow device location verification during 1-5 minutes after exam start.
-- ============================================================

-- 1. Ensure login_logs has UPDATE policy so slow location verification can update the user's latest login
DROP POLICY IF EXISTS "Allow update login_logs" ON public.login_logs;
CREATE POLICY "Allow update login_logs"
  ON public.login_logs FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 2. Add location columns to exam_sessions if not existing
ALTER TABLE public.exam_sessions
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS location_precision VARCHAR(50),
  ADD COLUMN IF NOT EXISTS location_captured_at TIMESTAMPTZ;

-- 3. Create index for fast query on sessions location
CREATE INDEX IF NOT EXISTS idx_exam_sessions_location ON public.exam_sessions(location);
