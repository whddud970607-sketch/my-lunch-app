-- 022_delivery_job_id_nullable_execution.sql
-- Purpose: P0-B3-1 job-neutral execution Session (delivery_job_id NULL).
-- CHECK enforces session_role ↔ column shape. One execution Session per Workday.

ALTER TABLE public.delivery_sessions
  ALTER COLUMN delivery_job_id DROP NOT NULL;

ALTER TABLE public.delivery_sessions
  DROP CONSTRAINT IF EXISTS delivery_sessions_role_shape;

ALTER TABLE public.delivery_sessions
  ADD CONSTRAINT delivery_sessions_role_shape CHECK (
    (
      session_role = 'legacy_job'
      AND workday_id IS NULL
      AND delivery_job_id IS NOT NULL
    )
    OR (
      session_role = 'workday_job_slice'
      AND workday_id IS NOT NULL
      AND delivery_job_id IS NOT NULL
    )
    OR (
      session_role = 'workday_execution'
      AND workday_id IS NOT NULL
      AND delivery_job_id IS NULL
    )
  );

COMMENT ON COLUMN public.delivery_sessions.delivery_job_id IS
  'NULL for workday_execution (B3). NOT NULL for legacy_job and workday_job_slice.';

-- One historical execution Session per Workday (includes completed).
CREATE UNIQUE INDEX IF NOT EXISTS delivery_sessions_one_execution_per_workday_idx
  ON public.delivery_sessions (workday_id)
  WHERE session_role = 'workday_execution';

-- Existing partial uniques unchanged:
-- delivery_sessions_one_open_per_driver_idx
-- delivery_sessions_one_open_per_job_idx (NULL job_id rows excluded)
