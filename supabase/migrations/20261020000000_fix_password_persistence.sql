-- ============================================================
-- Migration: Fix Password Persistence & Prevent Default Password Overwrite
-- Timestamp: 2026-10-20
-- Description:
-- Ensures that Teacher (Level 3) and Admin (Level 4) passwords
-- are never dynamically overwritten by default credentials ('password' or username).
-- ============================================================

CREATE OR REPLACE FUNCTION public.prepare_student_login(p_identifier TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_username TEXT;
  v_role_level SMALLINT;
  v_enc_pass TEXT;
  v_clean_ident TEXT;
  v_compact_ident TEXT;
BEGIN
  v_clean_ident := trim(p_identifier);
  p_password := trim(p_password);
  v_compact_ident := lower(regexp_replace(v_clean_ident, '[\s\-_]', '', 'g'));

  SELECT p.id, p.email, p.username, p.role_level
  INTO v_user_id, v_email, v_username, v_role_level
  FROM public.profiles p
  WHERE p.email ILIKE v_clean_ident
     OR p.username ILIKE v_clean_ident
     OR lower(regexp_replace(p.username, '[\s\-_]', '', 'g')) = v_compact_ident
     OR lower(regexp_replace(p.username, '[\s\-_]', '', 'g')) = regexp_replace(v_compact_ident, '([a-z])0+([1-9][0-9]*)$', '\1\2')
     OR (v_clean_ident ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND p.id = v_clean_ident::uuid)
     OR p.fullname ILIKE v_clean_ident
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT u.id, u.email, u.raw_user_meta_data->>'username', 1
    INTO v_user_id, v_email, v_username, v_role_level
    FROM auth.users u
    WHERE u.email ILIKE v_clean_ident
       OR u.email ILIKE (v_clean_ident || '@exam.binar.internal')
       OR u.raw_user_meta_data->>'username' ILIKE v_clean_ident
       OR lower(regexp_replace(coalesce(u.raw_user_meta_data->>'username', ''), '[\s\-_]', '', 'g')) = v_compact_ident
    LIMIT 1;

    IF v_user_id IS NULL THEN
      RETURN jsonb_build_object('found', false);
    END IF;
  END IF;

  -- Dynamic password synchronization for default credentials (strictly for Students/Officers Level 1 & 2 only)
  -- Teachers (Level 3) and Admins (Level 4) MUST NEVER have their passwords dynamically overwritten.
  IF (
    -- Students (Level 1) & Officers (Level 2) only
    ((v_role_level IS NULL OR v_role_level <= 2) AND (
      lower(p_password) IN ('password', '123456', '12345678')
      OR lower(p_password) = lower(v_username) 
      OR lower(p_password) = lower(v_clean_ident)
      OR lower(regexp_replace(p_password, '[\s\-_]', '', 'g')) = lower(regexp_replace(v_username, '[\s\-_]', '', 'g'))
    ))
  ) THEN
    v_enc_pass := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    UPDATE auth.users 
    SET encrypted_password = v_enc_pass, updated_at = now() 
    WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'email', v_email,
    'username', v_username,
    'user_id', v_user_id,
    'role_level', v_role_level
  );
END;
$$;
