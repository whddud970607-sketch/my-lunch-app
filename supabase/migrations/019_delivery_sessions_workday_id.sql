-- 019_delivery_sessions_workday_id.sql
-- Purpose: Additive nullable link Session → Workday.
-- Keeps delivery_job_id NOT NULL. Legacy sessions remain workday_id NULL.

ALTER TABLE public.delivery_sessions
  ADD COLUMN IF NOT EXISTS workday_id uuid
    REFERENCES public.delivery_workdays (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS delivery_sessions_workday_id_idx
  ON public.delivery_sessions (workday_id)
  WHERE workday_id IS NOT NULL;

COMMENT ON COLUMN public.delivery_sessions.workday_id IS
  'Optional Workday link (P0-B2). NULL = legacy session. '
  'delivery_job_id remains NOT NULL. Route ownership unchanged.';

-- Consistency: when workday_id is set, it must belong to the same driver.
-- Enforced primarily in Nest; DB CHECK via trigger for defense in depth.
CREATE OR REPLACE FUNCTION public.enforce_session_workday_driver_match()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_workday_driver uuid;
BEGIN
  IF NEW.workday_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT driver_id INTO v_workday_driver
  FROM public.delivery_workdays
  WHERE id = NEW.workday_id;
  IF v_workday_driver IS NULL THEN
    RAISE EXCEPTION 'session workday_id not found';
  END IF;
  IF v_workday_driver IS DISTINCT FROM NEW.driver_id THEN
    RAISE EXCEPTION 'session workday driver mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_sessions_workday_driver_match
  ON public.delivery_sessions;

CREATE TRIGGER trg_delivery_sessions_workday_driver_match
  BEFORE INSERT OR UPDATE OF workday_id, driver_id
  ON public.delivery_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_session_workday_driver_match();

REVOKE ALL ON FUNCTION public.enforce_session_workday_driver_match()
  FROM PUBLIC, anon, authenticated;
