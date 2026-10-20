-- ============================================================
-- Migration: Login Audit Logs & Account Breach Detection
-- Timestamp: 2026-10-20
-- Description:
-- Stores all authentication attempts (both successful and failed)
-- with client IP, user agent, parsed device info, and breach indicators.
-- ============================================================

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

-- Enable Row Level Security (RLS)
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

-- 1. Anyone (anon or authenticated) can INSERT audit records.
-- Crucial because failed login attempts happen BEFORE a valid Supabase session is established.
DROP POLICY IF EXISTS "Allow public insert to login_logs" ON public.login_logs;
CREATE POLICY "Allow public insert to login_logs"
  ON public.login_logs FOR INSERT
  WITH CHECK (true);

-- 2. Authenticated users can view login logs
-- Admins/Teachers inspect logs; students can see their own login history.
DROP POLICY IF EXISTS "Allow authenticated read login_logs" ON public.login_logs;
CREATE POLICY "Allow authenticated read login_logs"
  ON public.login_logs FOR SELECT
  TO authenticated
  USING (
    -- Admins (role_level 4) or Teachers (role_level 3) can see all logs
    (SELECT role_level FROM public.profiles WHERE id = auth.uid()) >= 3
    OR user_id = auth.uid()
  );

-- Indexes for ultra-fast filtering and breach investigation
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON public.login_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_identifier ON public.login_logs(identifier);
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON public.login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_status ON public.login_logs(status);
CREATE INDEX IF NOT EXISTS idx_login_logs_is_suspicious ON public.login_logs(is_suspicious);
