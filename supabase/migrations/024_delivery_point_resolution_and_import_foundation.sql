-- 024_delivery_point_resolution_and_import_foundation.sql
-- Purpose: Phase 2A — resolution metadata on delivery_points + import batch/row idempotency.
-- DRAFT ONLY — additive, non-destructive, no provider calls, no automatic re-resolution.
--
-- Rollback (manual, after review):
--   DROP POLICY IF EXISTS import_rows_select_scoped ON public.import_rows;
--   DROP POLICY IF EXISTS import_batches_select_scoped ON public.import_batches;
--   DROP TABLE IF EXISTS public.import_rows;
--   DROP TABLE IF EXISTS public.import_batches;
--   DROP TYPE IF EXISTS public.import_batch_status;
--   DROP TYPE IF EXISTS public.import_source_format;
--   DROP INDEX IF EXISTS public.delivery_points_resolution_queue_idx;
--   DROP INDEX IF EXISTS public.delivery_points_resolution_status_idx;
--   ALTER TABLE public.delivery_points DROP CONSTRAINT IF EXISTS delivery_points_no_resolved_at_while_retryable;
--   ALTER TABLE public.delivery_points DROP CONSTRAINT IF EXISTS delivery_points_resolution_version_positive;
--   ALTER TABLE public.delivery_points DROP CONSTRAINT IF EXISTS delivery_points_resolution_failure_code_bounded;
--   ALTER TABLE public.delivery_points DROP CONSTRAINT IF EXISTS delivery_points_building_center_requires_resolved;
--   ALTER TABLE public.delivery_points DROP CONSTRAINT IF EXISTS delivery_points_building_pin_requires_center;
--   ALTER TABLE public.delivery_points DROP CONSTRAINT IF EXISTS delivery_points_resolved_at_semantics;
--   ALTER TABLE public.delivery_points DROP CONSTRAINT IF EXISTS delivery_points_complex_corroboration_bounded;
--   ALTER TABLE public.delivery_points DROP CONSTRAINT IF EXISTS delivery_points_geometry_provenance_bounded;
--   ALTER TABLE public.delivery_points DROP CONSTRAINT IF EXISTS delivery_points_identity_provenance_bounded;
--   ALTER TABLE public.delivery_points DROP COLUMN IF EXISTS resolution_failure_code;
--   ALTER TABLE public.delivery_points DROP COLUMN IF EXISTS resolution_version;
--   ALTER TABLE public.delivery_points DROP COLUMN IF EXISTS resolved_at;
--   ALTER TABLE public.delivery_points DROP COLUMN IF EXISTS complex_corroboration;
--   ALTER TABLE public.delivery_points DROP COLUMN IF EXISTS geometry_provenance;
--   ALTER TABLE public.delivery_points DROP COLUMN IF EXISTS identity_provenance;
--   ALTER TABLE public.delivery_points DROP COLUMN IF EXISTS resolution_stage;
--   ALTER TABLE public.delivery_points DROP COLUMN IF EXISTS resolution_status;
--   DROP TYPE IF EXISTS public.delivery_point_resolution_stage;
--   DROP TYPE IF EXISTS public.delivery_point_resolution_status;

-- ---------------------------------------------------------------------------
-- 1) Resolution enums (bounded — no free-text quality enum)
-- ---------------------------------------------------------------------------
CREATE TYPE public.delivery_point_resolution_status AS ENUM (
  'pending',
  'resolved',
  'lower_quality',
  'unresolved',
  'ambiguous',
  'provider_error'
);

CREATE TYPE public.delivery_point_resolution_stage AS ENUM (
  'pending',
  'address_normalized',
  'parcel_resolved',
  'identity_verified',
  'geometry_verified',
  'building_center',
  'failed'
);

COMMENT ON TYPE public.delivery_point_resolution_status IS
  'Operational resolution lifecycle. Not a substitute for pin_accuracy. '
  'Never infer BUILDING_CENTER from legacy location alone.';

COMMENT ON TYPE public.delivery_point_resolution_stage IS
  'Last verified or attempted resolution gate. building_center requires Track A evidence.';

-- ---------------------------------------------------------------------------
-- 2) delivery_points — additive resolution metadata
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_points
  ADD COLUMN IF NOT EXISTS resolution_status public.delivery_point_resolution_status
    NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS resolution_stage public.delivery_point_resolution_stage
    NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS identity_provenance text,
  ADD COLUMN IF NOT EXISTS geometry_provenance text,
  ADD COLUMN IF NOT EXISTS complex_corroboration text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS resolution_failure_code text;

COMMENT ON COLUMN public.delivery_points.resolution_status IS
  'Async resolution lifecycle. Import commit sets pending; worker updates.';

COMMENT ON COLUMN public.delivery_points.resolution_stage IS
  'Last resolution gate reached. Legacy backfill uses address_normalized only — never building_center.';

COMMENT ON COLUMN public.delivery_points.identity_provenance IS
  'Bounded identity authority code only. Never raw BuildingHUB payload.';

COMMENT ON COLUMN public.delivery_points.geometry_provenance IS
  'Bounded geometry authority code only. Never raw VWorld/Kakao/NAVER payload.';

COMMENT ON COLUMN public.delivery_points.complex_corroboration IS
  'MODEL B VWorld complex evidence class. Diagnostic metadata — not client-facing.';

COMMENT ON COLUMN public.delivery_points.resolved_at IS
  'When a usable successful resolution was persisted. NULL for pending/provider_error/ambiguous/unresolved.';

COMMENT ON COLUMN public.delivery_points.resolution_version IS
  'Resolution algorithm version for batch re-resolution campaigns.';

COMMENT ON COLUMN public.delivery_points.resolution_failure_code IS
  'Sanitized machine failure code only. Never provider raw text, URLs, credentials, or PII.';

-- ---------------------------------------------------------------------------
-- 3) Conservative backfill — MUST run before CHECK constraints below
-- ---------------------------------------------------------------------------

-- 3a) No location → pending; demote legacy building pin without coords
UPDATE public.delivery_points
SET
  resolution_status = 'pending',
  resolution_stage = 'pending',
  identity_provenance = NULL,
  geometry_provenance = NULL,
  complex_corroboration = NULL,
  resolved_at = NULL,
  resolution_failure_code = NULL,
  pin_accuracy = CASE
    WHEN pin_accuracy = 'building' THEN 'address'::public.pin_accuracy
    ELSE pin_accuracy
  END
WHERE location IS NULL;

-- 3b) driver_verified — preserve pin_accuracy and driver semantics; no Track A promotion
UPDATE public.delivery_points
SET
  resolution_status = 'resolved',
  resolution_stage = 'address_normalized',
  identity_provenance = NULL,
  geometry_provenance = NULL,
  complex_corroboration = NULL,
  resolved_at = NULL,
  resolution_failure_code = NULL
WHERE location IS NOT NULL
  AND pin_accuracy = 'driver_verified';

-- 3c) Legacy geocoded location without verified Track A — lower_quality; demote building → address
UPDATE public.delivery_points
SET
  resolution_status = 'lower_quality',
  resolution_stage = 'address_normalized',
  identity_provenance = NULL,
  geometry_provenance = NULL,
  complex_corroboration = NULL,
  resolved_at = NULL,
  resolution_failure_code = NULL,
  pin_accuracy = CASE
    WHEN pin_accuracy = 'building' THEN 'address'::public.pin_accuracy
    ELSE pin_accuracy
  END
WHERE location IS NOT NULL
  AND pin_accuracy IS DISTINCT FROM 'driver_verified';

-- ---------------------------------------------------------------------------
-- 4) delivery_points — bounded CHECK constraints (after backfill)
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_points
  ADD CONSTRAINT delivery_points_identity_provenance_bounded CHECK (
    identity_provenance IS NULL
    OR identity_provenance = 'BUILDING_HUB_VERIFIED'
  );

ALTER TABLE public.delivery_points
  ADD CONSTRAINT delivery_points_geometry_provenance_bounded CHECK (
    geometry_provenance IS NULL
    OR geometry_provenance IN (
      'VWORLD_EXACT_PNU_DONG_FEATURE',
      'KAKAO_GEOCODE',
      'NAVER_GEOCODE'
    )
  );

ALTER TABLE public.delivery_points
  ADD CONSTRAINT delivery_points_complex_corroboration_bounded CHECK (
    complex_corroboration IS NULL
    OR complex_corroboration IN (
      'MATCHING',
      'MISSING',
      'CONTRADICTORY',
      'UNKNOWN'
    )
  );

-- resolved_at: successful terminal states only (not retryable failures)
ALTER TABLE public.delivery_points
  ADD CONSTRAINT delivery_points_resolved_at_semantics CHECK (
    resolved_at IS NULL
    OR resolution_status IN ('resolved', 'lower_quality')
  );

-- pin_accuracy = building ONLY with verified BUILDING_CENTER Track A evidence
ALTER TABLE public.delivery_points
  ADD CONSTRAINT delivery_points_building_pin_requires_center CHECK (
    pin_accuracy <> 'building'
    OR (
      resolution_status = 'resolved'
      AND resolution_stage = 'building_center'
      AND identity_provenance = 'BUILDING_HUB_VERIFIED'
      AND geometry_provenance = 'VWORLD_EXACT_PNU_DONG_FEATURE'
    )
  );

-- Stage/status coherence (no building_center without resolved)
ALTER TABLE public.delivery_points
  ADD CONSTRAINT delivery_points_building_center_requires_resolved CHECK (
    resolution_stage <> 'building_center'
    OR resolution_status = 'resolved'
  );

-- Bounded sanitized failure codes (application enum — no raw provider text)
ALTER TABLE public.delivery_points
  ADD CONSTRAINT delivery_points_resolution_failure_code_bounded CHECK (
    resolution_failure_code IS NULL
    OR resolution_failure_code IN (
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
      'PROVIDER_TIMEOUT',
      'QUALITY_GATE_REJECTED',
      'NO_CANDIDATES',
      'PROVIDER_NOT_CONFIGURED'
    )
  );

ALTER TABLE public.delivery_points
  ADD CONSTRAINT delivery_points_resolution_version_positive CHECK (
    resolution_version >= 1
  );

-- Retryable failures must not carry resolved_at
ALTER TABLE public.delivery_points
  ADD CONSTRAINT delivery_points_no_resolved_at_while_retryable CHECK (
    NOT (
      resolution_status IN ('pending', 'provider_error', 'ambiguous', 'unresolved')
      AND resolved_at IS NOT NULL
    )
  );

-- Worker queue: pending + provider_error (ORDER BY updated_at ASC, id ASC)
CREATE INDEX IF NOT EXISTS delivery_points_resolution_queue_idx
  ON public.delivery_points (updated_at ASC, id ASC)
  WHERE resolution_status IN ('pending', 'provider_error');

CREATE INDEX IF NOT EXISTS delivery_points_resolution_status_idx
  ON public.delivery_points (resolution_status);

-- ---------------------------------------------------------------------------
-- 5) Import batch enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.import_source_format AS ENUM (
  'csv',
  'xlsx',
  'api',
  'manual'
);

CREATE TYPE public.import_batch_status AS ENUM (
  'uploaded',
  'parsed',
  'validated',
  'preview_ready',
  'committing',
  'committed',
  'failed',
  'cancelled'
);

COMMENT ON TYPE public.import_source_format IS
  'Import file/API shape. Aligns with apps/api import.types ImportSourceFormat.';

COMMENT ON TYPE public.import_batch_status IS
  'Import batch lifecycle. Commit idempotency keyed by (driver_id, commit_idempotency_key).';

-- ---------------------------------------------------------------------------
-- 6) import_batches — commit idempotency shell (no raw file, no PII)
-- ---------------------------------------------------------------------------
CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  company_id uuid REFERENCES public.companies (id) ON DELETE RESTRICT,
  source_id uuid REFERENCES public.delivery_sources (id) ON DELETE RESTRICT,
  format public.import_source_format NOT NULL,
  status public.import_batch_status NOT NULL DEFAULT 'uploaded',
  commit_idempotency_key text NOT NULL,
  row_count int NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  service_date date NOT NULL,
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_batches_commit_key_nonempty CHECK (
    length(btrim(commit_idempotency_key)) > 0
  ),
  CONSTRAINT import_batches_driver_commit_idempotency_unique
    UNIQUE (driver_id, commit_idempotency_key),
  CONSTRAINT import_batches_committed_requires_time CHECK (
    status <> 'committed' OR committed_at IS NOT NULL
  ),
  CONSTRAINT import_batches_committed_row_count CHECK (
    status <> 'committed' OR row_count > 0
  )
);

COMMENT ON TABLE public.import_batches IS
  'Durable import commit idempotency and lifecycle. No raw CSV, addresses, names, phones, or secrets.';

COMMENT ON COLUMN public.import_batches.commit_idempotency_key IS
  'Client-supplied commit key. UNIQUE per driver for safe replay.';

COMMENT ON COLUMN public.import_batches.row_count IS
  'Committed row count summary. Authoritative row mapping lives in import_rows.';

COMMENT ON COLUMN public.import_batches.service_date IS
  'Authoritative service date for jobs created by this batch. Part of idempotency context.';

CREATE INDEX import_batches_driver_id_idx
  ON public.import_batches (driver_id);

CREATE INDEX import_batches_company_id_idx
  ON public.import_batches (company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX import_batches_source_id_idx
  ON public.import_batches (source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX import_batches_status_idx
  ON public.import_batches (status);

CREATE TRIGGER trg_import_batches_updated_at
  BEFORE UPDATE ON public.import_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7) import_rows — row-level idempotency mapping (no raw row, no PII)
-- ---------------------------------------------------------------------------
CREATE TABLE public.import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches (id) ON DELETE RESTRICT,
  row_index int NOT NULL CHECK (row_index >= 0),
  point_id uuid NOT NULL REFERENCES public.delivery_points (id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES public.delivery_shipments (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_rows_batch_row_unique UNIQUE (batch_id, row_index)
);

COMMENT ON TABLE public.import_rows IS
  'Maps import batch row_index → committed point/shipment. Idempotency via UNIQUE(batch_id, row_index). '
  'No raw row, address, tracking, external id, PII, or fingerprint/hash.';

CREATE INDEX import_rows_batch_id_idx
  ON public.import_rows (batch_id);

CREATE INDEX import_rows_point_id_idx
  ON public.import_rows (point_id);

CREATE INDEX import_rows_shipment_id_idx
  ON public.import_rows (shipment_id);

-- ---------------------------------------------------------------------------
-- 8) RLS — FORCE on new tables; delivery_points policies unchanged
-- ---------------------------------------------------------------------------
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches FORCE ROW LEVEL SECURITY;

ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows FORCE ROW LEVEL SECURITY;

-- Driver owns batch; company admin read scoped to company_id; platform admin read.
-- No authenticated INSERT/UPDATE/DELETE — commit via service_role + app tenant checks.
CREATE POLICY import_batches_select_scoped
  ON public.import_batches
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR driver_id = public.current_driver_id()
    OR (
      company_id IS NOT NULL
      AND public.is_company_admin_of(company_id)
    )
  );

CREATE POLICY import_rows_select_scoped
  ON public.import_rows
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.import_batches b
      WHERE b.id = import_rows.batch_id
        AND (
          b.driver_id = public.current_driver_id()
          OR (
            b.company_id IS NOT NULL
            AND public.is_company_admin_of(b.company_id)
          )
        )
    )
  );

REVOKE ALL ON public.import_batches FROM PUBLIC, anon;
REVOKE ALL ON public.import_rows FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.import_batches FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.import_rows FROM authenticated;

GRANT SELECT ON public.import_batches TO authenticated;
GRANT SELECT ON public.import_rows TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
GRANT ALL ON public.import_rows TO service_role;

-- delivery_points: existing FORCE RLS + policies in 005/008 unchanged.
-- New columns inherit existing SELECT/UPDATE scope for authenticated drivers.

-- ---------------------------------------------------------------------------
-- 8b) delivery_sources SELECT for company drivers (import C2 read path)
-- ---------------------------------------------------------------------------
CREATE POLICY delivery_sources_select_company_driver
  ON public.delivery_sources
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.id = public.current_driver_id()
        AND d.company_id IS NOT DISTINCT FROM delivery_sources.company_id
    )
  );

-- ---------------------------------------------------------------------------
-- 9) commit_import_batch_atomic — durable import commit (no provider calls)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commit_import_batch_atomic(
  p_commit_idempotency_key text,
  p_source_id uuid,
  p_format public.import_source_format,
  p_service_date date,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_driver_id uuid;
  v_source public.delivery_sources%ROWTYPE;
  v_company_id uuid;
  v_batch public.import_batches%ROWTYPE;
  v_batch_id uuid;
  v_job_id uuid;
  v_row jsonb;
  v_row_index int;
  v_point_id uuid;
  v_shipment_id uuid;
  v_tracking text;
  v_external_id text;
  v_quantity int;
  v_display_label text;
  v_row_count int;
  v_sorted jsonb;
  i int;
BEGIN
  v_driver_id := public.current_driver_id();
  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'code', 'unauthorized'
    );
  END IF;

  IF p_commit_idempotency_key IS NULL OR length(btrim(p_commit_idempotency_key)) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'code', 'validation_failure'
    );
  END IF;

  IF p_source_id IS NULL OR p_service_date IS NULL OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'code', 'validation_failure'
    );
  END IF;

  v_row_count := jsonb_array_length(p_rows);
  IF v_row_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'code', 'validation_failure'
    );
  END IF;

  -- Source ownership / activity (defense in depth — Nest rechecks before RPC)
  SELECT * INTO v_source
  FROM public.delivery_sources
  WHERE id = p_source_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'code', 'source_not_found'
    );
  END IF;

  IF NOT v_source.is_active THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'code', 'source_not_allowed'
    );
  END IF;

  IF v_source.source_type IN ('fixture', 'unknown') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'code', 'source_not_allowed'
    );
  END IF;

  IF v_source.company_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.drivers d
      WHERE d.id = v_driver_id
        AND d.company_id IS NOT DISTINCT FROM v_source.company_id
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'resultCode', 'rejected',
        'code', 'source_not_allowed'
      );
    END IF;
  END IF;

  IF v_source.owner_driver_id IS NOT NULL AND v_source.owner_driver_id IS DISTINCT FROM v_driver_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'code', 'personal_source_owner_mismatch'
    );
  END IF;

  IF v_source.source_type = 'driver_manual' AND v_source.owner_driver_id IS DISTINCT FROM v_driver_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'code', 'personal_source_owner_mismatch'
    );
  END IF;

  IF p_format = 'csv' AND v_source.source_type <> 'csv_import' THEN
    RETURN jsonb_build_object('ok', false, 'resultCode', 'rejected', 'code', 'source_type_not_importable');
  ELSIF p_format = 'xlsx' AND v_source.source_type <> 'excel_import' THEN
    RETURN jsonb_build_object('ok', false, 'resultCode', 'rejected', 'code', 'source_type_not_importable');
  ELSIF p_format = 'manual' AND v_source.source_type <> 'driver_manual' THEN
    RETURN jsonb_build_object('ok', false, 'resultCode', 'rejected', 'code', 'source_type_not_importable');
  ELSIF p_format = 'api' AND v_source.source_type NOT IN ('company_api', 'partner') THEN
    RETURN jsonb_build_object('ok', false, 'resultCode', 'rejected', 'code', 'source_type_not_importable');
  END IF;

  v_company_id := v_source.company_id;

  -- Idempotent replay / in-flight detection
  SELECT * INTO v_batch
  FROM public.import_batches
  WHERE driver_id = v_driver_id
    AND commit_idempotency_key = btrim(p_commit_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_batch.status = 'committed' THEN
      IF v_batch.source_id IS DISTINCT FROM p_source_id
         OR v_batch.company_id IS DISTINCT FROM v_company_id
         OR v_batch.format IS DISTINCT FROM p_format
         OR v_batch.service_date IS DISTINCT FROM p_service_date
         OR v_batch.row_count IS DISTINCT FROM v_row_count THEN
        IF v_batch.row_count IS DISTINCT FROM v_row_count THEN
          RETURN jsonb_build_object(
            'ok', false,
            'resultCode', 'rejected',
            'code', 'idempotency_payload_mismatch'
          );
        END IF;
        RETURN jsonb_build_object(
          'ok', false,
          'resultCode', 'rejected',
          'code', 'idempotency_context_mismatch'
        );
      END IF;

      SELECT j.id INTO v_job_id
      FROM public.import_rows ir
      JOIN public.delivery_points dp ON dp.id = ir.point_id
      JOIN public.delivery_jobs j ON j.id = dp.job_id
      WHERE ir.batch_id = v_batch.id
      LIMIT 1;

      RETURN jsonb_build_object(
        'ok', true,
        'resultCode', 'duplicate',
        'batchId', v_batch.id,
        'rowCount', v_batch.row_count,
        'jobId', v_job_id
      );
    END IF;

    IF v_batch.status = 'committing' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'resultCode', 'rejected',
        'code', 'commit_in_progress'
      );
    END IF;
  END IF;

  IF NOT FOUND THEN
    INSERT INTO public.import_batches (
      driver_id,
      company_id,
      source_id,
      format,
      status,
      commit_idempotency_key,
      row_count,
      service_date
    ) VALUES (
      v_driver_id,
      v_company_id,
      p_source_id,
      p_format,
      'committing',
      btrim(p_commit_idempotency_key),
      0,
      p_service_date
    )
    RETURNING id INTO v_batch_id;
  ELSE
    v_batch_id := v_batch.id;
    UPDATE public.import_batches
    SET status = 'committing', updated_at = now()
    WHERE id = v_batch_id;
  END IF;

  INSERT INTO public.delivery_jobs (
    driver_id,
    company_id,
    source_id,
    service_date,
    status
  ) VALUES (
    v_driver_id,
    v_company_id,
    p_source_id,
    p_service_date,
    'active'
  )
  RETURNING id INTO v_job_id;

  -- Stable row order by rowIndex
  SELECT jsonb_agg(elem ORDER BY (elem->>'rowIndex')::int)
  INTO v_sorted
  FROM jsonb_array_elements(p_rows) AS elem;

  FOR i IN 0 .. jsonb_array_length(v_sorted) - 1 LOOP
    v_row := v_sorted->i;
    v_row_index := (v_row->>'rowIndex')::int;

    IF v_row_index IS NULL OR v_row_index < 0 THEN
      RAISE EXCEPTION 'invalid_row_index' USING ERRCODE = '23514';
    END IF;

    v_tracking := nullif(btrim(v_row->>'trackingCode'), '');
    IF v_tracking IS NULL THEN
      RAISE EXCEPTION 'IMPORT:validation_failure:%', v_row_index USING ERRCODE = '23514';
    END IF;

    v_external_id := nullif(btrim(v_row->>'externalId'), '');
    v_quantity := COALESCE((v_row->>'quantity')::int, 1);
    IF v_quantity < 0 THEN
      RAISE EXCEPTION 'IMPORT:validation_failure:%', v_row_index USING ERRCODE = '23514';
    END IF;

    v_display_label := COALESCE(nullif(btrim(v_row->>'displayLabel'), ''), '배송지');

    IF EXISTS (
      SELECT 1
      FROM public.delivery_shipments sh
      WHERE sh.source_id = p_source_id
        AND sh.tracking_code = v_tracking
    ) THEN
      RAISE EXCEPTION 'IMPORT:duplicate_shipment_identifier:%', v_row_index USING ERRCODE = '23505';
    END IF;

    IF v_external_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.delivery_shipments sh
      WHERE sh.source_id = p_source_id
        AND sh.external_id = v_external_id
    ) THEN
      RAISE EXCEPTION 'IMPORT:duplicate_shipment_identifier:%', v_row_index USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.delivery_points (
      job_id,
      driver_id,
      sequence_no,
      display_label,
      location,
      pin_accuracy,
      resolution_status,
      resolution_stage,
      resolution_version,
      quantity,
      status
    ) VALUES (
      v_job_id,
      v_driver_id,
      v_row_index,
      v_display_label,
      NULL,
      'address',
      'pending',
      'pending',
      1,
      v_quantity,
      'pending'
    )
    RETURNING id INTO v_point_id;

    INSERT INTO public.delivery_point_pii (
      point_id,
      job_id,
      driver_id,
      customer_name,
      raw_address,
      detail_address,
      delivery_memo
    ) VALUES (
      v_point_id,
      v_job_id,
      v_driver_id,
      nullif(btrim(v_row->>'customerName'), ''),
      nullif(btrim(v_row->>'rawAddress'), ''),
      nullif(btrim(v_row->>'detailAddress'), ''),
      nullif(btrim(v_row->>'deliveryMemo'), '')
    );

    INSERT INTO public.delivery_shipments (
      point_id,
      job_id,
      driver_id,
      sequence_no,
      tracking_code,
      external_id,
      source_id,
      status
    ) VALUES (
      v_point_id,
      v_job_id,
      v_driver_id,
      1,
      v_tracking,
      v_external_id,
      p_source_id,
      'pending'
    )
    RETURNING id INTO v_shipment_id;

    INSERT INTO public.import_rows (
      batch_id,
      row_index,
      point_id,
      shipment_id
    ) VALUES (
      v_batch_id,
      v_row_index,
      v_point_id,
      v_shipment_id
    );
  END LOOP;

  UPDATE public.import_batches
  SET
    status = 'committed',
    row_count = v_row_count,
    committed_at = now(),
    updated_at = now()
  WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'ok', true,
    'resultCode', 'applied',
    'batchId', v_batch_id,
    'rowCount', v_row_count,
    'jobId', v_job_id
  );

-- EXCEPTION handlers run in an implicit subtransaction: all statements above
-- the error are rolled back before returning a safe JSON rejection body.
-- Idempotent replay of an already-committed batch remains a normal success path.
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_batch
    FROM public.import_batches
    WHERE driver_id = v_driver_id
      AND commit_idempotency_key = btrim(p_commit_idempotency_key);

    IF FOUND AND v_batch.status = 'committed' THEN
      SELECT j.id INTO v_job_id
      FROM public.import_rows ir
      JOIN public.delivery_points dp ON dp.id = ir.point_id
      JOIN public.delivery_jobs j ON j.id = dp.job_id
      WHERE ir.batch_id = v_batch.id
      LIMIT 1;

      RETURN jsonb_build_object(
        'ok', true,
        'resultCode', 'duplicate',
        'batchId', v_batch.id,
        'rowCount', v_batch.row_count,
        'jobId', v_job_id
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'code', 'duplicate_shipment_identifier',
      'rowIndex', v_row_index
    );
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'IMPORT:duplicate_shipment_identifier:%' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'resultCode', 'rejected',
        'code', 'duplicate_shipment_identifier',
        'rowIndex', NULLIF(split_part(SQLERRM, ':', 3), '')::int
      );
    END IF;
    IF SQLERRM LIKE 'IMPORT:validation_failure:%' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'resultCode', 'rejected',
        'code', 'validation_failure',
        'rowIndex', NULLIF(split_part(SQLERRM, ':', 3), '')::int
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'code', 'commit_failed'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_import_batch_atomic(
  text, uuid, public.import_source_format, date, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.commit_import_batch_atomic(
  text, uuid, public.import_source_format, date, jsonb
) TO authenticated, service_role;

COMMENT ON FUNCTION public.commit_import_batch_atomic(
  text, uuid, public.import_source_format, date, jsonb
) IS
  'Atomic import commit. Driver from current_driver_id() only. No geocode/provider calls. '
  'Safe result body — no PII, tracking values, or giant id arrays.';
