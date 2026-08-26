-- 007_data_access_logs.sql
-- Purpose: Audit log for sensitive data access (especially access_info / break-glass).
-- NOTE: Do NOT apply until Phase 1B approval.
--
-- Nest MUST write a row before returning decrypted access_info or break-glass PII.
-- Clients cannot update/delete logs. Insert allowed for authenticated self-attribution
-- and service_role for server-side logging.

CREATE TABLE public.data_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_role public.user_role,
  resource_type text NOT NULL,
  resource_id uuid,
  action public.data_access_action NOT NULL,
  access_reason text,
  -- Optional request metadata (no raw PII values)
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  accessed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_access_logs_reason_required_for_break_glass CHECK (
    action NOT IN ('break_glass_pii', 'break_glass_access_info', 'read_access_info')
    OR (access_reason IS NOT NULL AND length(trim(access_reason)) >= 3)
  )
);

CREATE INDEX data_access_logs_actor_id_idx ON public.data_access_logs (actor_id);
CREATE INDEX data_access_logs_resource_idx ON public.data_access_logs (resource_type, resource_id);
CREATE INDEX data_access_logs_action_idx ON public.data_access_logs (action);
CREATE INDEX data_access_logs_accessed_at_idx ON public.data_access_logs (accessed_at DESC);

ALTER TABLE public.data_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_access_logs FORCE ROW LEVEL SECURITY;

-- Actors can insert their own audit rows (Nest using user JWT)
CREATE POLICY data_access_logs_insert_self
  ON public.data_access_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND (
      actor_role IS NULL
      OR actor_role = public.current_profile_role()
    )
  );

-- Users may read their own access history; platform_admin may read all (ops)
CREATE POLICY data_access_logs_select_self_or_platform
  ON public.data_access_logs
  FOR SELECT
  TO authenticated
  USING (
    actor_id = auth.uid()
    OR public.is_platform_admin()
  );

-- No UPDATE/DELETE policies for authenticated

GRANT SELECT, INSERT ON public.data_access_logs TO authenticated;
GRANT ALL ON public.data_access_logs TO service_role;

-- ---------------------------------------------------------------------------
-- Documentation view (non-security): masked list contract for Nest queries
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.delivery_points_list_safe
WITH (security_invoker = true)
AS
SELECT
  dp.id,
  dp.job_id,
  dp.driver_id,
  dp.sequence_no,
  dp.display_label,
  dp.location,
  dp.pin_accuracy,
  dp.quantity,
  dp.carrier_code,
  dp.tracking_or_order_key,
  dp.status,
  dp.pii_masked_at,
  dp.created_at,
  dp.updated_at,
  j.status AS job_status,
  CASE
    WHEN public.driver_can_access_active_pii(dp.driver_id, dp.job_id, dp.status)
      THEN false
    ELSE true
  END AS pii_is_masked
FROM public.delivery_points dp
JOIN public.delivery_jobs j ON j.id = dp.job_id;

GRANT SELECT ON public.delivery_points_list_safe TO authenticated, service_role;

COMMENT ON TABLE public.delivery_point_pii IS
  'Customer PII + contact channel (masked/virtual). No raw-phone column. Admins have no default SELECT. Masked after point/job completion via RLS.';

COMMENT ON TABLE public.delivery_point_access_secrets IS
  'Encrypted access_info (door codes). No authenticated RLS. Nest service_role decrypt only + audit. Purge deletes ciphertext.';

COMMENT ON TABLE public.delivery_point_retention IS
  'Legal/settlement retention archive. No authenticated RLS policies; access only via Nest service_role + data_access_logs.';

COMMENT ON TABLE public.data_access_logs IS
  'Audit trail for sensitive reads. Distinguish read_access_info / break_glass_* from list_summary.';

COMMENT ON COLUMN public.delivery_point_access_secrets.access_info_expires_at IS
  'After this time, purge_expired_access_info() NULLs ciphertext (true deletion, not UI masking).';
