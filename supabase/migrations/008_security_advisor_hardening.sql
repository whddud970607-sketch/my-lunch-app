-- 008_security_advisor_hardening.sql
-- Purpose: Fix Supabase Security Advisor WARN/INFO related to search_path, RPC EXECUTE, and least-privilege GRANTs.
-- NOTE: Do NOT apply until Phase 1B.1 approval. Repo-only until then.
--
-- Intent:
-- - Pin search_path on public helper/trigger/purge functions.
-- - Revoke client RPC on trigger/purge/admin helpers.
-- - Keep RLS helper EXECUTE for authenticated (policies need it); remove from anon/PUBLIC.
-- - Revoke all business-table privileges from anon (RLS alone is not enough vs default GRANTs).
-- - Narrow authenticated table privileges to what user-JWT + RLS policies actually use.
-- - Keep delivery_point_access_secrets / delivery_point_retention with no authenticated policies/grants.

-- =============================================================================
-- 1) search_path hardening (public + pg_temp; extensions only where geography helpers need it)
-- =============================================================================

-- Non-DEFINER helpers previously missing search_path
CREATE OR REPLACE FUNCTION public.request_jwt_role()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(auth.role(), 'anon');
$$;

CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT public.request_jwt_role() = 'service_role';
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.storage_path_driver_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(split_part(object_name, '/', 1), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.storage_path_point_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(split_part(object_name, '/', 2), '')::uuid;
$$;

-- SECURITY DEFINER helpers: keep bodies; re-assert search_path = public, pg_temp
ALTER FUNCTION public.current_profile_role() SET search_path = public, pg_temp;
ALTER FUNCTION public.current_company_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.current_driver_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_platform_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_company_admin_of(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.driver_owns_point(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.driver_can_access_active_pii(uuid, uuid, public.delivery_point_status)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_profile_role_security() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_delivery_point_driver() SET search_path = public, pg_temp;
ALTER FUNCTION public.on_delivery_point_status_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.on_delivery_job_done() SET search_path = public, pg_temp;
ALTER FUNCTION public.purge_expired_access_info(integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.purge_expired_contacts(integer) SET search_path = public, pg_temp;

-- =============================================================================
-- 2) EXECUTE privileges: revoke RPC from clients where not needed
-- =============================================================================

-- Trigger-only / internal: no direct RPC for anyone except service_role (and table owner path).
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_profile_role_security() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_delivery_point_driver() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_delivery_point_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_delivery_job_done() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_profile_role_security() TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_delivery_point_driver() TO service_role;
GRANT EXECUTE ON FUNCTION public.on_delivery_point_status_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.on_delivery_job_done() TO service_role;

-- High-risk purge: service_role only (Nest cron). Blocks client RPC even if function body checks role.
REVOKE ALL ON FUNCTION public.purge_expired_access_info(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_contacts(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_access_info(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_contacts(integer) TO service_role;

-- JWT/role introspection: not needed as public RPC
REVOKE ALL ON FUNCTION public.request_jwt_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_service_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_jwt_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_service_role() TO service_role;

-- RLS policy helpers: authenticated + service_role only (policies evaluate as invoker)
REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_driver_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_company_admin_of(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_owns_point(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_can_access_active_pii(uuid, uuid, public.delivery_point_status)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storage_path_driver_id(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.storage_path_point_id(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_driver_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_company_admin_of(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_owns_point(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_can_access_active_pii(uuid, uuid, public.delivery_point_status)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_path_driver_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storage_path_point_id(text) TO authenticated, service_role;

-- =============================================================================
-- 3) Table privileges: anon none; authenticated least-privilege for user-JWT + RLS
-- =============================================================================

-- Remove default Supabase broad GRANTs from anon on business tables
REVOKE ALL ON TABLE
  public.companies,
  public.profiles,
  public.drivers,
  public.delivery_jobs,
  public.delivery_points,
  public.delivery_point_pii,
  public.delivery_point_access_secrets,
  public.delivery_point_retention,
  public.routes,
  public.delivery_proofs,
  public.data_access_logs
FROM anon;

REVOKE ALL ON TABLE public.delivery_points_list_safe FROM anon;

-- Start clean for authenticated, then re-grant only policy-backed privileges
REVOKE ALL ON TABLE
  public.companies,
  public.profiles,
  public.drivers,
  public.delivery_jobs,
  public.delivery_points,
  public.delivery_point_pii,
  public.delivery_point_access_secrets,
  public.delivery_point_retention,
  public.routes,
  public.delivery_proofs,
  public.data_access_logs
FROM authenticated;

-- User JWT + RLS path (Nest should prefer this over service_role for routine reads)
GRANT SELECT, UPDATE ON TABLE public.companies TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.drivers TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.delivery_jobs TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.delivery_points TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.delivery_point_pii TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.routes TO authenticated;
GRANT SELECT, INSERT ON TABLE public.delivery_proofs TO authenticated;
GRANT SELECT, INSERT ON TABLE public.data_access_logs TO authenticated;
GRANT SELECT ON TABLE public.delivery_points_list_safe TO authenticated;

-- Explicit deny: no authenticated access to ciphertext / retention (Nest service_role only)
REVOKE ALL ON TABLE public.delivery_point_access_secrets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.delivery_point_retention FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.delivery_point_access_secrets TO service_role;
GRANT ALL ON TABLE public.delivery_point_retention TO service_role;

-- Ensure service_role retains full access for admin/signed-url/purge paths
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
