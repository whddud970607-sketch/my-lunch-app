-- 023_delivery_shipments_force_rls.sql
-- Purpose: Align delivery_shipments with other business tables (005 FORCE RLS pattern).
-- Additive hardening only — no data changes, policies unchanged.
-- service_role continues to bypass RLS (Supabase); authenticated JWT paths unchanged.

ALTER TABLE public.delivery_shipments FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.delivery_shipments IS
  'Package/tracking rows under delivery points. FORCE RLS enabled (023).';
