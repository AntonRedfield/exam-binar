-- ============================================================
-- BINAR EXAM SYSTEM — Passkey / Fast Login Migration
-- Run this in the Supabase SQL Editor (supabase.com)
-- 
-- This adds passkey tracking columns to the users table
-- so the system can detect whether a user has registered
-- a passkey on any device.
-- ============================================================

-- Add passkey tracking columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_passkey BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS passkey_registered_at TIMESTAMPTZ;

-- Verify the columns were added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('has_passkey', 'passkey_registered_at');
