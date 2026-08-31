-- 013_operation_receipts_grants_harden.sql
-- Purpose: Defense-in-depth — authenticated may only SELECT/INSERT receipts.
-- RLS already has no UPDATE/DELETE policies; this aligns table GRANTs with intent.
-- Additive / non-destructive: no DROP TABLE, no data delete.

REVOKE ALL ON public.operation_receipts FROM PUBLIC, anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.operation_receipts FROM authenticated;

GRANT SELECT, INSERT ON public.operation_receipts TO authenticated;
GRANT ALL ON public.operation_receipts TO service_role;
