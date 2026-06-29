-- ============================================================
-- BINAR EXAM SYSTEM — Survey Mode Migration
-- Run this in the Supabase SQL Editor AFTER the main migration
-- ============================================================

-- 1. ADD SURVEY COLUMNS TO EXAMS TABLE
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS survey_type TEXT DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS survey_recurrence TEXT,
  ADD COLUMN IF NOT EXISTS survey_notify_time TEXT,
  ADD COLUMN IF NOT EXISTS survey_valid_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS survey_valid_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS survey_allow_edit BOOLEAN DEFAULT false;

-- 1b. UPDATE MODE CHECK CONSTRAINT to allow 'survey'
ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_mode_check;
ALTER TABLE exams ADD CONSTRAINT exams_mode_check
  CHECK (mode IN ('exam', 'quiz', 'survey'));

-- 2. UPDATE QUESTIONS TABLE — add survey-specific columns
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS scale_min INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS scale_max INT DEFAULT 5,
  ADD COLUMN IF NOT EXISTS scale_min_label TEXT,
  ADD COLUMN IF NOT EXISTS scale_max_label TEXT,
  ADD COLUMN IF NOT EXISTS grid_rows JSONB,
  ADD COLUMN IF NOT EXISTS grid_columns JSONB,
  ADD COLUMN IF NOT EXISTS allow_other BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS required BOOLEAN DEFAULT true;

-- 3. DROP and re-create the type CHECK constraint on questions
--    to support new survey question types
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE questions ADD CONSTRAINT questions_type_check
  CHECK (type IN (
    'MCQ','COMPLEX_MCQ','TRUE_FALSE','ESSAY',
    'SHORT_ANSWER','PARAGRAPH','LINEAR_SCALE',
    'MCQ_GRID','CHECKBOX_GRID','CHECKBOXES','DROPDOWN'
  ));

-- 4. NOTIFICATIONS TABLE for scheduled survey reminders
CREATE TABLE IF NOT EXISTS survey_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'reminder',
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE survey_notifications DISABLE ROW LEVEL SECURITY;

-- 5. INDEX for faster notification lookups
CREATE INDEX IF NOT EXISTS idx_survey_notifications_user
  ON survey_notifications(user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_survey_notifications_exam
  ON survey_notifications(exam_id);
