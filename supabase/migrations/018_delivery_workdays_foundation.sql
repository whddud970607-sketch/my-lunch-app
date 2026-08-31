-- 018_delivery_workdays_foundation.sql
-- Purpose: P0-B2-1 Workday durable lifecycle + membership (additive).
-- Does NOT alter delivery_sessions.delivery_job_id NOT NULL.
-- Does NOT change route ownership.
-- company_id intentionally omitted (multi-company workday).

CREATE TYPE public.delivery_workday_status AS ENUM (
  'active',
  'ending',
  'completed',
  'abandoned'
);

CREATE TYPE public.delivery_workday_membership_source AS ENUM (
  'start_snapshot',
  'midday_attach',
  'reconcile'
);

CREATE TABLE public.delivery_workdays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  service_date date NOT NULL,
  status public.delivery_workday_status NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  start_idempotency_key text NOT NULL,
  end_idempotency_key text,
  -- Non-sensitive historical cache only — never PII/secrets/route samples.
  summary_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_workdays_ended_requires_time CHECK (
    status NOT IN ('ending', 'completed') OR ended_at IS NOT NULL
  ),
  CONSTRAINT delivery_workdays_start_idempotency_unique
    UNIQUE (driver_id, start_idempotency_key),
  CONSTRAINT delivery_workdays_start_key_nonempty CHECK (
    length(btrim(start_idempotency_key)) > 0
  )
);

COMMENT ON TABLE public.delivery_workdays IS
  'Driver-owned durable workday lifecycle. Not TodayWorkset. No company_id.';

COMMENT ON COLUMN public.delivery_workdays.service_date IS
  'Asia/Seoul calendar date of started_at (server-authoritative). Not copied from jobs.';

COMMENT ON COLUMN public.delivery_workdays.summary_snapshot IS
  'Non-sensitive counts only. Not authorization truth. No PII/secrets/tracking/route.';

CREATE INDEX delivery_workdays_driver_id_idx
  ON public.delivery_workdays (driver_id);

CREATE INDEX delivery_workdays_status_idx
  ON public.delivery_workdays (status);

CREATE INDEX delivery_workdays_service_date_idx
  ON public.delivery_workdays (service_date);

CREATE INDEX delivery_workdays_started_at_idx
  ON public.delivery_workdays (started_at);

-- One open workday per driver
CREATE UNIQUE INDEX delivery_workdays_one_open_per_driver_idx
  ON public.delivery_workdays (driver_id)
  WHERE status IN ('active', 'ending');

-- Intentionally NO UNIQUE(driver_id, service_date): same-day restart after completed is allowed.

CREATE TRIGGER trg_delivery_workdays_updated_at
  BEFORE UPDATE ON public.delivery_workdays
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.delivery_workday_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workday_id uuid NOT NULL REFERENCES public.delivery_workdays (id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES public.delivery_jobs (id) ON DELETE RESTRICT,
  attached_at timestamptz NOT NULL DEFAULT now(),
  detached_at timestamptz,
  membership_source public.delivery_workday_membership_source NOT NULL
    DEFAULT 'start_snapshot',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_workday_jobs_unique_membership UNIQUE (workday_id, job_id),
  CONSTRAINT delivery_workday_jobs_detach_order CHECK (
    detached_at IS NULL OR detached_at >= attached_at
  )
);

COMMENT ON TABLE public.delivery_workday_jobs IS
  'Durable Workday↔Job membership. One row per (workday, job). Detach sets detached_at; never DELETE for history.';

CREATE INDEX delivery_workday_jobs_workday_id_idx
  ON public.delivery_workday_jobs (workday_id);

CREATE INDEX delivery_workday_jobs_job_id_idx
  ON public.delivery_workday_jobs (job_id);

CREATE INDEX delivery_workday_jobs_active_membership_idx
  ON public.delivery_workday_jobs (workday_id)
  WHERE detached_at IS NULL;

CREATE TRIGGER trg_delivery_workday_jobs_updated_at
  BEFORE UPDATE ON public.delivery_workday_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Atomic start: workday + membership snapshot in one transaction
-- Identity from current_driver_id() only. Client jobIds ignored.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_delivery_workday_atomic(
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_driver_id uuid;
  v_existing public.delivery_workdays%ROWTYPE;
  v_open public.delivery_workdays%ROWTYPE;
  v_workday public.delivery_workdays%ROWTYPE;
  v_service_date date;
  v_job_ids uuid[];
  v_job_id uuid;
  v_membership jsonb := '[]'::jsonb;
BEGIN
  v_driver_id := public.current_driver_id();
  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'unauthorized',
      'message', 'driver identity required'
    );
  END IF;

  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'validation_failure',
      'message', 'start_idempotency_key required'
    );
  END IF;

  -- Idempotent replay
  SELECT * INTO v_existing
  FROM public.delivery_workdays
  WHERE driver_id = v_driver_id
    AND start_idempotency_key = btrim(p_idempotency_key);
  IF FOUND THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'jobId', wj.job_id,
      'attachedAt', wj.attached_at,
      'detachedAt', wj.detached_at,
      'membershipSource', wj.membership_source
    ) ORDER BY wj.attached_at), '[]'::jsonb)
    INTO v_membership
    FROM public.delivery_workday_jobs wj
    WHERE wj.workday_id = v_existing.id;

    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'workdayId', v_existing.id,
      'driverId', v_existing.driver_id,
      'serviceDate', v_existing.service_date,
      'status', v_existing.status,
      'startedAt', v_existing.started_at,
      'endedAt', v_existing.ended_at,
      'membership', v_membership
    );
  END IF;

  SELECT * INTO v_open
  FROM public.delivery_workdays
  WHERE driver_id = v_driver_id
    AND status IN ('active', 'ending')
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'open_workday_exists',
      'message', 'An open workday already exists',
      'existingWorkdayId', v_open.id,
      'status', v_open.status
    );
  END IF;

  -- Eligible jobs: currently assigned + active (server re-query; not Today response).
  SELECT COALESCE(array_agg(j.id ORDER BY j.created_at), ARRAY[]::uuid[])
  INTO v_job_ids
  FROM public.delivery_jobs j
  WHERE j.driver_id = v_driver_id
    AND j.status = 'active';

  IF v_job_ids IS NULL OR cardinality(v_job_ids) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'no_eligible_jobs',
      'message', 'No eligible jobs to start a workday'
    );
  END IF;

  v_service_date := (timezone('Asia/Seoul', now()))::date;

  INSERT INTO public.delivery_workdays (
    driver_id,
    service_date,
    status,
    started_at,
    start_idempotency_key
  ) VALUES (
    v_driver_id,
    v_service_date,
    'active',
    now(),
    btrim(p_idempotency_key)
  )
  RETURNING * INTO v_workday;

  FOREACH v_job_id IN ARRAY v_job_ids LOOP
    INSERT INTO public.delivery_workday_jobs (
      workday_id,
      job_id,
      attached_at,
      membership_source
    ) VALUES (
      v_workday.id,
      v_job_id,
      now(),
      'start_snapshot'
    );
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'jobId', wj.job_id,
    'attachedAt', wj.attached_at,
    'detachedAt', wj.detached_at,
    'membershipSource', wj.membership_source
  ) ORDER BY wj.attached_at), '[]'::jsonb)
  INTO v_membership
  FROM public.delivery_workday_jobs wj
  WHERE wj.workday_id = v_workday.id;

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'workdayId', v_workday.id,
    'driverId', v_workday.driver_id,
    'serviceDate', v_workday.service_date,
    'status', v_workday.status,
    'startedAt', v_workday.started_at,
    'endedAt', v_workday.ended_at,
    'membership', v_membership
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Race on open-per-driver or idempotency: re-read idempotent row or open.
    SELECT * INTO v_existing
    FROM public.delivery_workdays
    WHERE driver_id = v_driver_id
      AND start_idempotency_key = btrim(p_idempotency_key);
    IF FOUND THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'jobId', wj.job_id,
        'attachedAt', wj.attached_at,
        'detachedAt', wj.detached_at,
        'membershipSource', wj.membership_source
      ) ORDER BY wj.attached_at), '[]'::jsonb)
      INTO v_membership
      FROM public.delivery_workday_jobs wj
      WHERE wj.workday_id = v_existing.id;

      RETURN jsonb_build_object(
        'ok', true,
        'created', false,
        'workdayId', v_existing.id,
        'driverId', v_existing.driver_id,
        'serviceDate', v_existing.service_date,
        'status', v_existing.status,
        'startedAt', v_existing.started_at,
        'endedAt', v_existing.ended_at,
        'membership', v_membership
      );
    END IF;

    SELECT * INTO v_open
    FROM public.delivery_workdays
    WHERE driver_id = v_driver_id
      AND status IN ('active', 'ending')
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'open_workday_exists',
        'message', 'An open workday already exists',
        'existingWorkdayId', v_open.id,
        'status', v_open.status
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'conflict',
      'message', 'workday start conflict'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.start_delivery_workday_atomic(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_delivery_workday_atomic(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.start_delivery_workday_atomic(text) IS
  'Atomic Workday start + membership snapshot. Driver from current_driver_id() only.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_workdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_workdays FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_workday_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_workday_jobs FORCE ROW LEVEL SECURITY;

-- Driver own only. Company admin: no direct SELECT (mixed A+B leakage).
CREATE POLICY delivery_workdays_select_own
  ON public.delivery_workdays
  FOR SELECT
  TO authenticated
  USING (driver_id = public.current_driver_id());

CREATE POLICY delivery_workdays_insert_own
  ON public.delivery_workdays
  FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY delivery_workdays_update_own
  ON public.delivery_workdays
  FOR UPDATE
  TO authenticated
  USING (driver_id = public.current_driver_id())
  WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY delivery_workday_jobs_select_own
  ON public.delivery_workday_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.delivery_workdays w
      WHERE w.id = workday_id
        AND w.driver_id = public.current_driver_id()
    )
  );

CREATE POLICY delivery_workday_jobs_insert_own
  ON public.delivery_workday_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.delivery_workdays w
      WHERE w.id = workday_id
        AND w.driver_id = public.current_driver_id()
        AND w.status IN ('active', 'ending')
    )
  );

CREATE POLICY delivery_workday_jobs_update_own
  ON public.delivery_workday_jobs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.delivery_workdays w
      WHERE w.id = workday_id
        AND w.driver_id = public.current_driver_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.delivery_workdays w
      WHERE w.id = workday_id
        AND w.driver_id = public.current_driver_id()
    )
  );

-- No DELETE policies for authenticated (history preserved).

REVOKE ALL ON public.delivery_workdays FROM anon;
REVOKE ALL ON public.delivery_workday_jobs FROM anon;
REVOKE ALL ON public.delivery_workdays FROM authenticated;
REVOKE ALL ON public.delivery_workday_jobs FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.delivery_workdays TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.delivery_workday_jobs TO authenticated;
-- Explicitly no DELETE for authenticated (history preserved)
GRANT ALL ON public.delivery_workdays TO service_role;
GRANT ALL ON public.delivery_workday_jobs TO service_role;
