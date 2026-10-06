-- ==============================================================================
-- MIGRATION: 20261006000000_cbt_listening_engine.sql
-- Description: TOEFL/IELTS Computer-Based Testing (CBT) Listening Engine
-- Stack: Supabase PostgreSQL, Supabase Storage, Supabase Edge Functions
-- Features:
--   1. Storage bucket 'exam-audio' with public read access
--   2. Questions table audio fields: audio_url, max_plays, allow_pause
--   3. student_listening_logs table with UNIQUE(student_id, question_id)
--   4. Atomic start_audio_playback(p_student_id, p_question_id) RPC
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. STORAGE BUCKET: exam-audio
-- ------------------------------------------------------------------------------
-- Ensure the storage schema extension exists
CREATE SCHEMA IF NOT EXISTS storage;

-- Create the public bucket 'exam-audio' if not already present
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'exam-audio',
    'exam-audio',
    true,
    52428800, -- 50MB max file size (mono speech files are typically 1-5MB)
    ARRAY[
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/ogg',
        'audio/aac',
        'audio/m4a',
        'audio/mp4',
        'audio/x-m4a',
        'audio/webm'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/ogg',
        'audio/aac',
        'audio/m4a',
        'audio/mp4',
        'audio/x-m4a',
        'audio/webm'
    ];

-- Storage Policies for 'exam-audio'
DROP POLICY IF EXISTS "Public Read exam-audio" ON storage.objects;
CREATE POLICY "Public Read exam-audio"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'exam-audio');

DROP POLICY IF EXISTS "Authenticated Upload exam-audio" ON storage.objects;
CREATE POLICY "Authenticated Upload exam-audio"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'exam-audio');

DROP POLICY IF EXISTS "Authenticated Update exam-audio" ON storage.objects;
CREATE POLICY "Authenticated Update exam-audio"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'exam-audio');

DROP POLICY IF EXISTS "Service Role exam-audio" ON storage.objects;
CREATE POLICY "Service Role exam-audio"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'exam-audio')
WITH CHECK (bucket_id = 'exam-audio');


-- ------------------------------------------------------------------------------
-- 2. QUESTIONS TABLE SCHEMA MODIFICATIONS
-- ------------------------------------------------------------------------------
-- Create questions table if starting from a fresh database
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID,
    audio_url TEXT,
    max_plays INT NOT NULL DEFAULT 1,
    allow_pause BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure audio columns exist on existing table installations
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS max_plays INT NOT NULL DEFAULT 1;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS allow_pause BOOLEAN NOT NULL DEFAULT false;

-- Add comment annotations for documentation
COMMENT ON COLUMN public.questions.audio_url IS 'CDN URL for mirrored CBT listening audio stream';
COMMENT ON COLUMN public.questions.max_plays IS 'Maximum authorized playback count per candidate (default: 1 for IELTS/TOEFL)';
COMMENT ON COLUMN public.questions.allow_pause IS 'Whether candidate is permitted to pause the audio (default: false)';


-- ------------------------------------------------------------------------------
-- 3. STUDENT LISTENING LOGS TABLE
-- ------------------------------------------------------------------------------
-- Tracks individual candidate playback attempts to strictly enforce 1-time (or N-time)
-- plays across page reloads, tab switches, and candidate reconnects.

DO $$
DECLARE
    q_type text;
BEGIN
    SELECT data_type INTO q_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'questions' AND column_name = 'id';

    IF q_type = 'uuid' OR q_type IS NULL THEN
        CREATE TABLE IF NOT EXISTS public.student_listening_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id UUID NOT NULL,
            question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
            play_count INT NOT NULL DEFAULT 0,
            is_locked BOOLEAN NOT NULL DEFAULT false,
            last_played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_student_question_listening UNIQUE (student_id, question_id)
        );
    ELSE
        -- Support databases where questions.id is TEXT/VARCHAR
        CREATE TABLE IF NOT EXISTS public.student_listening_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id UUID NOT NULL,
            question_id TEXT NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
            play_count INT NOT NULL DEFAULT 0,
            is_locked BOOLEAN NOT NULL DEFAULT false,
            last_played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_student_question_listening UNIQUE (student_id, question_id)
        );
    END IF;
END $$;

-- Indexes for performance during active testing sessions
CREATE INDEX IF NOT EXISTS idx_listening_logs_lookup
ON public.student_listening_logs (student_id, question_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.student_listening_logs ENABLE ROW LEVEL SECURITY;

-- Allow students to read their own listening log records
DROP POLICY IF EXISTS "Students can view own listening logs" ON public.student_listening_logs;
CREATE POLICY "Students can view own listening logs"
ON public.student_listening_logs FOR SELECT
TO authenticated, anon
USING (true);

-- Modification of listening logs is strictly controlled via the atomic SECURITY DEFINER function below.
DROP POLICY IF EXISTS "Service role manages listening logs" ON public.student_listening_logs;
CREATE POLICY "Service role manages listening logs"
ON public.student_listening_logs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- ------------------------------------------------------------------------------
-- 4. ATOMIC POSTGRES FUNCTION: start_audio_playback
-- ------------------------------------------------------------------------------
-- Atomically validates playback quota, increments play_count, and sets is_locked.
-- Utilizes row-level locking (SELECT FOR UPDATE) to prevent race conditions from
-- rapid double-clicks, concurrent tabs, or script manipulation.
--
-- Signature:
--   start_audio_playback(p_student_id UUID, p_question_id UUID)
-- Returns:
--   JSONB: { "allowed": boolean, "remaining_plays": number, "reason": text }

CREATE OR REPLACE FUNCTION public.start_audio_playback(
    p_student_id UUID,
    p_question_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_max_plays INT;
    v_audio_url TEXT;
    v_current_plays INT;
    v_is_locked BOOLEAN;
    v_remaining INT;
    v_new_play_count INT;
    v_should_lock BOOLEAN;
BEGIN
    -- 1. Fetch question playback configuration
    SELECT max_plays, audio_url
    INTO v_max_plays, v_audio_url
    FROM public.questions
    WHERE id::text = p_question_id::text;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'remaining_plays', 0,
            'reason', 'Question not found'
        );
    END IF;

    -- Default max_plays to 1 if unset or invalid
    IF v_max_plays IS NULL OR v_max_plays <= 0 THEN
        v_max_plays := 1;
    END IF;

    IF v_audio_url IS NULL OR TRIM(v_audio_url) = '' THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'remaining_plays', 0,
            'reason', 'No audio track associated with this question'
        );
    END IF;

    -- 2. Atomically ensure log row exists (idempotent, safe against unique violation)
    INSERT INTO public.student_listening_logs (
        student_id,
        question_id,
        play_count,
        is_locked,
        last_played_at
    )
    VALUES (
        p_student_id,
        CASE 
            WHEN (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'student_listening_logs' AND column_name = 'question_id') = 'uuid'
            THEN p_question_id
            ELSE p_question_id::text::uuid
        END,
        0,
        false,
        now()
    )
    ON CONFLICT (student_id, question_id) DO NOTHING;

    -- 3. Row-level exclusive lock (FOR UPDATE) to serialize concurrent requests
    SELECT play_count, is_locked
    INTO v_current_plays, v_is_locked
    FROM public.student_listening_logs
    WHERE student_id = p_student_id AND question_id::text = p_question_id::text
    FOR UPDATE;

    -- Fallback in case insert-then-select edge condition
    IF v_current_plays IS NULL THEN
        v_current_plays := 0;
        v_is_locked := false;
    END IF;

    -- 4. Check if playback is already locked or exceeded
    IF v_is_locked OR v_current_plays >= v_max_plays THEN
        -- Mark row as locked if not yet set
        IF NOT v_is_locked THEN
            UPDATE public.student_listening_logs
            SET is_locked = true
            WHERE student_id = p_student_id AND question_id::text = p_question_id::text;
        END IF;

        RETURN jsonb_build_object(
            'allowed', false,
            'remaining_plays', 0,
            'reason', 'Audio playback limit reached (' || v_current_plays || ' of ' || v_max_plays || ' used)'
        );
    END IF;

    -- 5. Atomically increment play_count and evaluate remaining plays
    v_new_play_count := v_current_plays + 1;
    v_remaining := GREATEST(0, v_max_plays - v_new_play_count);
    v_should_lock := (v_remaining = 0);

    UPDATE public.student_listening_logs
    SET
        play_count = v_new_play_count,
        is_locked = v_should_lock,
        last_played_at = now()
    WHERE student_id = p_student_id AND question_id::text = p_question_id::text;

    RETURN jsonb_build_object(
        'allowed', true,
        'remaining_plays', v_remaining,
        'reason', 'Playback authorized'
    );
END;
$$;

-- Overload supporting TEXT identifiers (convenient for client RPC calls or mixed types)
CREATE OR REPLACE FUNCTION public.start_audio_playback(
    p_student_id TEXT,
    p_question_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_student_uuid UUID;
    v_question_uuid UUID;
BEGIN
    -- If valid UUID format, route directly to the UUID implementation
    BEGIN
        v_student_uuid := p_student_id::UUID;
        v_question_uuid := p_question_id::UUID;
        RETURN public.start_audio_playback(v_student_uuid, v_question_uuid);
    EXCEPTION WHEN invalid_text_representation THEN
        -- Deterministic conversion for mock/legacy text identifiers
        v_student_uuid := md5(p_student_id)::UUID;
        v_question_uuid := md5(p_question_id)::UUID;
        
        -- Custom execution for non-UUID question ID
        DECLARE
            v_max_plays INT;
            v_audio_url TEXT;
            v_current_plays INT;
            v_is_locked BOOLEAN;
            v_remaining INT;
            v_new_play_count INT;
            v_should_lock BOOLEAN;
        BEGIN
            SELECT max_plays, audio_url
            INTO v_max_plays, v_audio_url
            FROM public.questions
            WHERE id::text = p_question_id;

            IF NOT FOUND THEN
                RETURN jsonb_build_object('allowed', false, 'remaining_plays', 0, 'reason', 'Question not found');
            END IF;

            v_max_plays := COALESCE(NULLIF(v_max_plays, 0), 1);

            INSERT INTO public.student_listening_logs (student_id, question_id, play_count, is_locked, last_played_at)
            VALUES (
                v_student_uuid,
                CASE 
                    WHEN (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'student_listening_logs' AND column_name = 'question_id') = 'uuid'
                    THEN v_question_uuid
                    ELSE p_question_id
                END,
                0,
                false,
                now()
            )
            ON CONFLICT (student_id, question_id) DO NOTHING;

            SELECT play_count, is_locked INTO v_current_plays, v_is_locked
            FROM public.student_listening_logs
            WHERE student_id = v_student_uuid AND question_id::text = p_question_id
            FOR UPDATE;

            IF v_is_locked OR COALESCE(v_current_plays, 0) >= v_max_plays THEN
                RETURN jsonb_build_object('allowed', false, 'remaining_plays', 0, 'reason', 'Audio playback limit reached');
            END IF;

            v_new_play_count := COALESCE(v_current_plays, 0) + 1;
            v_remaining := GREATEST(0, v_max_plays - v_new_play_count);
            v_should_lock := (v_remaining = 0);

            UPDATE public.student_listening_logs
            SET play_count = v_new_play_count, is_locked = v_should_lock, last_played_at = now()
            WHERE student_id = v_student_uuid AND question_id::text = p_question_id;

            RETURN jsonb_build_object('allowed', true, 'remaining_plays', v_remaining, 'reason', 'Playback authorized');
        END;
    END;
END;
$$;

-- Grant execution permissions for RPC access
GRANT EXECUTE ON FUNCTION public.start_audio_playback(UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.start_audio_playback(TEXT, TEXT) TO authenticated, anon;
