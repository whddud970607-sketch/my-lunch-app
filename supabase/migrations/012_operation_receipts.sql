-- 012_operation_receipts.sql
-- Purpose: Idempotent client operation receipts (P0-A Phase 2).
-- Additive only — no DROP/rename of existing delivery tables.
-- result_body must never store PII, secrets, tokens, or GPS coordinates.

CREATE TABLE IF NOT EXISTS public.operation_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers (id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  operation_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  payload_hash text NOT NULL,
  result_code text NOT NULL,
  result_body jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operation_receipts_driver_idempotency_unique
    UNIQUE (driver_id, idempotency_key),
  CONSTRAINT operation_receipts_result_code_check
    CHECK (result_code IN ('applied', 'duplicate', 'rejected'))
);

CREATE INDEX IF NOT EXISTS operation_receipts_driver_id_idx
  ON public.operation_receipts (driver_id);
CREATE INDEX IF NOT EXISTS operation_receipts_entity_id_idx
  ON public.operation_receipts (entity_id);
CREATE INDEX IF NOT EXISTS operation_receipts_created_at_idx
  ON public.operation_receipts (created_at);

ALTER TABLE public.operation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_receipts FORCE ROW LEVEL SECURITY;

-- Own-driver read/insert only. No UPDATE/DELETE for authenticated.
CREATE POLICY operation_receipts_select_own
  ON public.operation_receipts
  FOR SELECT
  TO authenticated
  USING (driver_id = public.current_driver_id());

CREATE POLICY operation_receipts_insert_own
  ON public.operation_receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = public.current_driver_id());

REVOKE ALL ON public.operation_receipts FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.operation_receipts TO authenticated;
GRANT ALL ON public.operation_receipts TO service_role;

COMMENT ON TABLE public.operation_receipts IS
  'Client operation idempotency receipts. result_body: no PII/secret/GPS.';
