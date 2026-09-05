import {
  sanitizeManualCoordinates,
  toLocationEwkt,
} from "./manual-register-coordinates";

describe("sanitizeManualCoordinates", () => {
  it("keeps valid search coordinates", () => {
    expect(sanitizeManualCoordinates(37.42, 126.74)).toEqual({
      latitude: 37.42,
      longitude: 126.74,
    });
    expect(sanitizeManualCoordinates("37.5", "127.0")).toEqual({
      latitude: 37.5,
      longitude: 127.0,
    });
  });

  it("rejects missing, NaN, range, and 0,0", () => {
    expect(sanitizeManualCoordinates(null, 126.74)).toBeNull();
    expect(sanitizeManualCoordinates(37.42, undefined)).toBeNull();
    expect(sanitizeManualCoordinates(Number.NaN, 126.74)).toBeNull();
    expect(sanitizeManualCoordinates(91, 126.74)).toBeNull();
    expect(sanitizeManualCoordinates(37.42, 181)).toBeNull();
    expect(sanitizeManualCoordinates(0, 0)).toBeNull();
  });

  it("builds EWKT without swapping lat/lng", () => {
    expect(toLocationEwkt({ latitude: 37.42, longitude: 126.74 })).toBe(
      "SRID=4326;POINT(126.74 37.42)",
    );
  });
});
