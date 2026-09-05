import { isKoreaWgs84 } from "./naver-local-coord";

/** POI coordinate kinds — reverse-verify in this order (testable policy). */
export const TMAP_POI_COORD_PRIORITY = ["noor", "pns", "front"] as const;
export type TmapPoiCoordKind = (typeof TMAP_POI_COORD_PRIORITY)[number];

/**
 * Empty string / whitespace / null / undefined / NaN → no coordinate.
 * Do not use `??` fallback on raw lat/lon ("" is truthy and blocks newLat).
 */
export function parseTmapCoordinateNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type TmapLatLngCandidate = {
  latitude: number;
  longitude: number;
  source: string;
};

/**
 * Pick the first valid Korea WGS84 pair from ordered candidates.
 * Invalid: "", " ", null, undefined, NaN, (0,0), out-of-Korea.
 */
export function firstValidCoordinate(
  ...pairs: Array<{
    lat: unknown;
    lng: unknown;
    source: string;
  }>
): TmapLatLngCandidate | null {
  for (const pair of pairs) {
    const latitude = parseTmapCoordinateNumber(pair.lat);
    const longitude = parseTmapCoordinateNumber(pair.lng);
    if (latitude == null || longitude == null) continue;
    if (latitude === 0 && longitude === 0) continue;
    if (!isKoreaWgs84(latitude, longitude)) continue;
    return { latitude, longitude, source: pair.source };
  }
  return null;
}

/** Geocode response: prefer lat/lon, then new*, front*, entrance* — never via `??`. */
export function firstValidGeocodeCoordinate(coord: {
  lat?: unknown;
  lon?: unknown;
  newLat?: unknown;
  newLon?: unknown;
  frontLat?: unknown;
  frontLon?: unknown;
  entranceLat?: unknown;
  entranceLon?: unknown;
}): TmapLatLngCandidate | null {
  return firstValidCoordinate(
    { lat: coord.lat, lng: coord.lon, source: "lat_lon" },
    { lat: coord.newLat, lng: coord.newLon, source: "newLat_newLon" },
    { lat: coord.frontLat, lng: coord.frontLon, source: "frontLat_frontLon" },
    {
      lat: coord.entranceLat,
      lng: coord.entranceLon,
      source: "entranceLat_entranceLon",
    },
  );
}
