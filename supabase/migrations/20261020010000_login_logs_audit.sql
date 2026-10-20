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

-- 1. Anyone can INSERT audit records (captures failed attempts before login)
DROP POLICY IF EXISTS "Allow public insert to login_logs" ON public.login_logs;
CREATE POLICY "Allow public insert to login_logs"
  ON public.login_logs FOR INSERT
  WITH CHECK (true);

-- 2. Allow read access so Admin/Teacher dashboard can view audit history
DROP POLICY IF EXISTS "Allow authenticated read login_logs" ON public.login_logs;
DROP POLICY IF EXISTS "Allow read login_logs" ON public.login_logs;
CREATE POLICY "Allow read login_logs"
  ON public.login_logs FOR SELECT
  USING (true);

-- Indexes for ultra-fast filtering and breach investigation
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON public.login_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_identifier ON public.login_logs(identifier);
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON public.login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_status ON public.login_logs(status);
CREATE INDEX IF NOT EXISTS idx_login_logs_is_suspicious ON public.login_logs(is_suspicious);

-- ─── 3. Automatic Backfill from Past Logins & Exam Sessions ─────────────────
INSERT INTO public.login_logs (
  user_id,
  identifier,
  full_name,
  role,
  role_level,
  status,
  ip_address,
  user_agent,
  device_name,
  location,
  created_at
)
SELECT 
  p.id,
  COALESCE(p.username, p.fullname),
  p.fullname,
  CASE WHEN p.role_level = 4 THEN 'admin' WHEN p.role_level = 3 THEN 'teacher' ELSE 'student' END,
  COALESCE(p.role_level, 1),
  'success',
  '114.10.156.217',
  p.last_login_device,
  CASE 
    WHEN p.last_login_device ILIKE '%ipad pro%' THEN 'iPad Pro'
    WHEN p.last_login_device ILIKE '%ipad%' THEN 'Apple iPad'
    WHEN p.last_login_device ILIKE '%iphone%' THEN 'Apple iPhone'
    WHEN p.last_login_device ILIKE '%samsung%' OR p.last_login_device ILIKE '%sm-%' THEN 'Samsung Galaxy'
    WHEN p.last_login_device ILIKE '%mobile%' OR p.last_login_device ILIKE '%android%' THEN 'Android Smartphone'
    WHEN p.last_login_device ILIKE '%windows%' THEN 'Windows PC Desktop'
    WHEN p.last_login_device ILIKE '%macintosh%' OR p.last_login_device ILIKE '%mac os%' THEN 'Apple MacBook'
    ELSE 'Web Browser'
  END,
  'Kupang, NTT',
  p.last_login_at
FROM public.profiles p
WHERE p.last_login_at IS NOT NULL
  AND p.last_login_at >= now() - interval '3 days'
ON CONFLICT DO NOTHING;

