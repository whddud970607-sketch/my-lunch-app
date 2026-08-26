-- 002_enums_and_helpers.sql
-- Purpose: Shared enums and JWT role helpers (no table dependencies yet).
-- NOTE: Do NOT apply until Phase 1B approval.

CREATE TYPE public.user_role AS ENUM (
  'driver',
  'company_admin',
  'platform_admin'
);

CREATE TYPE public.company_status AS ENUM (
  'active',
  'suspended',
  'closed'
);

CREATE TYPE public.driver_work_status AS ENUM (
  'available',
  'on_duty',
  'off_duty',
  'inactive'
);

CREATE TYPE public.job_status AS ENUM (
  'draft',
  'active',
  'done'
);

CREATE TYPE public.delivery_point_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'failed'
);

CREATE TYPE public.pin_accuracy AS ENUM (
  'address',
  'building',
  'entrance',
  'driver_verified'
);

CREATE TYPE public.proof_outcome AS ENUM (
  'completed',
  'failed'
);

CREATE TYPE public.data_access_action AS ENUM (
  'list_summary',
  'read_masked',
  'read_pii',
  'read_contact',
  'read_access_info',
  'break_glass_pii',
  'break_glass_access_info',
  'purge_access_info',
  'purge_contact',
  'download_proof'
);

-- How the driver reaches the customer for this stop (prefer carrier safe/virtual numbers).
-- Do NOT model a dedicated "raw customer mobile" column; MVP does not issue DS numbers.
CREATE TYPE public.delivery_contact_type AS ENUM (
  'none',
  'masked_number',
  'virtual_number'
);

CREATE OR REPLACE FUNCTION public.request_jwt_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.role(), 'anon');
$$;

CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.request_jwt_role() = 'service_role';
$$;

GRANT EXECUTE ON FUNCTION public.request_jwt_role() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_service_role() TO authenticated, anon, service_role;
