-- 003_companies_profiles_drivers.sql
-- Purpose: Company / profile / driver identity model, signup trigger, role-escalation guards.
-- NOTE: Do NOT apply until Phase 1B approval.
--
-- Security:
-- - New users always get role = driver (never platform_admin via signup).
-- - Client/authenticated JWT cannot change profiles.role (trigger blocks unless service_role
--   AND session flag app.allow_platform_admin_grant = on for platform_admin grants).

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status public.company_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'driver',
  company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_company_admin_requires_company
    CHECK (
      role <> 'company_admin'
      OR company_id IS NOT NULL
    ),
  CONSTRAINT profiles_platform_admin_has_no_company
    CHECK (
      role <> 'platform_admin'
      OR company_id IS NULL
    )
);

CREATE TABLE public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles (id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  vehicle_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  work_status public.driver_work_status NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX drivers_company_id_idx ON public.drivers (company_id);
CREATE INDEX profiles_company_id_idx ON public.profiles (company_id);
CREATE INDEX profiles_role_idx ON public.profiles (role);

-- ---------------------------------------------------------------------------
-- Context helpers (depend on profiles / drivers)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_driver_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id
  FROM public.drivers d
  WHERE d.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'platform_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin_of(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'company_admin'
      AND p.company_id IS NOT NULL
      AND p.company_id = p_company_id
  );
$$;

CREATE OR REPLACE FUNCTION public.driver_owns_point(p_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_driver_id IS NOT NULL
    AND p_driver_id = public.current_driver_id();
$$;

REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_driver_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_company_admin_of(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.driver_owns_point(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_driver_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_company_admin_of(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.driver_owns_point(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Signup: always driver (+ drivers row). Never platform_admin / company_admin.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, display_name)
  VALUES (
    NEW.id,
    'driver',
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1))
  );

  INSERT INTO public.drivers (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Block client role escalation / platform_admin self-grant
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_role_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allow_platform text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    -- Authenticated users (Flutter/Web JWT) cannot change role at all.
    IF NOT public.is_service_role() THEN
      RAISE EXCEPTION 'profiles.role cannot be changed by clients'
        USING ERRCODE = '42501';
    END IF;

    -- platform_admin grant requires explicit server session flag (Nest sets via SET LOCAL).
    IF NEW.role = 'platform_admin' THEN
      allow_platform := current_setting('app.allow_platform_admin_grant', true);
      IF allow_platform IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'platform_admin grant requires app.allow_platform_admin_grant=on'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- Prevent INSERT of non-driver via non-service paths (defense if someone inserts profiles).
  IF TG_OP = 'INSERT' AND NEW.role <> 'driver' AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'only driver role allowed on profile insert for clients'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.role = 'platform_admin' THEN
    allow_platform := current_setting('app.allow_platform_admin_grant', true);
    IF allow_platform IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'platform_admin insert requires app.allow_platform_admin_grant=on'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_role_security ON public.profiles;
CREATE TRIGGER trg_profiles_role_security
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_role_security();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();
