/**
 * Extract WGS84 lat/lng from PostgREST geography / GeoJSON / EWKT / EWKB shapes.
 * Does not log coordinates (caller decides).
 */
export function parsePointLocation(location: unknown): {
  latitude: number;
  longitude: number;
} | null {
  if (!location) return null;

  if (typeof location === "object" && location !== null) {
    const geo = location as {
      type?: string;
      coordinates?: number[];
    };
    if (
      geo.type === "Point" &&
      Array.isArray(geo.coordinates) &&
      geo.coordinates.length >= 2
    ) {
      const longitude = Number(geo.coordinates[0]);
      const latitude = Number(geo.coordinates[1]);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return { latitude, longitude };
      }
    }
  }

  if (typeof location === "string") {
    const m = location.match(
      /POINT\s*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*\)/i,
    );
    if (m) {
      const longitude = Number(m[1]);
      const latitude = Number(m[2]);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return { latitude, longitude };
      }
    }

    const ewkb = parseEwkbPoint(location);
    if (ewkb) return ewkb;
  }

  return null;
}

/**
 * PostgREST often returns geography(Point) as hex EWKB (optionally \\x-prefixed).
 * Supports little-endian Point, with or without SRID.
 */
function parseEwkbPoint(raw: string): {
  latitude: number;
  longitude: number;
} | null {
  const hex = raw.trim().replace(/^\\x/i, "");
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length < 42) {
    return null;
  }

  const buf = Buffer.from(hex, "hex");
  if (buf.length < 21) return null;

  let offset = 0;
  const byteOrder = buf.readUInt8(offset);
  offset += 1;
  const le = byteOrder === 1;
  if (byteOrder !== 0 && byteOrder !== 1) return null;

  const typeWord = le ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
  offset += 4;
  const wkbType = typeWord & 0xff;
  if (wkbType !== 1) return null; // Point only
  if ((typeWord & 0x20000000) !== 0) {
    if (buf.length < offset + 4 + 16) return null;
    offset += 4; // SRID
  }
  if (buf.length < offset + 16) return null;

  const longitude = le
    ? buf.readDoubleLE(offset)
    : buf.readDoubleBE(offset);
  const latitude = le
    ? buf.readDoubleLE(offset + 8)
    : buf.readDoubleBE(offset + 8);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
}

export function mapPointStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "배송 대기";
    case "in_progress":
      return "배송 중";
    case "completed":
      return "배송 완료";
    case "failed":
      return "배송 실패";
    default:
      return status;
  }
}
