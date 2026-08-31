-- 015_delivery_sources_and_today_foundation.sql
-- Purpose: P0-B1-1 Multi-company Workset DB foundation.
-- Additive only — no DROP of existing tables/constraints/data.
-- Does NOT remove delivery_shipments_tracking_code_unique (global UNIQUE remains).

-- ---------------------------------------------------------------------------
-- 1) Source types (ingest provenance — NOT scanner input method)
-- ---------------------------------------------------------------------------
CREATE TYPE public.delivery_source_type AS ENUM (
  'company_api',
  'excel_import',
  'csv_import',
  'driver_manual',
  'partner',
  'local_shop',
  'fixture',
  'unknown'
);

CREATE TABLE public.delivery_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies (id) ON DELETE RESTRICT,
  owner_driver_id uuid REFERENCES public.drivers (id) ON DELETE RESTRICT,
  source_type public.delivery_source_type NOT NULL,
  source_key text NOT NULL,
  display_name text NOT NULL,
  external_system text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Ownership invariants (no ambiguous NULL ownership):
  -- company: company_id NOT NULL, owner_driver_id NULL
  -- personal/manual: company_id NULL, owner_driver_id NOT NULL
  -- system/fixture/unknown: company_id NULL, owner_driver_id NULL, type in (fixture, unknown)
  CONSTRAINT delivery_sources_ownership_check CHECK (
    (
      company_id IS NOT NULL
      AND owner_driver_id IS NULL
      AND source_type NOT IN ('driver_manual', 'fixture')
    )
    OR (
      company_id IS NULL
      AND owner_driver_id IS NOT NULL
      AND source_type = 'driver_manual'
    )
    OR (
      company_id IS NULL
      AND owner_driver_id IS NULL
      AND source_type IN ('fixture', 'unknown')
    )
  ),
  CONSTRAINT delivery_sources_source_key_nonempty CHECK (length(btrim(source_key)) > 0)
);

CREATE TRIGGER trg_delivery_sources_updated_at
  BEFORE UPDATE ON public.delivery_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- Unique namespaces per ownership class
CREATE UNIQUE INDEX delivery_sources_company_key_uidx
  ON public.delivery_sources (company_id, source_key)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX delivery_sources_driver_key_uidx
  ON public.delivery_sources (owner_driver_id, source_key)
  WHERE owner_driver_id IS NOT NULL;

CREATE UNIQUE INDEX delivery_sources_system_key_uidx
  ON public.delivery_sources (source_type, source_key)
  WHERE company_id IS NULL AND owner_driver_id IS NULL;

CREATE INDEX delivery_sources_company_id_idx
  ON public.delivery_sources (company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX delivery_sources_owner_driver_id_idx
  ON public.delivery_sources (owner_driver_id)
  WHERE owner_driver_id IS NOT NULL;

COMMENT ON TABLE public.delivery_sources IS
  'Ingest provenance for delivery data. Not scanner input method. '
  'Ownership: company | owner_driver | system(fixture/unknown). '
  'Never grant blanket SELECT for NULL company_id.';

-- ---------------------------------------------------------------------------
-- 2) Job / shipment source + external_id (nullable additive)
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_jobs
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.delivery_sources (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS delivery_jobs_source_id_idx
  ON public.delivery_jobs (source_id)
  WHERE source_id IS NOT NULL;

-- Hot path for GET /delivery/today
CREATE INDEX IF NOT EXISTS delivery_jobs_driver_service_date_status_idx
  ON public.delivery_jobs (driver_id, service_date, status);

ALTER TABLE public.delivery_shipments
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.delivery_sources (id) ON DELETE SET NULL;

ALTER TABLE public.delivery_shipments
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE INDEX IF NOT EXISTS delivery_shipments_source_id_idx
  ON public.delivery_shipments (source_id)
  WHERE source_id IS NOT NULL;

-- Namespaced uniques (global tracking UNIQUE intentionally kept)
CREATE UNIQUE INDEX IF NOT EXISTS delivery_shipments_source_tracking_uidx
  ON public.delivery_shipments (source_id, tracking_code)
  WHERE source_id IS NOT NULL AND tracking_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_shipments_source_external_uidx
  ON public.delivery_shipments (source_id, external_id)
  WHERE source_id IS NOT NULL AND external_id IS NOT NULL;

COMMENT ON COLUMN public.delivery_jobs.source_id IS
  'Authoritative ingest source for this job. Shipments should match when set.';

COMMENT ON COLUMN public.delivery_shipments.source_id IS
  'Namespace for tracking/external_id. Must match job.source_id when both set.';

COMMENT ON COLUMN public.delivery_shipments.external_id IS
  'Source-local external identifier (order/package id). Namespaced by source_id.';

-- Job is authoritative root: shipment.source_id must match job.source_id when job has one.
CREATE OR REPLACE FUNCTION public.enforce_shipment_source_matches_job()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_source uuid;
BEGIN
  SELECT j.source_id INTO v_job_source
  FROM public.delivery_jobs j
  WHERE j.id = NEW.job_id;

  IF v_job_source IS NOT NULL THEN
    IF NEW.source_id IS NULL THEN
      NEW.source_id := v_job_source;
    ELSIF NEW.source_id IS DISTINCT FROM v_job_source THEN
      RAISE EXCEPTION 'shipment source_id must match job.source_id'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_shipments_source_match ON public.delivery_shipments;
CREATE TRIGGER trg_delivery_shipments_source_match
  BEFORE INSERT OR UPDATE OF job_id, source_id ON public.delivery_shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_shipment_source_matches_job();

REVOKE ALL ON FUNCTION public.enforce_shipment_source_matches_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_shipment_source_matches_job() TO service_role;

-- ---------------------------------------------------------------------------
-- 3) RLS — never "NULL company = visible to everyone"
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_sources FORCE ROW LEVEL SECURITY;

CREATE POLICY delivery_sources_select_scoped
  ON public.delivery_sources
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      owner_driver_id IS NOT NULL
      AND owner_driver_id = public.current_driver_id()
    )
    OR (
      company_id IS NOT NULL
      AND public.is_company_admin_of(company_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.delivery_jobs j
      WHERE j.source_id = delivery_sources.id
        AND j.driver_id = public.current_driver_id()
    )
  );

-- No authenticated INSERT/UPDATE/DELETE on sources (Nest/service_role / future admin APIs).
REVOKE ALL ON public.delivery_sources FROM PUBLIC, anon;
GRANT SELECT ON public.delivery_sources TO authenticated;
GRANT ALL ON public.delivery_sources TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Fixture source + backfill (known fixture jobs only — no guesswork)
-- ---------------------------------------------------------------------------
INSERT INTO public.delivery_sources (
  id,
  company_id,
  owner_driver_id,
  source_type,
  source_key,
  display_name,
  external_system,
  is_active
) VALUES (
  'a1000000-0000-4000-8000-000000000001',
  NULL,
  NULL,
  'fixture',
  'delivery-shield-fixtures',
  'Delivery Shield Fixtures',
  'seed',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Idempotent upsert by system unique key if fixed id conflicted
INSERT INTO public.delivery_sources (
  company_id, owner_driver_id, source_type, source_key, display_name, external_system, is_active
)
SELECT NULL, NULL, 'fixture', 'delivery-shield-fixtures', 'Delivery Shield Fixtures', 'seed', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.delivery_sources
  WHERE company_id IS NULL AND owner_driver_id IS NULL
    AND source_type = 'fixture' AND source_key = 'delivery-shield-fixtures'
);

-- Backfill only jobs that host known fixture / map-spike keys
UPDATE public.delivery_jobs j
SET source_id = s.id
FROM public.delivery_sources s
WHERE s.source_type = 'fixture'
  AND s.source_key = 'delivery-shield-fixtures'
  AND j.source_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.delivery_points dp
    WHERE dp.job_id = j.id
      AND (
        dp.tracking_or_order_key LIKE 'fixture:%'
        OR dp.tracking_or_order_key = 'phase1-map-spike-kakao'
      )
  );

UPDATE public.delivery_shipments sh
SET source_id = j.source_id
FROM public.delivery_jobs j
WHERE sh.job_id = j.id
  AND j.source_id IS NOT NULL
  AND sh.source_id IS NULL;
