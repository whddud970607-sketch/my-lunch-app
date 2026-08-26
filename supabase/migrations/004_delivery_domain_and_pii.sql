-- 004_delivery_domain_and_pii.sql
-- Purpose: DeliveryJob / DeliveryPoint / Route / DeliveryProof + PII separation.
-- NOTE: Do NOT apply until Phase 1B approval.
--
-- Privacy model:
-- - delivery_points: operational fields + coarse/masked labels (safe for lists after complete).
-- - delivery_point_pii: customer PII (name/address/memo) + contact channel (masked/virtual only).
--   NO dedicated raw customer phone column. Prefer carrier 안심/가상번호 in contact_*.
-- - delivery_point_access_secrets: Nest-only ciphertext for door codes (NO authenticated access).
-- - delivery_point_retention: legal/settlement retention copy; no default client access.
-- - Drivers read PII/contact only while job=active AND point in (pending, in_progress) AND assigned.
-- - access_info / expired contacts: purge NULLs values (true deletion, not UI ****).

CREATE TABLE public.delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  driver_id uuid NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  service_date date NOT NULL DEFAULT (CURRENT_DATE),
  status public.job_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX delivery_jobs_driver_id_idx ON public.delivery_jobs (driver_id);
CREATE INDEX delivery_jobs_company_id_idx ON public.delivery_jobs (company_id);
CREATE INDEX delivery_jobs_service_date_idx ON public.delivery_jobs (service_date);
CREATE INDEX delivery_jobs_status_idx ON public.delivery_jobs (status);

CREATE TABLE public.delivery_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.delivery_jobs (id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  sequence_no int NOT NULL DEFAULT 0,
  -- Non-sensitive / post-mask label for UI lists (e.g. "배송지 3" or "서울 ○○구 ****")
  display_label text NOT NULL DEFAULT '배송지',
  location extensions.geography(Point, 4326),
  pin_accuracy public.pin_accuracy NOT NULL DEFAULT 'address',
  quantity int NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  carrier_code text,
  tracking_or_order_key text,
  status public.delivery_point_status NOT NULL DEFAULT 'pending',
  -- Long-term learning placeholders (no customer PII)
  driver_adjusted_location extensions.geography(Point, 4326),
  building_entrance_hint text,
  source_proof_point_id uuid,
  pii_masked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_points_job_sequence_unique UNIQUE (job_id, sequence_no)
);

CREATE INDEX delivery_points_job_id_idx ON public.delivery_points (job_id);
CREATE INDEX delivery_points_driver_id_idx ON public.delivery_points (driver_id);
CREATE INDEX delivery_points_status_idx ON public.delivery_points (status);
CREATE INDEX delivery_points_location_gix ON public.delivery_points USING GIST (location);

-- Customer PII (no raw phone column). Contact = carrier masked/virtual when available.
CREATE TABLE public.delivery_point_pii (
  point_id uuid PRIMARY KEY REFERENCES public.delivery_points (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.delivery_jobs (id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  customer_name text,
  raw_address text,
  normalized_address text,
  detail_address text,
  delivery_memo text,
  -- Contact channel (PII): never place on delivery_points; never treat as "customer raw MSISDN" store
  contact_type public.delivery_contact_type NOT NULL DEFAULT 'none',
  contact_value text,
  contact_expires_at timestamptz,
  contact_provider text,
  provider_reference text,
  contact_purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_point_pii_contact_none_clears_value CHECK (
    contact_type <> 'none'
    OR contact_value IS NULL
  ),
  CONSTRAINT delivery_point_pii_contact_provider_when_referenced CHECK (
    provider_reference IS NULL
    OR contact_provider IS NOT NULL
  )
);

CREATE INDEX delivery_point_pii_driver_id_idx ON public.delivery_point_pii (driver_id);
CREATE INDEX delivery_point_pii_job_id_idx ON public.delivery_point_pii (job_id);
CREATE INDEX delivery_point_pii_contact_expires_idx
  ON public.delivery_point_pii (contact_expires_at)
  WHERE contact_value IS NOT NULL AND contact_purged_at IS NULL;

-- Door codes / access secrets: Nest encrypt/decrypt ONLY. No authenticated RLS policies.
CREATE TABLE public.delivery_point_access_secrets (
  point_id uuid PRIMARY KEY REFERENCES public.delivery_points (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.delivery_jobs (id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  access_info_ciphertext bytea,
  access_info_nonce bytea,
  access_info_key_version int,
  access_info_expires_at timestamptz,
  access_info_purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_point_access_secrets_crypto_consistent CHECK (
    (
      access_info_ciphertext IS NULL
      AND access_info_nonce IS NULL
      AND access_info_key_version IS NULL
    )
    OR (
      access_info_ciphertext IS NOT NULL
      AND access_info_nonce IS NOT NULL
      AND access_info_key_version IS NOT NULL
    )
  )
);

CREATE INDEX delivery_point_access_secrets_expires_idx
  ON public.delivery_point_access_secrets (access_info_expires_at)
  WHERE access_info_ciphertext IS NOT NULL AND access_info_purged_at IS NULL;

-- Legal / settlement retention (proof linkage, hashed refs) — not for driver UI
CREATE TABLE public.delivery_point_retention (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  point_id uuid NOT NULL UNIQUE REFERENCES public.delivery_points (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.delivery_jobs (id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  -- Opaque retention payload written by Nest at completion (may include encrypted archive blob)
  retention_ciphertext bytea,
  retention_nonce bytea,
  retention_key_version int,
  retention_purpose text NOT NULL DEFAULT 'settlement_legal',
  retain_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_point_retention_crypto_consistent CHECK (
    (
      retention_ciphertext IS NULL
      AND retention_nonce IS NULL
      AND retention_key_version IS NULL
    )
    OR (
      retention_ciphertext IS NOT NULL
      AND retention_nonce IS NOT NULL
      AND retention_key_version IS NOT NULL
    )
  )
);

CREATE TABLE public.routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.delivery_jobs (id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  service_date date NOT NULL,
  ordered_point_ids uuid[] NOT NULL DEFAULT '{}',
  optimization_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX routes_driver_id_idx ON public.routes (driver_id);

CREATE TABLE public.delivery_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  point_id uuid NOT NULL UNIQUE REFERENCES public.delivery_points (id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  storage_path text NOT NULL,
  outcome public.proof_outcome NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_location extensions.geography(Point, 4326),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX delivery_proofs_driver_id_idx ON public.delivery_proofs (driver_id);

-- PII access helper (needs delivery_jobs)
CREATE OR REPLACE FUNCTION public.driver_can_access_active_pii(
  p_driver_id uuid,
  p_job_id uuid,
  p_point_status public.delivery_point_status
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.driver_owns_point(p_driver_id)
    AND p_point_status IN ('pending', 'in_progress')
    AND EXISTS (
      SELECT 1
      FROM public.delivery_jobs j
      WHERE j.id = p_job_id
        AND j.driver_id = p_driver_id
        AND j.status = 'active'
    );
$$;

REVOKE ALL ON FUNCTION public.driver_can_access_active_pii(uuid, uuid, public.delivery_point_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_can_access_active_pii(uuid, uuid, public.delivery_point_status)
  TO authenticated, service_role;

-- Keep driver_id on points aligned with job; block unassigned PII reads via status
CREATE OR REPLACE FUNCTION public.sync_delivery_point_driver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_driver uuid;
BEGIN
  SELECT j.driver_id INTO job_driver
  FROM public.delivery_jobs j
  WHERE j.id = NEW.job_id;

  IF job_driver IS NULL THEN
    RAISE EXCEPTION 'delivery job not found';
  END IF;

  NEW.driver_id := job_driver;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delivery_points_sync_driver
  BEFORE INSERT OR UPDATE OF job_id ON public.delivery_points
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_delivery_point_driver();

-- On point completion/failure: stamp mask time + clear display to non-PII label
CREATE OR REPLACE FUNCTION public.on_delivery_point_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('completed', 'failed') THEN
    NEW.pii_masked_at := COALESCE(NEW.pii_masked_at, now());
    NEW.display_label := COALESCE(
      NULLIF(NEW.display_label, ''),
      '배송지'
    ) || ' (완료·마스킹)';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delivery_points_status_mask
  BEFORE UPDATE OF status ON public.delivery_points
  FOR EACH ROW
  EXECUTE FUNCTION public.on_delivery_point_status_change();

-- When job becomes done: mark all open points masked timestamp for API contracts
CREATE OR REPLACE FUNCTION public.on_delivery_job_done()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    UPDATE public.delivery_points dp
    SET
      pii_masked_at = COALESCE(dp.pii_masked_at, now()),
      updated_at = now()
    WHERE dp.job_id = NEW.id
      AND dp.pii_masked_at IS NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delivery_jobs_done
  BEFORE UPDATE OF status ON public.delivery_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.on_delivery_job_done();

-- Purge access_info ciphertext when expired (callable by Nest cron / service_role)
CREATE OR REPLACE FUNCTION public.purge_expired_access_info(p_limit int DEFAULT 500)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'purge_expired_access_info requires service_role'
      USING ERRCODE = '42501';
  END IF;

  WITH doomed AS (
    SELECT point_id
    FROM public.delivery_point_access_secrets
    WHERE access_info_ciphertext IS NOT NULL
      AND access_info_purged_at IS NULL
      AND access_info_expires_at IS NOT NULL
      AND access_info_expires_at < now()
    LIMIT p_limit
  )
  UPDATE public.delivery_point_access_secrets p
  SET
    access_info_ciphertext = NULL,
    access_info_nonce = NULL,
    access_info_key_version = NULL,
    access_info_purged_at = now(),
    updated_at = now()
  FROM doomed d
  WHERE p.point_id = d.point_id;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_access_info(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_access_info(int) TO service_role;

-- Purge expired contact_value (carrier masked/virtual). True deletion, not UI masking.
CREATE OR REPLACE FUNCTION public.purge_expired_contacts(p_limit int DEFAULT 500)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'purge_expired_contacts requires service_role'
      USING ERRCODE = '42501';
  END IF;

  WITH doomed AS (
    SELECT point_id
    FROM public.delivery_point_pii
    WHERE contact_value IS NOT NULL
      AND contact_purged_at IS NULL
      AND contact_expires_at IS NOT NULL
      AND contact_expires_at < now()
    LIMIT p_limit
  )
  UPDATE public.delivery_point_pii p
  SET
    contact_value = NULL,
    contact_type = 'none',
    provider_reference = NULL,
    contact_purged_at = now(),
    updated_at = now()
  FROM doomed d
  WHERE p.point_id = d.point_id;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_contacts(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_contacts(int) TO service_role;

COMMENT ON COLUMN public.delivery_point_pii.contact_value IS
  'Carrier masked/virtual number only. Do not use as a raw customer MSISDN store. MVP does not issue Delivery Shield numbers.';

COMMENT ON COLUMN public.delivery_point_pii.contact_provider IS
  'Provider id for Nest ContactProvider adapter (e.g. carrier/company code). Future: delivery_shield without telco lock-in.';

COMMENT ON COLUMN public.delivery_point_pii.contact_expires_at IS
  'After expiry, purge_expired_contacts() clears contact_value (deletion, not **** masking).';

CREATE TRIGGER trg_delivery_jobs_updated_at
  BEFORE UPDATE ON public.delivery_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_routes_updated_at
  BEFORE UPDATE ON public.routes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_delivery_point_pii_updated_at
  BEFORE UPDATE ON public.delivery_point_pii
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_delivery_point_access_secrets_updated_at
  BEFORE UPDATE ON public.delivery_point_access_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();
