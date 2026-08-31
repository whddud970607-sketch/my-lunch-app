-- 016_delivery_sources_grants_harden.sql
-- Purpose: authenticated may only SELECT delivery_sources (no INSERT/UPDATE/DELETE).
-- Additive / non-destructive. Aligns with FORCE RLS + SELECT-only policy.

REVOKE ALL ON public.delivery_sources FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.delivery_sources FROM authenticated;

GRANT SELECT ON public.delivery_sources TO authenticated;
GRANT ALL ON public.delivery_sources TO service_role;
