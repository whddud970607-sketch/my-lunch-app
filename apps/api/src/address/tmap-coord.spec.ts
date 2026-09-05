import {
  firstValidCoordinate,
  firstValidGeocodeCoordinate,
  parseTmapCoordinateNumber,
  TMAP_POI_COORD_PRIORITY,
} from "./tmap-coord";

describe("tmap-coord parser", () => {
  it("H: lat=\"\" / lon=\"\" + newLat/newLon valid → picks new*", () => {
    const picked = firstValidGeocodeCoordinate({
      lat: "",
      lon: "",
      newLat: "37.429699",
      newLon: "126.748144",
    });
    expect(picked).toEqual({
      latitude: 37.429699,
      longitude: 126.748144,
      source: "newLat_newLon",
    });
  });

  it("rejects whitespace, null, NaN, 0,0, out-of-Korea", () => {
    expect(parseTmapCoordinateNumber("")).toBeNull();
    expect(parseTmapCoordinateNumber(" ")).toBeNull();
    expect(parseTmapCoordinateNumber(null)).toBeNull();
    expect(parseTmapCoordinateNumber(undefined)).toBeNull();
    expect(parseTmapCoordinateNumber(Number.NaN)).toBeNull();
    expect(
      firstValidCoordinate({ lat: 0, lng: 0, source: "z" }),
    ).toBeNull();
    expect(
      firstValidCoordinate({ lat: 10, lng: 126.7, source: "z" }),
    ).toBeNull();
  });

  it("exports POI coord priority noor → pns → front", () => {
    expect([...TMAP_POI_COORD_PRIORITY]).toEqual(["noor", "pns", "front"]);
  });
});
