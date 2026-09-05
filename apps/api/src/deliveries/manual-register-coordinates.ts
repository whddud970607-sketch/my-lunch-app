export type ManualCoordinates = {
  latitude: number;
  longitude: number;
};

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Accept only WGS84 ranges. Reject NaN/null/0,0 (not a search result). */
export function sanitizeManualCoordinates(
  latitude: unknown,
  longitude: unknown,
): ManualCoordinates | null {
  const lat = asFiniteNumber(latitude);
  const lng = asFiniteNumber(longitude);
  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { latitude: lat, longitude: lng };
}

export function toLocationEwkt(coords: ManualCoordinates): string {
  return `SRID=4326;POINT(${coords.longitude} ${coords.latitude})`;
}

export type ManualCoordSource =
  | "manual_adjust"
  | "apartment_dong"
  | "base_address";

export type CoordinateSource =
  | "user_adjusted"
  | "user_confirmed"
  | "provider_dong_exact"
  | "provider_base_address"
  | "worker"
  | "pending";

export function toCoordinateSource(
  source: ManualCoordSource,
): CoordinateSource {
  switch (source) {
    case "manual_adjust":
      return "user_adjusted";
    case "apartment_dong":
      return "provider_dong_exact";
    case "base_address":
      return "provider_base_address";
  }
}

/** Map resolver sourceType → register priority bucket. Never promote base to exact. */
export function manualSourceFromDongSourceType(
  sourceType: string | null | undefined,
): ManualCoordSource | null {
  switch (sourceType) {
    case "user_adjusted":
    case "user_confirmed":
      return "manual_adjust";
    case "kakao_exact_dong":
    case "naver_local_exact_dong":
    case "official_exact_building_dong":
      return "apartment_dong";
    // tmap_exact_dong: Open API retention — not a long-term provider final source
    case "tmap_exact_dong":
      return null;
    case "kakao_base_address":
    case "naver_base_geocode":
    case "tmap_base_address":
    case "official_base_address":
      return "base_address";
    default:
      return null;
  }
}

/**
 * Fail-closed gate: when a dong was requested, only verified exact dong
 * or explicit user pin confirmation may finalize registration.
 * Map preview / base representative alone is never enough.
 */
export function assertManualDongRegisterAllowed(args: {
  requestedDong: string | null | undefined;
  exactDongVerified: boolean;
  userPinConfirmed: boolean;
}): { allowed: true } | { allowed: false; code: "manual_pin_confirmation_required" } {
  const dong =
    typeof args.requestedDong === "string"
      ? args.requestedDong.replace(/\s+/g, " ").trim()
      : "";
  if (!dong) return { allowed: true };
  if (args.exactDongVerified === true) return { allowed: true };
  if (args.userPinConfirmed === true) return { allowed: true };
  return { allowed: false, code: "manual_pin_confirmation_required" };
}

/** True only when client asserts explicit pin confirm/adjust (not map open). */
export function isUserPinConfirmedFlag(body: {
  pinAdjusted?: boolean;
  pinConfirmed?: boolean;
}): boolean {
  return body.pinAdjusted === true || body.pinConfirmed === true;
}

/** User pin > dong keyword > base address. Never invent coords. */
export function pickManualCoordinatePriority(args: {
  adjusted: ManualCoordinates | null;
  apartmentDong: ManualCoordinates | null;
  baseAddress: ManualCoordinates | null;
}): { coords: ManualCoordinates; source: ManualCoordSource } | null {
  if (args.adjusted) {
    return { coords: args.adjusted, source: "manual_adjust" };
  }
  if (args.apartmentDong) {
    return { coords: args.apartmentDong, source: "apartment_dong" };
  }
  if (args.baseAddress) {
    return { coords: args.baseAddress, source: "base_address" };
  }
  return null;
}

/**
 * Driver-confirmed pin may replace a representative location.
 * Resolvers/workers must not overwrite driver_verified pins.
 */
export function shouldOverwriteExistingManualLocation(
  driverAdjusted: boolean | undefined,
): boolean {
  return driverAdjusted === true;
}
