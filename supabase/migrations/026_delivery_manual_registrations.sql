-- 026_delivery_manual_registrations.sql
-- Purpose: Persist driver-manual registration reason + optional invoice evidence.
-- NOTE: Do NOT apply automatically. Review before staging/production.
--
-- Storage:
--   Reuse existing PRIVATE bucket `delivery-proofs`.
--   A new bucket is NOT required and is NOT created here.
--   Completion photos stay at {driver_id}/{point_id}/{object}.
--   Invoice evidence uses a dedicated prefix that completion code never writes:
--     {driver_id}/{point_id}/manual-invoice/{object}
--
-- Semantics:
--   delivery_proofs = completion_photo (UNIQUE point_id, outcome).
--   This table = registration_method=manual + optional invoice evidence.
--   evidence_type is never completion_photo.

CREATE TABLE public.delivery_manual_registrations (
  point_id uuid PRIMARY KEY REFERENCES public.delivery_points (id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  registration_method text NOT NULL DEFAULT 'manual'
    CHECK (registration_method = 'manual'),
  manual_reason text NOT NULL
    CHECK (manual_reason IN ('barcode_scan_failed', 'manual_entry')),
  evidence_type text
    CHECK (
      evidence_type IS NULL
      OR evidence_type IN ('manual_invoice', 'manual_invoice_scan_failure')
    ),
  storage_bucket text,
  storage_path text,
  content_type text,
  byte_size integer,
  captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_manual_registrations_evidence_consistent CHECK (
    (
      storage_path IS NULL
      AND storage_bucket IS NULL
      AND content_type IS NULL
      AND byte_size IS NULL
      AND evidence_type IS NULL
    )
    OR (
      storage_path IS NOT NULL
      AND storage_bucket = 'delivery-proofs'
      AND content_type IN ('image/jpeg', 'image/png', 'image/webp')
      AND byte_size > 0
      AND byte_size <= 5242880
      AND evidence_type IS NOT NULL
    )
  ),
  CONSTRAINT delivery_manual_registrations_path_shape CHECK (
    storage_path IS NULL
    OR storage_path LIKE (driver_id::text || '/' || point_id::text || '/manual-invoice/%')
  )
);

CREATE INDEX delivery_manual_registrations_driver_id_idx
  ON public.delivery_manual_registrations (driver_id);

COMMENT ON TABLE public.delivery_manual_registrations IS
  'Driver-manual registration reason and optional private invoice evidence. Not completion POD.';

ALTER TABLE public.delivery_manual_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_manual_registrations FORCE ROW LEVEL SECURITY;

-- Nest service_role only. Flutter never reads/writes this table.
-- No authenticated policies: FORCE RLS denies client roles even if GRANTed later.
-- No USING (true) / WITH CHECK (true).
REVOKE ALL ON TABLE public.delivery_manual_registrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.delivery_manual_registrations TO service_role;
