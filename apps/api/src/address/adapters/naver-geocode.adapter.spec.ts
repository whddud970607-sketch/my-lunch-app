import { NaverGeocodeAdapter } from "./naver-geocode.adapter";
import type { ParsedAddress } from "../address.types";

const parsed: ParsedAddress = {
  originalAddress: "서울특별시 강남구 테헤란로 152",
  roadAddress: "서울특별시 강남구 테헤란로 152",
  lotAddress: null,
  complexName: null,
  buildingName: null,
  dong: null,
  ho: null,
  postalCode: null,
  normalizedAddress: "서울특별시 강남구 테헤란로 152",
  detailAddress: null,
};

describe("NaverGeocodeAdapter", () => {
  it("returns empty when not configured", async () => {
    const adapter = new NaverGeocodeAdapter(null, null);
    await expect(adapter.resolveCandidates(parsed)).resolves.toEqual([]);
  });

  it("normalizes geocode v2 response", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        addresses: [{ x: "127.0276", y: "37.4979" }],
      }),
    });
    const adapter = new NaverGeocodeAdapter("id", "secret", fetchFn);
    const candidates = await adapter.resolveCandidates(parsed);
    expect(candidates[0].provider).toBe("naver");
    expect(candidates[0].coordinateType).toBe("COMPLEX_REPRESENTATIVE");
  });
});
