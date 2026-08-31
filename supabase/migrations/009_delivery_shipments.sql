-- 009_delivery_shipments.sql
-- Purpose: 1:N package/tracking codes under a DeliveryPoint (OCR/scan ready).
-- Tracking codes are operational (not customer phone/access secrets).
-- SELECT scope mirrors delivery_points (assigned driver / company / platform admin).
-- No authenticated access to access_secrets / retention.

CREATE TYPE public.delivery_shipment_status AS ENUM (
  'pending',
  'scanned',
  'completed',
  'failed'
);

CREATE TABLE public.delivery_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  point_id uuid NOT NULL REFERENCES public.delivery_points (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.delivery_jobs (id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  sequence_no int NOT NULL CHECK (sequence_no >= 1),
  -- Virtual/test or carrier tracking label (never store customer MSISDN here)
  tracking_code text NOT NULL,
  status public.delivery_shipment_status NOT NULL DEFAULT 'pending',
  scanned_at timestamptz,
  completed_at timestamptz,
  -- Future barcode / OCR match inputs (nullable until scan phase)
  barcode_raw text,
  ocr_raw text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_shipments_point_sequence_unique UNIQUE (point_id, sequence_no),
  CONSTRAINT delivery_shipments_tracking_code_unique UNIQUE (tracking_code),
  CONSTRAINT delivery_shipments_scanned_requires_time CHECK (
    status <> 'scanned' OR scanned_at IS NOT NULL
  ),
  CONSTRAINT delivery_shipments_completed_requires_time CHECK (
    status <> 'completed' OR completed_at IS NOT NULL
  )
);

CREATE INDEX delivery_shipments_point_id_idx ON public.delivery_shipments (point_id);
CREATE INDEX delivery_shipments_job_id_idx ON public.delivery_shipments (job_id);
CREATE INDEX delivery_shipments_driver_id_idx ON public.delivery_shipments (driver_id);
CREATE INDEX delivery_shipments_status_idx ON public.delivery_shipments (status);

CREATE OR REPLACE FUNCTION public.sync_delivery_shipment_driver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_driver uuid;
  v_job uuid;
BEGIN
  SELECT dp.driver_id, dp.job_id
    INTO v_driver, v_job
  FROM public.delivery_points dp
  WHERE dp.id = NEW.point_id;

  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'delivery_shipments: point_id % not found', NEW.point_id;
  END IF;

  NEW.driver_id := v_driver;
  NEW.job_id := v_job;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delivery_shipments_sync_driver
  BEFORE INSERT OR UPDATE OF point_id ON public.delivery_shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_delivery_shipment_driver();

ALTER TABLE public.delivery_shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_shipments_select_scoped
  ON public.delivery_shipments
  FOR SELECT
  TO authenticated
  USING (
    driver_id = public.current_driver_id()
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.delivery_jobs j
      WHERE j.id = delivery_shipments.job_id
        AND public.is_company_admin_of(j.company_id)
    )
  );

CREATE POLICY delivery_shipments_update_own_driver
  ON public.delivery_shipments
  FOR UPDATE
  TO authenticated
  USING (driver_id = public.current_driver_id())
  WITH CHECK (driver_id = public.current_driver_id());

-- Drivers do not INSERT/DELETE shipments in app (Nest/service_role seed/import).
REVOKE ALL ON TABLE public.delivery_shipments FROM PUBLIC, anon;
GRANT SELECT, UPDATE ON TABLE public.delivery_shipments TO authenticated;
GRANT ALL ON TABLE public.delivery_shipments TO service_role;

REVOKE ALL ON FUNCTION public.sync_delivery_shipment_driver() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_delivery_shipment_driver() TO service_role;
