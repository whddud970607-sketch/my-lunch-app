import {
  NAVER_LOCAL_COORD_SCALE,
  naverLocalMapToWgs84,
} from "./naver-local-coord";

describe("naverLocalMapToWgs84", () => {
  it("uses WGS84 / 1e7 — no KATECH conversion", () => {
    expect(NAVER_LOCAL_COORD_SCALE).toBe(10_000_000);
    const wgs = naverLocalMapToWgs84(1269873882, 375666103);
    expect(wgs).toEqual({
      longitude: 126.9873882,
      latitude: 37.5666103,
    });
  });

  it("rejects out-of-Korea after scale", () => {
    expect(naverLocalMapToWgs84(100000000, 100000000)).toBeNull();
    expect(naverLocalMapToWgs84("bad", "data")).toBeNull();
  });
});
