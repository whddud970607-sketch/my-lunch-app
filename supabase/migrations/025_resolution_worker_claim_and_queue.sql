-- 025_resolution_worker_claim_and_queue.sql
-- Purpose: Phase 2C.1 — worker claim lease, retry scheduling, queue index v2.
-- DRAFT ONLY — additive, non-destructive. Do NOT apply until staging approval.
--
-- Does NOT:
--   - alter legacy coordinates
--   - queue driver_verified points
--   - invoke providers
--   - change import/job/point/shipment rows
--
-- Rollback (manual, after review):
--   DROP FUNCTION IF EXISTS public.resolution_worker_list_eligible_drivers();
--   DROP FUNCTION IF EXISTS public.resolution_worker_claim_batch(text, int, jsonb);
--   DROP FUNCTION IF EXISTS public.resolution_worker_fetch_pii(uuid[]);
--   DROP FUNCTION IF EXISTS public.resolution_worker_execution_start(uuid, uuid, text, smallint);
--   DROP FUNCTION IF EXISTS public.resolution_worker_heartbeat(uuid, uuid, text, smallint, int, int);
--   DROP FUNCTION IF EXISTS public.resolution_worker_persist(uuid, uuid, text, smallint, text, text, text, double precision, double precision, text, text, text, text, boolean, int, text);
--   DROP FUNCTION IF EXISTS public.resolution_worker_release_claim(uuid, uuid, text);
--   DROP FUNCTION IF EXISTS public.resolution_worker_manual_requeue(uuid);
--   DROP FUNCTION IF EXISTS public.resolution_worker_get_point(uuid);
--   DROP INDEX IF EXISTS public.delivery_points_resolution_queue_driver_idx;
--   DROP INDEX IF EXISTS public.delivery_points_resolution_queue_v2_idx;
--   CREATE INDEX IF NOT EXISTS delivery_points_resolution_queue_idx
--     ON public.delivery_points (updated_at ASC, id ASC)
--     WHERE resolution_status IN ('pending', 'provider_error');
--   ALTER TABLE public.delivery_points DROP CONSTRAINT IF EXISTS delivery_points_claimed_by_bounded;
--   ALTER TABLE public.delivery_points DROP CONSTRAINT IF EXISTS delivery_points_claim_lease_coherence;
--   ALTER TABLE public.delivery_points DROP CONSTRAINT IF EXISTS delivery_points_attempt_count_nonnegative;
--   ALTER TABLE public.delivery_points DROP CONSTRAINT IF EXISTS delivery_points_retry_exhausted_semantics;
--   ALTER TABLE public.delivery_points DROP CONSTRAINT IF EXISTS delivery_points_resolution_failure_code_bounded;
--   ALTER TABLE public.delivery_points ADD CONSTRAINT delivery_points_resolution_failure_code_bounded ... (024 list);
--   ALTER TABLE public.delivery_points
--     DROP COLUMN IF EXISTS resolution_retry_exhausted,
--     DROP COLUMN IF EXISTS resolution_lease_heartbeat_count,
--     DROP COLUMN IF EXISTS resolution_attempt_count,
--     DROP COLUMN IF EXISTS resolution_next_attempt_at,
--     DROP COLUMN IF EXISTS resolution_lease_expires_at,
--     DROP COLUMN IF EXISTS resolution_claim_token,
--     DROP COLUMN IF EXISTS resolution_claimed_by,
--     DROP COLUMN IF EXISTS resolution_claimed_at;

-- ---------------------------------------------------------------------------
-- 1) Worker claim / lease / retry columns (additive)
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_points
  ADD COLUMN IF NOT EXISTS resolution_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_claimed_by text,
  ADD COLUMN IF NOT EXISTS resolution_claim_token uuid,
  ADD COLUMN IF NOT EXISTS resolution_lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolution_lease_heartbeat_count smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolution_retry_exhausted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.delivery_points.resolution_claimed_at IS
  'When the current worker lease was first acquired. Audit only — not the claim token.';

COMMENT ON COLUMN public.delivery_points.resolution_claimed_by IS
  'Opaque worker instance id (hostname:pid:uuid). NULL = unclaimed. Max 128 chars.';

ALTER TABLE public.delivery_points
  ADD CONSTRAINT delivery_points_claimed_by_bounded CHECK (
    resolution_claimed_by IS NULL
    OR length(resolution_claimed_by) <= 128
  );

COMMENT ON COLUMN public.delivery_points.resolution_claim_token IS
  'Opaque UUID issued at claim time. Required for heartbeat extension and persist.';

COMMENT ON COLUMN public.delivery_points.resolution_lease_expires_at IS
  'Authoritative lease expiry. Row reclaimable when lease_expires_at <= now().';

COMMENT ON COLUMN public.delivery_points.resolution_next_attempt_at IS
  'Earliest auto-retry time for provider_error. NULL = eligible immediately when unclaimed.';

COMMENT ON COLUMN public.delivery_points.resolution_attempt_count IS
  'Count of actual resolution executions started (not mere claims). Incremented at execution start only.';

COMMENT ON COLUMN public.delivery_points.resolution_lease_heartbeat_count IS
  'Bounded lease extensions for long-running resolutions. Worker-enforced cap; DB stores count only.';

COMMENT ON COLUMN public.delivery_points.resolution_retry_exhausted IS
  'When true, auto-retry is dormant until manual/operator requeue (version bump). '
  'Does NOT convert provider_error into unresolved.';

-- ---------------------------------------------------------------------------
-- 2) Backfill — driver_verified excluded from auto-retry queue
-- ---------------------------------------------------------------------------
UPDATE public.delivery_points
SET
  resolution_retry_exhausted = true,
  resolution_next_attempt_at = NULL
WHERE pin_accuracy = 'driver_verified';

-- ---------------------------------------------------------------------------
-- 3) Claim / retry integrity constraints
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_points
  ADD CONSTRAINT delivery_points_attempt_count_nonnegative CHECK (
    resolution_attempt_count >= 0
  );

ALTER TABLE public.delivery_points
  ADD CONSTRAINT delivery_points_claim_lease_coherence CHECK (
    (
      resolution_claimed_by IS NULL
      AND resolution_claim_token IS NULL
      AND resolution_claimed_at IS NULL
      AND resolution_lease_expires_at IS NULL
      AND resolution_lease_heartbeat_count = 0
    )
    OR (
      resolution_claimed_by IS NOT NULL
      AND resolution_claim_token IS NOT NULL
      AND resolution_claimed_at IS NOT NULL
      AND resolution_lease_expires_at IS NOT NULL
      AND resolution_lease_expires_at >= resolution_claimed_at
    )
  );

ALTER TABLE public.delivery_points
  ADD CONSTRAINT delivery_points_retry_exhausted_semantics CHECK (
    resolution_retry_exhausted = false
    OR resolution_status = 'provider_error'
    OR pin_accuracy = 'driver_verified'
  );

-- ---------------------------------------------------------------------------
-- 4) Expand bounded failure codes (worker infrastructure errors)
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_points
  DROP CONSTRAINT IF EXISTS delivery_points_resolution_failure_code_bounded;

ALTER TABLE public.delivery_points
  ADD CONSTRAINT delivery_points_resolution_failure_code_bounded CHECK (
    resolution_failure_code IS NULL
    OR resolution_failure_code IN (
      -- Track A / address resolution (024)
      'PARCEL_UNRESOLVED',
      'BUILDING_HUB_FETCH_FAILED',
      'REGISTER_IDENTITY_UNRESOLVED',
      'REGISTER_DONG_NOT_FOUND',
      'REGISTER_DONG_AMBIGUOUS',
      'REGISTER_COMPLEX_MISMATCH',
      'PNU_BUILD_FAILED',
      'VWORLD_FETCH_FAILED',
      'VWORLD_NO_MATCH',
      'VWORLD_AMBIGUOUS',
      'VWORLD_WRONG_PNU',
      'VWORLD_WRONG_DONG',
      'VWORLD_CONTRADICTORY_COMPLEX',
      'VWORLD_COMPLEX_EVIDENCE_UNKNOWN',
      'BUILDING_HUB_IDENTITY_NOT_VERIFIED',
      'GEOMETRY_MISSING',
      'GEOMETRY_INVALID',
      'BUILDING_CENTER_NOT_VERIFIED',
      'BUILDING_CHAIN_NOT_CONFIGURED',
      -- Provider / infrastructure (024 + 025)
      'PROVIDER_TIMEOUT',
      'PROVIDER_NOT_CONFIGURED',
      'PROVIDER_RATE_LIMITED',
      'PROVIDER_AUTH_FAILED',
      'PROVIDER_CONFIGURATION_ERROR',
      -- Gate / classification (024)
      'QUALITY_GATE_REJECTED',
      'NO_CANDIDATES'
    )
  );

COMMENT ON CONSTRAINT delivery_points_resolution_failure_code_bounded ON public.delivery_points IS
  'Sanitized machine codes only. MAX_RETRY_EXCEEDED is NOT stored here — use resolution_retry_exhausted. '
  'Original failure code preserved when auto-retry exhausts.';

-- ---------------------------------------------------------------------------
-- 5) Queue index v2 — static predicates only; lease expiry evaluated at runtime
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.delivery_points_resolution_queue_idx;

CREATE INDEX delivery_points_resolution_queue_v2_idx
  ON public.delivery_points (
    resolution_next_attempt_at ASC NULLS FIRST,
    updated_at ASC,
    id ASC
  )
  WHERE resolution_status IN ('pending', 'provider_error')
    AND pin_accuracy IS DISTINCT FROM 'driver_verified'
    AND location IS NULL
    AND resolution_retry_exhausted = false;

COMMENT ON INDEX public.delivery_points_resolution_queue_v2_idx IS
  'Worker queue v2. Runtime filters also require: '
  '(resolution_claimed_by IS NULL OR resolution_lease_expires_at <= now()) '
  'AND (resolution_next_attempt_at IS NULL OR resolution_next_attempt_at <= now()). '
  'Fairness ordering (driver_id rotation) applied by worker query layer.';

-- Secondary index for driver-fair claim stratification
CREATE INDEX IF NOT EXISTS delivery_points_resolution_queue_driver_idx
  ON public.delivery_points (driver_id, resolution_next_attempt_at ASC NULLS FIRST, updated_at ASC, id ASC)
  WHERE resolution_status IN ('pending', 'provider_error')
    AND pin_accuracy IS DISTINCT FROM 'driver_verified'
    AND location IS NULL
    AND resolution_retry_exhausted = false;

-- ---------------------------------------------------------------------------
-- 6) Worker RPCs — service_role only; DB now() is lease authority
-- ---------------------------------------------------------------------------
-- Privilege model:
--   SECURITY DEFINER + fixed search_path
--   REVOKE ALL FROM PUBLIC, anon, authenticated
--   GRANT EXECUTE TO service_role only
--   No client JWT/driver authority used as authorization truth
--   No PII/credentials in exception text or return payloads beyond minimal PII fetch RPC
--   Caller-supplied driver IDs are fairness filters only — they never broaden authority
--   Lease / next_attempt / resolved_at use PostgreSQL now(); no p_now / absolute app timestamps

CREATE OR REPLACE FUNCTION public.resolution_worker_caller_is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(auth.role(), '') = 'service_role';
$$;

CREATE OR REPLACE FUNCTION public.resolution_worker_list_eligible_drivers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_drivers jsonb;
BEGIN
  IF NOT public.resolution_worker_caller_is_service_role() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'driverIds', '[]'::jsonb);
  END IF;

  SELECT coalesce(jsonb_agg(driver_id ORDER BY driver_id), '[]'::jsonb)
  INTO v_drivers
  FROM (
    SELECT DISTINCT dp.driver_id
    FROM public.delivery_points dp
    WHERE dp.resolution_status IN ('pending', 'provider_error')
      AND dp.location IS NULL
      AND dp.pin_accuracy IS DISTINCT FROM 'driver_verified'
      AND dp.resolution_retry_exhausted = false
      AND (dp.resolution_next_attempt_at IS NULL OR dp.resolution_next_attempt_at <= now())
      AND (
        dp.resolution_claimed_by IS NULL
        OR dp.resolution_lease_expires_at IS NULL
        OR dp.resolution_lease_expires_at <= now()
      )
  ) q;

  RETURN jsonb_build_object('ok', true, 'driverIds', v_drivers);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolution_worker_claim_batch(
  p_worker_id text,
  p_lease_ms int,
  p_plan jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_worker_id text;
  v_lease_ms int;
  v_plan_item jsonb;
  v_driver_id uuid;
  v_limit int;
  v_claims jsonb := '[]'::jsonb;
  v_batch jsonb;
  v_driver_text text;
  v_plan_count int := 0;
BEGIN
  IF NOT public.resolution_worker_caller_is_service_role() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'claims', '[]'::jsonb);
  END IF;

  v_worker_id := nullif(btrim(p_worker_id), '');
  IF v_worker_id IS NULL OR length(v_worker_id) > 128 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_worker_id', 'claims', '[]'::jsonb);
  END IF;

  v_lease_ms := p_lease_ms;
  IF v_lease_ms IS NULL OR v_lease_ms < 1000 OR v_lease_ms > 3600000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_lease_ms', 'claims', '[]'::jsonb);
  END IF;

  IF p_plan IS NULL OR jsonb_typeof(p_plan) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_plan', 'claims', '[]'::jsonb);
  END IF;

  FOR v_plan_item IN SELECT value FROM jsonb_array_elements(p_plan)
  LOOP
    v_plan_count := v_plan_count + 1;
    IF v_plan_count > 64 THEN
      EXIT;
    END IF;

    v_driver_text := coalesce(v_plan_item->>'driverId', v_plan_item->>'driver_id');
    IF v_driver_text IS NULL
       OR v_driver_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      CONTINUE;
    END IF;
    v_driver_id := v_driver_text::uuid;

    v_limit := coalesce((v_plan_item->>'limit')::int, 0);
    IF v_limit IS NULL OR v_limit < 1 THEN
      CONTINUE;
    END IF;
    IF v_limit > 32 THEN
      v_limit := 32;
    END IF;

    WITH locked AS MATERIALIZED (
      SELECT dp.id
      FROM public.delivery_points dp
      WHERE dp.driver_id = v_driver_id
        AND dp.resolution_status IN ('pending', 'provider_error')
        AND dp.location IS NULL
        AND dp.pin_accuracy IS DISTINCT FROM 'driver_verified'
        AND dp.resolution_retry_exhausted = false
        AND (dp.resolution_next_attempt_at IS NULL OR dp.resolution_next_attempt_at <= now())
        AND (
          dp.resolution_claimed_by IS NULL
          OR dp.resolution_lease_expires_at IS NULL
          OR dp.resolution_lease_expires_at <= now()
        )
      ORDER BY
        dp.resolution_next_attempt_at ASC NULLS FIRST,
        dp.updated_at ASC,
        dp.id ASC
      FOR UPDATE OF dp SKIP LOCKED
      LIMIT v_limit
    ),
    updated AS (
      UPDATE public.delivery_points dp
      SET
        resolution_claimed_at = now(),
        resolution_claimed_by = v_worker_id,
        resolution_claim_token = gen_random_uuid(),
        resolution_lease_expires_at = now() + (v_lease_ms * interval '1 millisecond'),
        resolution_lease_heartbeat_count = 0,
        updated_at = now()
      FROM locked
      WHERE dp.id = locked.id
      RETURNING
        dp.id,
        dp.driver_id,
        dp.resolution_claim_token,
        dp.resolution_claimed_by,
        dp.resolution_claimed_at,
        dp.resolution_lease_expires_at,
        dp.resolution_version,
        dp.resolution_attempt_count
    )
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'pointId', id,
          'driverId', driver_id,
          'claimToken', resolution_claim_token,
          'claimedBy', resolution_claimed_by,
          'claimedAt', resolution_claimed_at,
          'leaseExpiresAt', resolution_lease_expires_at,
          'resolutionVersion', resolution_version,
          'resolutionAttemptCount', resolution_attempt_count
        )
        ORDER BY id
      ),
      '[]'::jsonb
    )
    INTO v_batch
    FROM updated;

    v_claims := v_claims || coalesce(v_batch, '[]'::jsonb);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'claims', v_claims);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolution_worker_fetch_pii(
  p_point_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.resolution_worker_caller_is_service_role() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'rows', '[]'::jsonb);
  END IF;

  IF p_point_ids IS NULL OR cardinality(p_point_ids) IS NULL OR cardinality(p_point_ids) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'rows', '[]'::jsonb);
  END IF;

  IF cardinality(p_point_ids) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'too_many_ids', 'rows', '[]'::jsonb);
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'pointId', p.point_id,
        'rawAddress', p.raw_address,
        'detailAddress', p.detail_address,
        'normalizedAddress', p.normalized_address
      )
      ORDER BY p.point_id
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM public.delivery_point_pii p
  WHERE p.point_id = ANY (p_point_ids);

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolution_worker_execution_start(
  p_point_id uuid,
  p_claim_token uuid,
  p_claimed_by text,
  p_resolution_version smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_updated int;
BEGIN
  IF NOT public.resolution_worker_caller_is_service_role() THEN
    RETURN jsonb_build_object('ok', false, 'started', false, 'code', 'forbidden');
  END IF;

  IF p_point_id IS NULL
     OR p_claim_token IS NULL
     OR nullif(btrim(p_claimed_by), '') IS NULL
     OR length(btrim(p_claimed_by)) > 128
     OR p_resolution_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'started', false, 'code', 'validation_failure');
  END IF;

  UPDATE public.delivery_points dp
  SET
    resolution_attempt_count = dp.resolution_attempt_count + 1,
    updated_at = now()
  WHERE dp.id = p_point_id
    AND dp.resolution_claim_token = p_claim_token
    AND dp.resolution_claimed_by = btrim(p_claimed_by)
    AND dp.resolution_version = p_resolution_version
    AND dp.resolution_lease_expires_at IS NOT NULL
    AND dp.resolution_lease_expires_at > now()
    AND dp.resolution_status IN ('pending', 'provider_error')
    AND dp.location IS NULL
    AND dp.pin_accuracy IS DISTINCT FROM 'driver_verified'
    AND dp.resolution_retry_exhausted = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'started', v_updated = 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolution_worker_heartbeat(
  p_point_id uuid,
  p_claim_token uuid,
  p_claimed_by text,
  p_resolution_version smallint,
  p_lease_ms int,
  p_max_heartbeats int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_updated int;
  v_lease_ms int;
  v_max_hb int;
BEGIN
  v_lease_ms := p_lease_ms;
  v_max_hb := p_max_heartbeats;

  IF NOT public.resolution_worker_caller_is_service_role() THEN
    RETURN jsonb_build_object('ok', false, 'extended', false, 'code', 'forbidden');
  END IF;

  IF p_point_id IS NULL
     OR p_claim_token IS NULL
     OR nullif(btrim(p_claimed_by), '') IS NULL
     OR length(btrim(p_claimed_by)) > 128
     OR p_resolution_version IS NULL
     OR v_lease_ms IS NULL OR v_lease_ms < 1000 OR v_lease_ms > 3600000
     OR v_max_hb IS NULL OR v_max_hb < 0 OR v_max_hb > 20 THEN
    RETURN jsonb_build_object('ok', false, 'extended', false, 'code', 'validation_failure');
  END IF;

  UPDATE public.delivery_points dp
  SET
    resolution_lease_heartbeat_count = dp.resolution_lease_heartbeat_count + 1,
    resolution_lease_expires_at = now() + (v_lease_ms * interval '1 millisecond'),
    updated_at = now()
  WHERE dp.id = p_point_id
    AND dp.resolution_claim_token = p_claim_token
    AND dp.resolution_claimed_by = btrim(p_claimed_by)
    AND dp.resolution_version = p_resolution_version
    AND dp.resolution_lease_expires_at IS NOT NULL
    AND dp.resolution_lease_expires_at > now()
    AND dp.resolution_status IN ('pending', 'provider_error')
    AND dp.location IS NULL
    AND dp.pin_accuracy IS DISTINCT FROM 'driver_verified'
    AND dp.resolution_retry_exhausted = false
    AND dp.resolution_lease_heartbeat_count < v_max_hb;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'extended', v_updated = 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolution_worker_persist(
  p_point_id uuid,
  p_claim_token uuid,
  p_claimed_by text,
  p_resolution_version smallint,
  p_resolution_status text,
  p_resolution_stage text,
  p_pin_accuracy text,
  p_latitude double precision,
  p_longitude double precision,
  p_identity_provenance text,
  p_geometry_provenance text,
  p_complex_corroboration text,
  p_failure_code text,
  p_retry_exhausted boolean,
  p_retry_delay_ms int,
  p_normalized_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_updated int;
  v_status public.delivery_point_resolution_status;
  v_stage public.delivery_point_resolution_stage;
  v_pin public.pin_accuracy;
  v_location extensions.geography(Point, 4326) := NULL;
  v_next_attempt timestamptz := NULL;
  v_resolved_at timestamptz := NULL;
  v_delay_ms int;
BEGIN
  IF NOT public.resolution_worker_caller_is_service_role() THEN
    RETURN jsonb_build_object('ok', false, 'persisted', false, 'code', 'forbidden');
  END IF;

  IF p_point_id IS NULL
     OR p_claim_token IS NULL
     OR nullif(btrim(p_claimed_by), '') IS NULL
     OR length(btrim(p_claimed_by)) > 128
     OR p_resolution_version IS NULL
     OR p_resolution_status IS NULL
     OR p_resolution_stage IS NULL
     OR p_pin_accuracy IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'persisted', false, 'code', 'validation_failure');
  END IF;

  BEGIN
    v_status := p_resolution_status::public.delivery_point_resolution_status;
    v_stage := p_resolution_stage::public.delivery_point_resolution_stage;
    v_pin := p_pin_accuracy::public.pin_accuracy;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'persisted', false, 'code', 'invalid_enum');
  END;

  IF v_pin = 'driver_verified' THEN
    RETURN jsonb_build_object('ok', false, 'persisted', false, 'code', 'invalid_pin_accuracy');
  END IF;

  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    IF p_latitude < -90 OR p_latitude > 90 OR p_longitude < -180 OR p_longitude > 180 THEN
      RETURN jsonb_build_object('ok', false, 'persisted', false, 'code', 'invalid_coordinates');
    END IF;
    v_location := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::extensions.geography;
  END IF;

  IF v_status = 'provider_error' AND coalesce(p_retry_exhausted, false) = false THEN
    v_delay_ms := coalesce(p_retry_delay_ms, 30000);
    IF v_delay_ms < 0 THEN
      v_delay_ms := 0;
    END IF;
    IF v_delay_ms > 3600000 THEN
      v_delay_ms := 3600000;
    END IF;
    v_next_attempt := now() + (v_delay_ms * interval '1 millisecond');
  ELSE
    v_next_attempt := NULL;
  END IF;

  IF v_status IN ('resolved', 'lower_quality') THEN
    v_resolved_at := now();
  END IF;

  BEGIN
    UPDATE public.delivery_points dp
    SET
      resolution_status = v_status,
      resolution_stage = v_stage,
      pin_accuracy = v_pin,
      location = CASE
        WHEN v_status IN ('resolved', 'lower_quality') THEN v_location
        ELSE NULL
      END,
      identity_provenance = p_identity_provenance,
      geometry_provenance = p_geometry_provenance,
      complex_corroboration = p_complex_corroboration,
      resolved_at = v_resolved_at,
      resolution_failure_code = p_failure_code,
      resolution_next_attempt_at = v_next_attempt,
      resolution_retry_exhausted = coalesce(p_retry_exhausted, false),
      resolution_claimed_at = NULL,
      resolution_claimed_by = NULL,
      resolution_claim_token = NULL,
      resolution_lease_expires_at = NULL,
      resolution_lease_heartbeat_count = 0,
      updated_at = now()
    WHERE dp.id = p_point_id
      AND dp.resolution_claim_token = p_claim_token
      AND dp.resolution_claimed_by = btrim(p_claimed_by)
      AND dp.resolution_version = p_resolution_version
      AND dp.resolution_lease_expires_at IS NOT NULL
      AND dp.resolution_lease_expires_at > now()
      AND dp.location IS NULL
      AND dp.pin_accuracy IS DISTINCT FROM 'driver_verified'
      AND dp.resolution_status IN ('pending', 'provider_error')
      AND dp.resolution_retry_exhausted = false;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 1 AND p_normalized_address IS NOT NULL THEN
      UPDATE public.delivery_point_pii pii
      SET
        normalized_address = p_normalized_address,
        updated_at = now()
      WHERE pii.point_id = p_point_id;
    END IF;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'persisted', false, 'code', 'persist_rejected');
  END;

  RETURN jsonb_build_object('ok', true, 'persisted', v_updated = 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolution_worker_release_claim(
  p_point_id uuid,
  p_claim_token uuid,
  p_claimed_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_updated int;
BEGIN
  IF NOT public.resolution_worker_caller_is_service_role() THEN
    RETURN jsonb_build_object('ok', false, 'released', false, 'code', 'forbidden');
  END IF;

  IF p_point_id IS NULL OR p_claim_token IS NULL OR nullif(btrim(p_claimed_by), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'released', false, 'code', 'validation_failure');
  END IF;

  UPDATE public.delivery_points dp
  SET
    resolution_claimed_at = NULL,
    resolution_claimed_by = NULL,
    resolution_claim_token = NULL,
    resolution_lease_expires_at = NULL,
    resolution_lease_heartbeat_count = 0,
    updated_at = now()
  WHERE dp.id = p_point_id
    AND dp.resolution_claim_token = p_claim_token
    AND dp.resolution_claimed_by = btrim(p_claimed_by);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'released', v_updated = 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolution_worker_manual_requeue(
  p_point_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_updated int;
BEGIN
  IF NOT public.resolution_worker_caller_is_service_role() THEN
    RETURN jsonb_build_object('ok', false, 'requeued', false, 'code', 'forbidden');
  END IF;

  IF p_point_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'requeued', false, 'code', 'validation_failure');
  END IF;

  UPDATE public.delivery_points dp
  SET
    resolution_version = dp.resolution_version + 1,
    resolution_status = 'pending',
    resolution_stage = 'pending',
    resolution_attempt_count = 0,
    resolution_retry_exhausted = false,
    resolution_next_attempt_at = now(),
    resolution_failure_code = NULL,
    resolution_claimed_at = NULL,
    resolution_claimed_by = NULL,
    resolution_claim_token = NULL,
    resolution_lease_expires_at = NULL,
    resolution_lease_heartbeat_count = 0,
    updated_at = now()
  WHERE dp.id = p_point_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'requeued', v_updated = 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolution_worker_get_point(
  p_point_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_point jsonb;
BEGIN
  IF NOT public.resolution_worker_caller_is_service_role() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'point', NULL);
  END IF;

  IF p_point_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'validation_failure', 'point', NULL);
  END IF;

  SELECT jsonb_build_object(
    'id', dp.id,
    'driverId', dp.driver_id,
    'resolutionStatus', dp.resolution_status,
    'resolutionVersion', dp.resolution_version,
    'resolutionAttemptCount', dp.resolution_attempt_count,
    'pinAccuracy', dp.pin_accuracy,
    'resolutionNextAttemptAt', dp.resolution_next_attempt_at,
    'resolutionRetryExhausted', dp.resolution_retry_exhausted,
    'latitude', CASE WHEN dp.location IS NULL THEN NULL ELSE ST_Y(dp.location::geometry) END,
    'longitude', CASE WHEN dp.location IS NULL THEN NULL ELSE ST_X(dp.location::geometry) END,
    'resolutionClaimedBy', dp.resolution_claimed_by,
    'resolutionClaimToken', dp.resolution_claim_token,
    'resolutionLeaseExpiresAt', dp.resolution_lease_expires_at
  )
  INTO v_point
  FROM public.delivery_points dp
  WHERE dp.id = p_point_id;

  RETURN jsonb_build_object('ok', true, 'point', v_point);
END;
$$;

REVOKE ALL ON FUNCTION public.resolution_worker_caller_is_service_role()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolution_worker_list_eligible_drivers()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolution_worker_claim_batch(text, int, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolution_worker_fetch_pii(uuid[])
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolution_worker_execution_start(uuid, uuid, text, smallint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolution_worker_heartbeat(uuid, uuid, text, smallint, int, int)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolution_worker_persist(
  uuid, uuid, text, smallint, text, text, text, double precision, double precision,
  text, text, text, text, boolean, int, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolution_worker_release_claim(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolution_worker_manual_requeue(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolution_worker_get_point(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolution_worker_list_eligible_drivers()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolution_worker_claim_batch(text, int, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolution_worker_fetch_pii(uuid[])
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolution_worker_execution_start(uuid, uuid, text, smallint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolution_worker_heartbeat(uuid, uuid, text, smallint, int, int)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolution_worker_persist(
  uuid, uuid, text, smallint, text, text, text, double precision, double precision,
  text, text, text, text, boolean, int, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolution_worker_release_claim(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolution_worker_manual_requeue(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolution_worker_get_point(uuid)
  TO service_role;

COMMENT ON FUNCTION public.resolution_worker_claim_batch(text, int, jsonb) IS
  'Atomic driver-stratified claim using FOR UPDATE SKIP LOCKED. Lease expiry set from DB now(). service_role only.';

COMMENT ON FUNCTION public.resolution_worker_persist(
  uuid, uuid, text, smallint, text, text, text, double precision, double precision,
  text, text, text, text, boolean, int, text
) IS
  'Atomic persist with DB-time lease validation. resolved_at and next_attempt_at derived from DB now(). '
  'normalized_address update participates in same transaction when provided. service_role only.';
