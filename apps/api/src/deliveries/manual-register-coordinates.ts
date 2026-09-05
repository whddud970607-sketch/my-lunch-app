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
