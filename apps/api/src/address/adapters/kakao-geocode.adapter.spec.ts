import { KakaoGeocodeAdapter } from "./kakao-geocode.adapter";
import type { ParsedAddress } from "../address.types";

const ECO_PARSED: ParsedAddress = {
  originalAddress:
    "인천광역시 남동구 서창남순환로 190-100 609동 503호",
  roadAddress: "인천광역시 남동구 서창남순환로 190-100",
  lotAddress: null,
  complexName: "에코에비뉴",
  buildingName: "에코에비뉴",
  dong: "609",
  ho: "503",
  postalCode: null,
  normalizedAddress:
    "인천광역시 남동구 서창남순환로 190-100 609동 503호",
  detailAddress: "609동 503호",
};

describe("KakaoGeocodeAdapter", () => {
  it("returns empty when not configured", async () => {
    const adapter = new KakaoGeocodeAdapter(null);
    expect(adapter.isConfigured()).toBe(false);
    await expect(adapter.resolveCandidates(ECO_PARSED)).resolves.toEqual([]);
  });

  it("resolves apartment-dong BUILDING_CANDIDATE via keyword", async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          documents: [
            {
              x: "126.740740734492",
              y: "37.4243645028928",
              address_type: "ROAD_ADDR",
              road_address: { building_name: "에코에비뉴" },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          documents: [
            {
              x: "126.741",
              y: "37.425",
              place_name: "에코에비뉴 609동",
              category_name: "부동산 > 아파트 동",
              id: "kakao-place-609",
            },
          ],
        }),
      });

    const adapter = new KakaoGeocodeAdapter("test-key", fetchFn);
    const candidates = await adapter.resolveCandidates(ECO_PARSED);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].coordinateType).toBe("BUILDING_CANDIDATE");
    expect(candidates[0].resolvedDong).toBe("609");
    expect(candidates[0].provider).toBe("kakao");
    expect(candidates[0].evidence).toContain("kakao_keyword_apartment_dong");
    expect(candidates[0].coordinateType).not.toBe("BUILDING_VERIFIED");
  });

  it("falls back to address search when dong keyword misses", async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          documents: [
            {
              x: "126.74",
              y: "37.42",
              address_type: "ROAD_ADDR",
              road_address: { building_name: "에코에비뉴" },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ documents: [] }),
      });

    const adapter = new KakaoGeocodeAdapter("test-key", fetchFn);
    const candidates = await adapter.resolveCandidates(ECO_PARSED);

    expect(candidates[0].coordinateType).toBe("BUILDING_CANDIDATE");
    expect(candidates[0].sourceType).toBe("address");
  });
});
