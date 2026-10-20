-- ============================================================
-- Migration: Fix Login Old Password Bug
-- Timestamp: 2026-10-20
-- Description:
--   Fixes prepare_student_login so that users who have already set
--   a custom password (has_custom_password = true in user metadata)
--   are NEVER subject to default-credential re-synchronization.
--   Also returns has_custom_password in the result so the JS login
--   function can skip the fallback sync entirely for those users.
--
--   Root cause of bug:
--     After a user changed their password via updateOwnPassword(), the
--     register_seed_user RPC was called as a "fallback" which reconstructed
--     the entire auth.users row and OVERWROTE raw_user_meta_data without
--     preserving the has_custom_password = true flag. On the next login
--     attempt the prepare_student_login RPC saw no custom-password flag and
--     would re-hash whatever password was passed in, allowing old/default
--     passwords to become valid again.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prepare_student_login(p_identifier TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id        UUID;
  v_email          TEXT;
  v_username       TEXT;
  v_role_level     SMALLINT;
  v_enc_pass       TEXT;
  v_clean_ident    TEXT;
  v_compact_ident  TEXT;
  v_has_custom_pw  BOOLEAN := false;
BEGIN
  v_clean_ident   := trim(p_identifier);
  p_password      := trim(p_password);
  v_compact_ident := lower(regexp_replace(v_clean_ident, '[\s\-_]', '', 'g'));

  -- Step 1: Resolve user from profiles table
  SELECT p.id, p.email, p.username, p.role_level
  INTO   v_user_id, v_email, v_username, v_role_level
  FROM   public.profiles p
  WHERE  p.email    ILIKE v_clean_ident
     OR  p.username ILIKE v_clean_ident
     OR  lower(regexp_replace(p.username, '[\s\-_]', '', 'g')) = v_compact_ident
     OR  lower(regexp_replace(p.username, '[\s\-_]', '', 'g')) = regexp_replace(v_compact_ident, '([a-z])0+([1-9][0-9]*)$', '\1\2')
     OR  (v_clean_ident ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND p.id = v_clean_ident::uuid)
     OR  p.fullname ILIKE v_clean_ident
  LIMIT 1;

  -- Step 2: Fallback to auth.users if profile not found
  IF v_user_id IS NULL THEN
    SELECT u.id, u.email, u.raw_user_meta_data->>'username', 1
    INTO   v_user_id, v_email, v_username, v_role_level
    FROM   auth.users u
    WHERE  u.email ILIKE v_clean_ident
       OR  u.email ILIKE (v_clean_ident || '@exam.binar.internal')
       OR  u.raw_user_meta_data->>'username' ILIKE v_clean_ident
       OR  lower(regexp_replace(coalesce(u.raw_user_meta_data->>'username', ''), '[\s\-_]', '', 'g')) = v_compact_ident
    LIMIT 1;

    IF v_user_id IS NULL THEN
      RETURN jsonb_build_object('found', false);
    END IF;
  END IF;

  -- Step 3: Check has_custom_password flag from GoTrue metadata
  -- If the user has already set a custom password we must NEVER re-sync their
  -- credentials with a default-credential hash.
  SELECT COALESCE((u.raw_user_meta_data->>'has_custom_password')::boolean, false)
  INTO   v_has_custom_pw
  FROM   auth.users u
  WHERE  u.id = v_user_id;

  -- Step 4: Default-credential sync (Students/Officers Level 1 & 2 ONLY)
  -- Skip entirely if the user already has a custom password set.
  IF (
    NOT v_has_custom_pw
    AND (v_role_level IS NULL OR v_role_level <= 2)
    AND p_password <> ''
    AND (
      lower(p_password) IN ('password', '123456', '12345678')
      OR lower(p_password) = lower(v_username)
      OR lower(p_password) = lower(v_clean_ident)
      OR lower(regexp_replace(p_password, '[\s\-_]', '', 'g')) = lower(regexp_replace(coalesce(v_username, ''), '[\s\-_]', '', 'g'))
    )
  ) THEN
    v_enc_pass := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    UPDATE auth.users
    SET    encrypted_password = v_enc_pass,
           updated_at         = now()
    WHERE  id = v_user_id;
  END IF;

  -- Step 5: Return resolution result including has_custom_password flag
  RETURN jsonb_build_object(
    'found',               true,
    'email',               v_email,
    'username',            v_username,
    'user_id',             v_user_id,
    'role_level',          v_role_level,
    'has_custom_password', v_has_custom_pw
  );
END;
$$;
