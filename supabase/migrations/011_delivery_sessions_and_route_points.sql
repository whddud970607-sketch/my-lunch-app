-- 011_delivery_sessions_and_route_points.sql
-- Purpose: Active delivery shift (session) + sampled GPS route points.
-- Additive only — no destructive changes to existing delivery tables.
--
-- Retention defaults (product, NOT legally finalized):
--   route points: 30 days
--   session metadata/summary: 90 days
-- Production TODO: PIPA / location-info law review, consent, privacy policy,
-- retention notice, account deletion cascade, company-admin route access policy.

CREATE TYPE public.delivery_session_status AS ENUM (
  'active',
  'ending',
  'completed',
  'abandoned'
);

CREATE TABLE public.delivery_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  delivery_job_id uuid NOT NULL REFERENCES public.delivery_jobs (id) ON DELETE RESTRICT,
  status public.delivery_session_status NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  idempotency_key text NOT NULL,
  client_started_at timestamptz,
  start_location extensions.geography(Point, 4326),
  end_location extensions.geography(Point, 4326),
  -- Snapshot of counts at end (immutable for report). Live counts come from delivery_points.
  summary_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_sessions_ended_requires_time CHECK (
    status NOT IN ('ending', 'completed') OR ended_at IS NOT NULL
  ),
  CONSTRAINT delivery_sessions_idempotency_key_unique UNIQUE (driver_id, idempotency_key)
);

CREATE INDEX delivery_sessions_driver_id_idx ON public.delivery_sessions (driver_id);
CREATE INDEX delivery_sessions_job_id_idx ON public.delivery_sessions (delivery_job_id);
CREATE INDEX delivery_sessions_status_idx ON public.delivery_sessions (status);
CREATE INDEX delivery_sessions_started_at_idx ON public.delivery_sessions (started_at);

-- One in-progress session per driver
CREATE UNIQUE INDEX delivery_sessions_one_open_per_driver_idx
  ON public.delivery_sessions (driver_id)
  WHERE status IN ('active', 'ending');

-- One in-progress session per job
CREATE UNIQUE INDEX delivery_sessions_one_open_per_job_idx
  ON public.delivery_sessions (delivery_job_id)
  WHERE status IN ('active', 'ending');

CREATE TRIGGER trg_delivery_sessions_updated_at
  BEFORE UPDATE ON public.delivery_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.delivery_route_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.delivery_sessions (id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  sequence_no bigint NOT NULL CHECK (sequence_no >= 1),
  recorded_at timestamptz NOT NULL,
  location extensions.geography(Point, 4326) NOT NULL,
  accuracy_m real,
  speed_mps real,
  heading_deg real,
  source text NOT NULL DEFAULT 'gps',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_route_points_session_sequence_unique UNIQUE (session_id, sequence_no)
);

CREATE INDEX delivery_route_points_session_seq_idx
  ON public.delivery_route_points (session_id, sequence_no);
CREATE INDEX delivery_route_points_session_recorded_idx
  ON public.delivery_route_points (session_id, recorded_at);
CREATE INDEX delivery_route_points_driver_recorded_idx
  ON public.delivery_route_points (driver_id, recorded_at);

-- Retention purge helpers (service_role only; cron/ops later)
CREATE OR REPLACE FUNCTION public.purge_expired_delivery_route_points(
  p_older_than_days int DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.delivery_route_points
  WHERE recorded_at < (now() - make_interval(days => p_older_than_days));
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_delivery_session_metadata(
  p_older_than_days int DEFAULT 90
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.delivery_sessions
  WHERE status IN ('completed', 'abandoned')
    AND coalesce(ended_at, started_at) < (now() - make_interval(days => p_older_than_days));
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_delivery_route_points(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_delivery_session_metadata(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_delivery_route_points(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_delivery_session_metadata(int) TO service_role;

-- ========================= RLS =========================
ALTER TABLE public.delivery_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_route_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_route_points FORCE ROW LEVEL SECURITY;

CREATE POLICY delivery_sessions_select_own
  ON public.delivery_sessions
  FOR SELECT
  TO authenticated
  USING (driver_id = public.current_driver_id());

CREATE POLICY delivery_sessions_insert_own
  ON public.delivery_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY delivery_sessions_update_own
  ON public.delivery_sessions
  FOR UPDATE
  TO authenticated
  USING (driver_id = public.current_driver_id())
  WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY delivery_route_points_select_own
  ON public.delivery_route_points
  FOR SELECT
  TO authenticated
  USING (driver_id = public.current_driver_id());

CREATE POLICY delivery_route_points_insert_own
  ON public.delivery_route_points
  FOR INSERT
  TO authenticated
  WITH CHECK (
    driver_id = public.current_driver_id()
    AND EXISTS (
      SELECT 1
      FROM public.delivery_sessions s
      WHERE s.id = session_id
        AND s.driver_id = public.current_driver_id()
        AND s.status IN ('active', 'ending')
    )
  );

REVOKE ALL ON public.delivery_sessions FROM anon;
REVOKE ALL ON public.delivery_route_points FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.delivery_sessions TO authenticated;
GRANT SELECT, INSERT ON public.delivery_route_points TO authenticated;
GRANT ALL ON public.delivery_sessions TO service_role;
GRANT ALL ON public.delivery_route_points TO service_role;
