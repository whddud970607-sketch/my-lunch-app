-- 014_complete_delivery_point_atomic.sql
-- Purpose: Single-transaction idempotent delivery completion (P0-A Final Hardening).
-- Preserves existing domain truth from DeliveryCompletionService / map-spike complete:
--   1) delivery_proofs insert (point_id UNIQUE, outcome=completed)
--   2) delivery_points.status → completed + pii_masked_at + display_label
--      (trg_delivery_points_status_mask still runs — same as before)
--   3) operation_receipts insert (safe result_body only)
-- Does NOT invent shipment completion rules (Nest never updated shipments on complete).
-- Additive only — no DROP of existing tables/data. RLS/GRANTs not weakened.

CREATE OR REPLACE FUNCTION public.complete_delivery_point_atomic(
  p_point_id uuid,
  p_storage_path text,
  p_idempotency_key text,
  p_payload_hash text,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_fail_after text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_driver_id uuid;
  v_point public.delivery_points%ROWTYPE;
  v_receipt public.operation_receipts%ROWTYPE;
  v_completed_at timestamptz := now();
  v_location extensions.geography(Point, 4326) := NULL;
  v_receipt_body jsonb;
  v_prefix text;
  v_allow_inject boolean;
BEGIN
  -- Identity from JWT session only — never trust client-supplied driver/company.
  v_driver_id := public.current_driver_id();
  IF v_driver_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'pointId', p_point_id,
      'status', 'failed',
      'code', 'unauthorized',
      'receiptBody', jsonb_build_object('errorCode', 'unauthorized')
    );
  END IF;

  IF p_point_id IS NULL
     OR p_storage_path IS NULL OR btrim(p_storage_path) = ''
     OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
     OR p_payload_hash IS NULL OR btrim(p_payload_hash) = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'pointId', p_point_id,
      'status', 'failed',
      'code', 'validation_failure',
      'receiptBody', jsonb_build_object('errorCode', 'validation_failure')
    );
  END IF;

  v_prefix := v_driver_id::text || '/' || p_point_id::text || '/';
  IF left(p_storage_path, length(v_prefix)) IS DISTINCT FROM v_prefix THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'pointId', p_point_id,
      'status', 'failed',
      'code', 'malformed_storage_path',
      'receiptBody', jsonb_build_object('errorCode', 'malformed_storage_path')
    );
  END IF;

  -- Serialize concurrent completes for this point (same txn as writes).
  SELECT * INTO v_point
  FROM public.delivery_points
  WHERE id = p_point_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'pointId', p_point_id,
      'status', 'failed',
      'code', 'point_not_found',
      'receiptBody', jsonb_build_object('errorCode', 'point_not_found')
    );
  END IF;

  -- Assignment / reassignment check (DB truth, not client driverId).
  IF v_point.driver_id IS DISTINCT FROM v_driver_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'pointId', p_point_id,
      'status', 'failed',
      'code', 'forbidden_assignment',
      'receiptBody', jsonb_build_object('errorCode', 'forbidden_assignment')
    );
  END IF;

  -- Idempotency receipt (own driver only via RLS + explicit filter).
  SELECT * INTO v_receipt
  FROM public.operation_receipts
  WHERE driver_id = v_driver_id
    AND idempotency_key = btrim(p_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF v_receipt.payload_hash IS DISTINCT FROM btrim(p_payload_hash) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'resultCode', 'rejected',
        'pointId', p_point_id,
        'status', 'conflict',
        'code', 'idempotency_payload_mismatch',
        'receiptBody', jsonb_build_object('errorCode', 'idempotency_payload_mismatch')
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'resultCode', 'duplicate',
      'pointId', p_point_id,
      'status', 'completed',
      'code', NULL,
      'receiptBody', jsonb_build_object(
        'resultCode', 'duplicate',
        'pointId', p_point_id,
        'status', 'completed'
      )
    );
  END IF;

  -- Already completed (e.g. prior legacy path) → receipt + duplicate ACK, no second proof.
  IF v_point.status = 'completed' THEN
    v_receipt_body := jsonb_build_object(
      'resultCode', 'duplicate',
      'pointId', p_point_id,
      'status', 'completed'
    );
    INSERT INTO public.operation_receipts (
      driver_id, idempotency_key, operation_type, entity_type, entity_id,
      payload_hash, result_code, result_body
    ) VALUES (
      v_driver_id, btrim(p_idempotency_key), 'DELIVERY_COMPLETE', 'delivery_point',
      p_point_id, btrim(p_payload_hash), 'duplicate', v_receipt_body
    );
    RETURN jsonb_build_object(
      'ok', true,
      'resultCode', 'duplicate',
      'pointId', p_point_id,
      'status', 'completed',
      'code', NULL,
      'receiptBody', v_receipt_body
    );
  END IF;

  IF v_point.status NOT IN ('pending', 'in_progress') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'pointId', p_point_id,
      'status', v_point.status::text,
      'code', 'invalid_status',
      'receiptBody', jsonb_build_object('errorCode', 'invalid_status')
    );
  END IF;

  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    v_location := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::extensions.geography;
  END IF;

  -- Partial legacy: proof exists but point not completed → finish transition (same as Nest repair).
  IF EXISTS (
    SELECT 1 FROM public.delivery_proofs pf WHERE pf.point_id = p_point_id
  ) THEN
    UPDATE public.delivery_points
    SET
      status = 'completed',
      pii_masked_at = COALESCE(pii_masked_at, v_completed_at),
      display_label = COALESCE(NULLIF(display_label, ''), '배송 완료')
    WHERE id = p_point_id
      AND status IS DISTINCT FROM 'completed';

    v_receipt_body := jsonb_build_object(
      'resultCode', 'applied',
      'pointId', p_point_id,
      'status', 'completed'
    );
    INSERT INTO public.operation_receipts (
      driver_id, idempotency_key, operation_type, entity_type, entity_id,
      payload_hash, result_code, result_body
    ) VALUES (
      v_driver_id, btrim(p_idempotency_key), 'DELIVERY_COMPLETE', 'delivery_point',
      p_point_id, btrim(p_payload_hash), 'applied', v_receipt_body
    );
    RETURN jsonb_build_object(
      'ok', true,
      'resultCode', 'applied',
      'pointId', p_point_id,
      'status', 'completed',
      'code', NULL,
      'receiptBody', v_receipt_body
    );
  END IF;

  INSERT INTO public.delivery_proofs (
    point_id, driver_id, storage_path, outcome, completed_at, completed_location
  ) VALUES (
    p_point_id,
    v_driver_id,
    btrim(p_storage_path),
    'completed'::public.proof_outcome,
    v_completed_at,
    v_location
  );

  v_allow_inject := COALESCE(
    current_setting('app.complete_fail_injection', true),
    ''
  ) = 'on';
  IF v_allow_inject AND p_fail_after = 'after_proof' THEN
    RAISE EXCEPTION 'injected_after_proof' USING ERRCODE = 'P0001';
  END IF;

  -- Same fields Nest set; trigger stamps/extends mask label as before.
  UPDATE public.delivery_points
  SET
    status = 'completed',
    pii_masked_at = v_completed_at,
    display_label = '배송 완료'
  WHERE id = p_point_id;

  IF v_allow_inject AND p_fail_after IN ('after_point', 'after_masking') THEN
    RAISE EXCEPTION 'injected_after_point' USING ERRCODE = 'P0001';
  END IF;

  v_receipt_body := jsonb_build_object(
    'resultCode', 'applied',
    'pointId', p_point_id,
    'status', 'completed'
  );

  INSERT INTO public.operation_receipts (
    driver_id, idempotency_key, operation_type, entity_type, entity_id,
    payload_hash, result_code, result_body
  ) VALUES (
    v_driver_id,
    btrim(p_idempotency_key),
    'DELIVERY_COMPLETE',
    'delivery_point',
    p_point_id,
    btrim(p_payload_hash),
    'applied',
    v_receipt_body
  );

  IF v_allow_inject AND p_fail_after = 'after_receipt' THEN
    RAISE EXCEPTION 'injected_after_receipt' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'resultCode', 'applied',
    'pointId', p_point_id,
    'status', 'completed',
    'code', NULL,
    'receiptBody', v_receipt_body
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Whole function body rolled back to here; converge on durable receipt/proof.
    SELECT * INTO v_receipt
    FROM public.operation_receipts
    WHERE driver_id = v_driver_id
      AND idempotency_key = btrim(p_idempotency_key);
    IF FOUND THEN
      IF v_receipt.payload_hash IS DISTINCT FROM btrim(p_payload_hash) THEN
        RETURN jsonb_build_object(
          'ok', false,
          'resultCode', 'rejected',
          'pointId', p_point_id,
          'status', 'conflict',
          'code', 'idempotency_payload_mismatch',
          'receiptBody', jsonb_build_object('errorCode', 'idempotency_payload_mismatch')
        );
      END IF;
      RETURN jsonb_build_object(
        'ok', true,
        'resultCode', 'duplicate',
        'pointId', p_point_id,
        'status', 'completed',
        'code', NULL,
        'receiptBody', jsonb_build_object(
          'resultCode', 'duplicate',
          'pointId', p_point_id,
          'status', 'completed'
        )
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'resultCode', 'rejected',
      'pointId', p_point_id,
      'status', 'failed',
      'code', 'concurrent_conflict',
      'receiptBody', jsonb_build_object('errorCode', 'concurrent_conflict')
    );
END;
$$;

COMMENT ON FUNCTION public.complete_delivery_point_atomic(
  uuid, text, text, text, double precision, double precision, text
) IS
  'Atomic idempotent delivery complete: proof + point completed/mask + receipt in one txn. '
  'Driver identity from current_driver_id() only. result_body has no PII/GPS/secrets. '
  'p_fail_after honored only when app.complete_fail_injection=on (tests).';

REVOKE ALL ON FUNCTION public.complete_delivery_point_atomic(
  uuid, text, text, text, double precision, double precision, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.complete_delivery_point_atomic(
  uuid, text, text, text, double precision, double precision, text
) TO authenticated, service_role;
