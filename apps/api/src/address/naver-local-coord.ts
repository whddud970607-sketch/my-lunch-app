/**
 * Naver Local Search mapx/mapy → internal WGS84.
 * Official (2023-08-25+): WGS84 scaled by 1e7. No KATECH conversion.
 */
export const NAVER_LOCAL_COORD_SCALE = 10_000_000;

const KOREA_LAT_MIN = 33;
const KOREA_LAT_MAX = 39;
const KOREA_LNG_MIN = 124;
const KOREA_LNG_MAX = 132;

export type Wgs84LatLng = { latitude: number; longitude: number };

/** lng = mapx/1e7, lat = mapy/1e7. Rejects out-of-Korea / non-finite. */
export function naverLocalMapToWgs84(
  mapx: unknown,
  mapy: unknown,
): Wgs84LatLng | null {
  const x = typeof mapx === "number" ? mapx : Number(String(mapx ?? "").trim());
  const y = typeof mapy === "number" ? mapy : Number(String(mapy ?? "").trim());
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const longitude = x / NAVER_LOCAL_COORD_SCALE;
  const latitude = y / NAVER_LOCAL_COORD_SCALE;
  if (!isKoreaWgs84(latitude, longitude)) return null;
  return { latitude, longitude };
}

export function isKoreaWgs84(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= KOREA_LAT_MIN &&
    latitude <= KOREA_LAT_MAX &&
    longitude >= KOREA_LNG_MIN &&
    longitude <= KOREA_LNG_MAX
  );
}
