-- 017_tracking_namespace_cutover.sql
-- Purpose: P0-B1-1.5 — make (source_id, tracking_code) authoritative uniqueness.
-- Preflight (must be verified before apply):
--   - no tracking/external rows with NULL source_id
--   - no (source_id, tracking_code) collisions
--   - no (source_id, external_id) collisions
--   - job/shipment source consistency
-- Does NOT delete/update tracking values.
-- Does NOT weaken RLS.

-- 1) Identifiers that participate in namespace require source_id
--    (tracking_code column is currently NOT NULL; keep OR form for future-proofing)
ALTER TABLE public.delivery_shipments
  ADD CONSTRAINT delivery_shipments_ident_requires_source
  CHECK (
    (tracking_code IS NULL OR source_id IS NOT NULL)
    AND (external_id IS NULL OR source_id IS NOT NULL)
  );

COMMENT ON CONSTRAINT delivery_shipments_ident_requires_source
  ON public.delivery_shipments IS
  'tracking_code or external_id requires source_id for namespaced uniqueness.';

-- 2) Re-assert namespaced unique indexes (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS delivery_shipments_source_tracking_uidx
  ON public.delivery_shipments (source_id, tracking_code)
  WHERE source_id IS NOT NULL AND tracking_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_shipments_source_external_uidx
  ON public.delivery_shipments (source_id, external_id)
  WHERE source_id IS NOT NULL AND external_id IS NOT NULL;

-- 3) Drop global uniqueness (only after namespaced protection + CHECK exist)
ALTER TABLE public.delivery_shipments
  DROP CONSTRAINT IF EXISTS delivery_shipments_tracking_code_unique;

COMMENT ON COLUMN public.delivery_shipments.tracking_code IS
  'Carrier/operational tracking label. Unique per source_id namespace, NOT globally unique.';
