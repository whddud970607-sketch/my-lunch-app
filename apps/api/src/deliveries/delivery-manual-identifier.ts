/**
 * Internal manual shipment identifier — not a carrier tracking number.
 * Deterministic from commit idempotency key. Namespace is app-layer only.
 */
export const DRIVER_MANUAL_SOURCE_KEY = "driver-manual";
export const DRIVER_MANUAL_SOURCE_DISPLAY_NAME = "직접 등록";
export const MANUAL_TRACKING_PREFIX = "dsman_";

export function manualTrackingFromIdempotencyKey(key: string): string {
  const compact = key.trim().replace(/-/g, "").toLowerCase();
  return `${MANUAL_TRACKING_PREFIX}${compact}`;
}

export function isManualTrackingCode(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(MANUAL_TRACKING_PREFIX));
}
