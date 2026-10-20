-- ==============================================================================
-- Migration: 20261020060000_fix_login_logs_system.sql
-- Description:
-- Complete, robust login audit and background device telemetry logging.
-- Adds UPDATE policy for background device telemetry synchronization,
-- creates clean indexes, and cleans up mismatched demo/mock seed logs.
-- ==============================================================================

-- 1. Ensure login_logs table exists with full schema
CREATE TABLE IF NOT EXISTS public.login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  identifier TEXT NOT NULL,
  full_name TEXT,
  role TEXT,
  role_level SMALLINT,
  status TEXT NOT NULL, -- 'success' | 'failed'
  failure_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  device_name TEXT,
  location TEXT,
  is_suspicious BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add extra columns if existing table lacked them
ALTER TABLE public.login_logs
  ADD COLUMN IF NOT EXISTS is_suspicious BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

-- 4. Clean up any previous conflicting policies
DROP POLICY IF EXISTS "Allow public insert to login_logs"       ON public.login_logs;
DROP POLICY IF EXISTS "Allow authenticated read login_logs"     ON public.login_logs;
DROP POLICY IF EXISTS "Allow read login_logs"                   ON public.login_logs;
DROP POLICY IF EXISTS "Allow update login_logs"                 ON public.login_logs;
DROP POLICY IF EXISTS "login_logs: service role full"           ON public.login_logs;
DROP POLICY IF EXISTS "login_logs: public insert"               ON public.login_logs;
DROP POLICY IF EXISTS "login_logs: authenticated read"          ON public.login_logs;
DROP POLICY IF EXISTS "login_logs: public and auth update"      ON public.login_logs;

-- 5. Recreate explicit RLS Policies
-- A. Service role has full access
CREATE POLICY "login_logs: service role full"
  ON public.login_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- B. Pre-auth & authenticated users can insert (for failed and successful login records)
CREATE POLICY "login_logs: public insert"
  ON public.login_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- C. Authenticated users (Admin / Teacher oversight) can read logs
CREATE POLICY "login_logs: authenticated read"
  ON public.login_logs FOR SELECT
  TO authenticated
  USING (true);

-- D. CRITICAL: Allow updating existing logs for background device scanning & location calibration
-- This allows the background scanner (up to 10 minutes) to enrich the device model,
-- verified IP, and fuzzed location without being blocked by RLS.
CREATE POLICY "login_logs: public and auth update"
  ON public.login_logs FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 6. Indexes for performance & audit searches
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at    ON public.login_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_identifier    ON public.login_logs(identifier);
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id       ON public.login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_status        ON public.login_logs(status);
CREATE INDEX IF NOT EXISTS idx_login_logs_is_suspicious ON public.login_logs(is_suspicious);

-- 7. Clean up fake/mock demo records from past manual migrations if present
DELETE FROM public.login_logs
WHERE identifier IN ('mikhail', 'budi_santoso')
  AND ip_address = '114.10.156.217'
  AND (device_name ILIKE '%iPad Pro%' OR device_name ILIKE '%Samsung Galaxy%')
  AND user_id IS NULL;
