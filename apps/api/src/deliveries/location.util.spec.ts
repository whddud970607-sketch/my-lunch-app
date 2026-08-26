import { parsePointLocation } from "./location.util";

describe("parsePointLocation", () => {
  it("parses GeoJSON Point", () => {
    expect(
      parsePointLocation({
        type: "Point",
        coordinates: [126.748136924985, 37.4296855783311],
      }),
    ).toEqual({
      longitude: 126.748136924985,
      latitude: 37.4296855783311,
    });
  });

  it("parses WKT POINT", () => {
    expect(
      parsePointLocation("POINT(126.748136924985 37.4296855783311)"),
    ).toEqual({
      longitude: 126.748136924985,
      latitude: 37.4296855783311,
    });
  });

  it("parses PostGIS EWKB Point with SRID (little-endian)", () => {
    // Built to match known WGS84 point used by map spike seed.
    const longitude = 126.748136924985;
    const latitude = 37.4296855783311;
    const parts: number[] = [];
    parts.push(1); // LE
    // type Point | SRID flag = 0x20000001
    const type = 0x20000001;
    parts.push(type & 0xff, (type >> 8) & 0xff, (type >> 16) & 0xff, (type >> 24) & 0xff);
    const srid = 4326;
    parts.push(srid & 0xff, (srid >> 8) & 0xff, (srid >> 16) & 0xff, (srid >> 24) & 0xff);
    const lonBuf = Buffer.alloc(8);
    lonBuf.writeDoubleLE(longitude, 0);
    const latBuf = Buffer.alloc(8);
    latBuf.writeDoubleLE(latitude, 0);
    const hex =
      Buffer.from(parts).toString("hex") +
      lonBuf.toString("hex") +
      latBuf.toString("hex");

    const parsed = parsePointLocation(hex);
    expect(parsed).not.toBeNull();
    expect(parsed!.longitude).toBeCloseTo(longitude, 8);
    expect(parsed!.latitude).toBeCloseTo(latitude, 8);
  });
});
