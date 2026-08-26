-- 005_rls_policies.sql
-- Purpose: Row Level Security for all public business tables.
-- NOTE: Do NOT apply until Phase 1B approval.
--
-- Design:
-- - anon: no access
-- - authenticated user JWT: RLS is the DB second line of defense (Nest should use user-scoped client)
-- - service_role: bypasses RLS (use ONLY for admin ops, signed URLs, purge, platform grant)
-- - Drivers: own assigned operational rows; PII only while job active + point open
-- - company_admin: company-scoped operational data; NO default access to delivery_point_pii / access_info
-- - platform_admin: operational oversight; NO default access to delivery_point_pii / access_info
-- - retention table: no authenticated SELECT (break-glass later via Nest + audit only)

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_point_pii ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_point_access_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_point_retention ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_proofs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.drivers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_points FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_point_pii FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_point_access_secrets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_point_retention FORCE ROW LEVEL SECURITY;
ALTER TABLE public.routes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_proofs FORCE ROW LEVEL SECURITY;

-- ========================= companies =========================
CREATE POLICY companies_select_scoped
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR id = public.current_company_id()
  );

CREATE POLICY companies_update_company_admin
  ON public.companies
  FOR UPDATE
  TO authenticated
  USING (public.is_company_admin_of(id))
  WITH CHECK (public.is_company_admin_of(id));

-- Inserts for companies: service_role / future admin API only (no authenticated insert policy)

-- ========================= profiles =========================
CREATE POLICY profiles_select_scoped
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_platform_admin()
    OR (
      public.current_profile_role() = 'company_admin'
      AND company_id IS NOT NULL
      AND company_id = public.current_company_id()
    )
  );

-- Clients may update own non-role fields only (role blocked by trigger anyway)
CREATE POLICY profiles_update_self
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND company_id IS NOT DISTINCT FROM (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ========================= drivers =========================
CREATE POLICY drivers_select_scoped
  ON public.drivers
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin()
    OR public.is_company_admin_of(company_id)
  );

CREATE POLICY drivers_update_self
  ON public.drivers
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ========================= delivery_jobs =========================
CREATE POLICY delivery_jobs_select_scoped
  ON public.delivery_jobs
  FOR SELECT
  TO authenticated
  USING (
    driver_id = public.current_driver_id()
    OR public.is_platform_admin()
    OR public.is_company_admin_of(company_id)
  );

-- Drivers may update status of their own jobs (e.g. active -> done) but not reassign driver
CREATE POLICY delivery_jobs_update_own_driver
  ON public.delivery_jobs
  FOR UPDATE
  TO authenticated
  USING (driver_id = public.current_driver_id())
  WITH CHECK (driver_id = public.current_driver_id());

-- ========================= delivery_points (operational) =========================
CREATE POLICY delivery_points_select_scoped
  ON public.delivery_points
  FOR SELECT
  TO authenticated
  USING (
    driver_id = public.current_driver_id()
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.delivery_jobs j
      WHERE j.id = delivery_points.job_id
        AND public.is_company_admin_of(j.company_id)
    )
  );

CREATE POLICY delivery_points_update_own_driver
  ON public.delivery_points
  FOR UPDATE
  TO authenticated
  USING (driver_id = public.current_driver_id())
  WITH CHECK (driver_id = public.current_driver_id());

-- ========================= delivery_point_pii (STRICT) =========================
-- Drivers: only assigned + job active + point pending/in_progress
-- company_admin / platform_admin: NO select policy (no default plaintext/ciphertext PII access)
CREATE POLICY delivery_point_pii_select_active_driver
  ON public.delivery_point_pii
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.delivery_points dp
      WHERE dp.id = delivery_point_pii.point_id
        AND public.driver_can_access_active_pii(dp.driver_id, dp.job_id, dp.status)
    )
  );

-- Driver may update PII only while active clearance holds (e.g. confirm address edits)
CREATE POLICY delivery_point_pii_update_active_driver
  ON public.delivery_point_pii
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.delivery_points dp
      WHERE dp.id = delivery_point_pii.point_id
        AND public.driver_can_access_active_pii(dp.driver_id, dp.job_id, dp.status)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.delivery_points dp
      WHERE dp.id = delivery_point_pii.point_id
        AND public.driver_can_access_active_pii(dp.driver_id, dp.job_id, dp.status)
    )
  );

-- No authenticated INSERT/DELETE on PII — Nest creates via user JWT as driver only if needed,
-- or service_role for imports. Allow insert when driver owns the new point's job in draft/active.
CREATE POLICY delivery_point_pii_insert_active_driver
  ON public.delivery_point_pii
  FOR INSERT
  TO authenticated
  WITH CHECK (
    driver_id = public.current_driver_id()
    AND EXISTS (
      SELECT 1
      FROM public.delivery_points dp
      JOIN public.delivery_jobs j ON j.id = dp.job_id
      WHERE dp.id = point_id
        AND dp.driver_id = public.current_driver_id()
        AND j.driver_id = public.current_driver_id()
        AND j.status IN ('draft', 'active')
        AND dp.status IN ('pending', 'in_progress')
    )
  );

-- ========================= delivery_point_access_secrets =========================
-- No authenticated policies => deny all clients/admins by default.
-- Nest uses service_role ONLY after verifying active assignment in app layer,
-- decrypts with server key, writes data_access_logs (read_access_info / break_glass_*).

-- ========================= delivery_point_retention =========================
-- No policies for authenticated => deny all for clients.
-- Break-glass later: Nest service_role + data_access_logs only.

-- ========================= routes =========================
CREATE POLICY routes_select_scoped
  ON public.routes
  FOR SELECT
  TO authenticated
  USING (
    driver_id = public.current_driver_id()
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.delivery_jobs j
      WHERE j.id = routes.job_id
        AND public.is_company_admin_of(j.company_id)
    )
  );

CREATE POLICY routes_update_own_driver
  ON public.routes
  FOR UPDATE
  TO authenticated
  USING (driver_id = public.current_driver_id())
  WITH CHECK (driver_id = public.current_driver_id());

CREATE POLICY routes_insert_own_driver
  ON public.routes
  FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = public.current_driver_id());

-- ========================= delivery_proofs =========================
CREATE POLICY delivery_proofs_select_scoped
  ON public.delivery_proofs
  FOR SELECT
  TO authenticated
  USING (
    driver_id = public.current_driver_id()
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.delivery_points dp
      JOIN public.delivery_jobs j ON j.id = dp.job_id
      WHERE dp.id = delivery_proofs.point_id
        AND public.is_company_admin_of(j.company_id)
    )
  );

CREATE POLICY delivery_proofs_insert_own_driver
  ON public.delivery_proofs
  FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = public.current_driver_id());

-- Grants: tables usable by authenticated under RLS; revoke anon
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT, UPDATE ON public.companies TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.drivers TO authenticated;
GRANT SELECT, UPDATE ON public.delivery_jobs TO authenticated;
GRANT SELECT, UPDATE ON public.delivery_points TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.delivery_point_pii TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.routes TO authenticated;
GRANT SELECT, INSERT ON public.delivery_proofs TO authenticated;
-- access_secrets + retention: no grant to authenticated (service_role only)
REVOKE ALL ON public.delivery_point_access_secrets FROM authenticated, anon;
REVOKE ALL ON public.delivery_point_retention FROM authenticated, anon;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
