-- 021_session_execution_role_foundation.sql
-- Purpose: P0-B3-1 explicit session_role for transitional Session kinds.
-- Additive only — deterministic backfill from workday_id / delivery_job_id shape.

CREATE TYPE public.delivery_session_role AS ENUM (
  'legacy_job',
  'workday_job_slice',
  'workday_execution'
);

ALTER TABLE public.delivery_sessions
  ADD COLUMN IF NOT EXISTS session_role public.delivery_session_role;

COMMENT ON COLUMN public.delivery_sessions.session_role IS
  'Transitional execution kind: legacy_job | workday_job_slice | workday_execution. '
  'Server-assigned only — never client-controlled.';

-- Deterministic backfill (pre-nullable job_id: no execution rows yet).
UPDATE public.delivery_sessions
SET session_role = 'legacy_job'
WHERE session_role IS NULL
  AND workday_id IS NULL
  AND delivery_job_id IS NOT NULL;

UPDATE public.delivery_sessions
SET session_role = 'workday_job_slice'
WHERE session_role IS NULL
  AND workday_id IS NOT NULL
  AND delivery_job_id IS NOT NULL;

-- Abort if any row cannot be classified (both NULL or execution shape before 022).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.delivery_sessions
    WHERE session_role IS NULL
  ) THEN
    RAISE EXCEPTION
      '021 backfill failed: unclassified delivery_sessions rows remain';
  END IF;
END;
$$;

ALTER TABLE public.delivery_sessions
  ALTER COLUMN session_role SET NOT NULL;

CREATE INDEX IF NOT EXISTS delivery_sessions_session_role_idx
  ON public.delivery_sessions (session_role);
