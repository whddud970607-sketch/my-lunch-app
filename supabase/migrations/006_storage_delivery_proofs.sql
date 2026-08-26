-- 006_storage_delivery_proofs.sql
-- Purpose: Private Storage bucket + policies for delivery completion photos.
-- NOTE: Do NOT apply until Phase 1B approval.
--
-- Path convention: {driver_id}/{point_id}/{object_name}
-- Clients upload via Nest-issued signed URLs when possible.
-- RLS still restricts direct storage access to owning driver (and company read of proofs metadata via DB).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'delivery-proofs',
  'delivery-proofs',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Helper: first path segment equals current driver id
CREATE OR REPLACE FUNCTION public.storage_path_driver_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(object_name, '/', 1), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.storage_path_point_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(object_name, '/', 2), '')::uuid;
$$;

-- Drivers can read/write objects under their driver_id prefix only
CREATE POLICY delivery_proofs_storage_select_own
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'delivery-proofs'
    AND public.storage_path_driver_id(name) = public.current_driver_id()
  );

CREATE POLICY delivery_proofs_storage_insert_own
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'delivery-proofs'
    AND public.storage_path_driver_id(name) = public.current_driver_id()
    AND EXISTS (
      SELECT 1
      FROM public.delivery_points dp
      WHERE dp.id = public.storage_path_point_id(name)
        AND dp.driver_id = public.current_driver_id()
    )
  );

CREATE POLICY delivery_proofs_storage_update_own
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'delivery-proofs'
    AND public.storage_path_driver_id(name) = public.current_driver_id()
  )
  WITH CHECK (
    bucket_id = 'delivery-proofs'
    AND public.storage_path_driver_id(name) = public.current_driver_id()
  );

CREATE POLICY delivery_proofs_storage_delete_own
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'delivery-proofs'
    AND public.storage_path_driver_id(name) = public.current_driver_id()
  );

-- company_admin: read-only objects for proofs belonging to company jobs
CREATE POLICY delivery_proofs_storage_select_company_admin
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'delivery-proofs'
    AND public.current_profile_role() = 'company_admin'
    AND EXISTS (
      SELECT 1
      FROM public.delivery_points dp
      JOIN public.delivery_jobs j ON j.id = dp.job_id
      WHERE dp.id = public.storage_path_point_id(name)
        AND public.is_company_admin_of(j.company_id)
    )
  );

-- platform_admin: no blanket storage read of all proofs by default (omit policy)
