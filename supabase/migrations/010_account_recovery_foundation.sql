-- 010_account_recovery_foundation.sql
-- Account recovery foundation: identity profiles, verification sessions, recovery tokens.
-- Additive only — does NOT modify delivery_*, PII, access_secrets, or auth.users data.

CREATE TYPE public.identity_verification_purpose AS ENUM (
  'signup',
  'find_email',
  'reset_password',
  'admin_support'
);

CREATE TYPE public.identity_verification_status AS ENUM (
  'pending',
  'verified',
  'failed',
  'expired'
);

CREATE TYPE public.account_recovery_method AS ENUM (
  'phone',
  'driver_license',
  'admin'
);

CREATE TYPE public.account_status AS ENUM (
  'active',
  'locked',
  'recovery_pending'
);

ALTER TYPE public.data_access_action ADD VALUE IF NOT EXISTS 'account_recovery_phone_start';
ALTER TYPE public.data_access_action ADD VALUE IF NOT EXISTS 'account_recovery_phone_complete';
ALTER TYPE public.data_access_action ADD VALUE IF NOT EXISTS 'account_recovery_license_start';
ALTER TYPE public.data_access_action ADD VALUE IF NOT EXISTS 'account_recovery_admin_grant';
ALTER TYPE public.data_access_action ADD VALUE IF NOT EXISTS 'password_reset_complete';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status public.account_status NOT NULL DEFAULT 'active';

CREATE TABLE public.user_identity_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  birth_date date NOT NULL,
  phone_e164 text NOT NULL,
  phone_verified_at timestamptz,
  address_line1 text,
  address_line2 text,
  postal_code text,
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_identity_profiles_phone_e164_format
    CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE INDEX user_identity_profiles_phone_e164_idx
  ON public.user_identity_profiles (phone_e164);

CREATE INDEX user_identity_profiles_lookup_idx
  ON public.user_identity_profiles (legal_name, birth_date, phone_e164);

CREATE TABLE public.identity_verification_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  purpose public.identity_verification_purpose NOT NULL,
  provider text NOT NULL,
  provider_session_id text,
  status public.identity_verification_status NOT NULL DEFAULT 'pending',
  phone_e164 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX identity_verification_sessions_user_id_idx
  ON public.identity_verification_sessions (user_id);

CREATE INDEX identity_verification_sessions_expires_at_idx
  ON public.identity_verification_sessions (expires_at);

CREATE TABLE public.account_recovery_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  method public.account_recovery_method NOT NULL DEFAULT 'phone',
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_recovery_tokens_single_use
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX account_recovery_tokens_user_id_idx
  ON public.account_recovery_tokens (user_id);

CREATE INDEX account_recovery_tokens_expires_at_idx
  ON public.account_recovery_tokens (expires_at);

CREATE TABLE public.account_recovery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  method public.account_recovery_method NOT NULL,
  result text NOT NULL,
  ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX account_recovery_attempts_user_id_idx
  ON public.account_recovery_attempts (user_id);

CREATE INDEX account_recovery_attempts_created_at_idx
  ON public.account_recovery_attempts (created_at DESC);

ALTER TABLE public.user_identity_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_identity_profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.identity_verification_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_verification_sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.account_recovery_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_recovery_tokens FORCE ROW LEVEL SECURITY;

ALTER TABLE public.account_recovery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_recovery_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY user_identity_profiles_select_self
  ON public.user_identity_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY identity_verification_sessions_select_self
  ON public.identity_verification_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY account_recovery_attempts_select_self_or_platform
  ON public.account_recovery_attempts
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin()
  );

CREATE POLICY account_recovery_attempts_insert_authenticated
  ON public.account_recovery_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

GRANT SELECT ON public.user_identity_profiles TO authenticated;
GRANT SELECT ON public.identity_verification_sessions TO authenticated;
GRANT SELECT, INSERT ON public.account_recovery_attempts TO authenticated;

GRANT ALL ON public.user_identity_profiles TO service_role;
GRANT ALL ON public.identity_verification_sessions TO service_role;
GRANT ALL ON public.account_recovery_tokens TO service_role;
GRANT ALL ON public.account_recovery_attempts TO service_role;
