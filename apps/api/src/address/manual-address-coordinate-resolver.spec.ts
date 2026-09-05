import { ManualAddressCoordinateResolver } from "./manual-address-coordinate-resolver";
import { KakaoGeocodeAdapter } from "./adapters/kakao-geocode.adapter";
import { NaverGeocodeAdapter } from "./adapters/naver-geocode.adapter";
import { NaverLocalSearchAdapter } from "./adapters/naver-local-search.adapter";
import { TmapDongAdapter } from "./adapters/tmap-dong.adapter";
import { assertManualDongRegisterAllowed } from "../deliveries/manual-register-coordinates";

describe("ManualAddressCoordinateResolver", () => {
  it("prefers Kakao exact over base; never labels base as exact", async () => {
    const kakaoFetch = jest.fn(async (url: string) => {
      if (url.includes("keyword")) {
        return {
          status: 200,
          json: async () => ({
            documents: [
              {
                place_name: "서창센트럴푸르지오아파트 503동",
                category_name: "부동산 > 아파트 동",
                x: "126.74861487206365",
                y: "37.42829218537658",
              },
              {
                place_name: "인천남동 서창센트럴푸르지오 503동 전기차충전소",
                category_name: "교통,수송 > 자동차 > 전기차 충전소",
                x: "126.74813681079378",
                y: "37.429685938501756",
              },
            ],
          }),
        };
      }
      return { status: 200, json: async () => ({ documents: [] }) };
    });
    const kakao = new KakaoGeocodeAdapter("k", kakaoFetch as never);
    const naverGeocode = new NaverGeocodeAdapter(null, null);
    const naverLocal = new NaverLocalSearchAdapter(null, null);
    const tmap = new TmapDongAdapter(null);
    const resolver = ManualAddressCoordinateResolver.fromAdapters({
      kakao,
      naverGeocode,
      naverLocal,
      tmap,
    });

    const result = await resolver.resolve({
      buildingName: "서창센트럴푸르지오",
      dong: "503",
      roadAddress: "인천광역시 남동구 서창남순환로 55",
      baseLatitude: 37.4296855783311,
      baseLongitude: 126.748136924985,
    });

    expect(result.exactDongFound).toBe(true);
    expect(result.requiresPinConfirmation).toBe(false);
    expect(result.selected?.sourceType).toBe("kakao_exact_dong");
    expect(result.selected?.latitude).toBeCloseTo(37.42829218537658, 6);
    expect(
      result.candidates.some((c) => c.sourceType === "kakao_base_address"),
    ).toBe(true);
    expect(
      result.candidates
        .filter((c) => c.matchType === "base_address")
        .every((c) => c.sourceType !== "kakao_exact_dong"),
    ).toBe(true);
  });

  it("uses Naver local exact when Kakao misses", async () => {
    const kakao = new KakaoGeocodeAdapter(
      "k",
      jest.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ documents: [] }),
      }) as never,
    );
    const naverLocal = new NaverLocalSearchAdapter(
      "id",
      "secret",
      jest.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          items: [
            {
              title: "샘플아파트 503동",
              mapx: "1267486148",
              mapy: "374282921",
            },
          ],
        }),
      }) as never,
    );
    const resolver = ManualAddressCoordinateResolver.fromAdapters({
      kakao,
      naverGeocode: new NaverGeocodeAdapter(null, null),
      naverLocal,
      tmap: new TmapDongAdapter(null),
    });
    const result = await resolver.resolve({
      buildingName: "샘플아파트",
      dong: "503동",
      baseLatitude: 37.43,
      baseLongitude: 126.75,
    });
    expect(result.selected?.sourceType).toBe("naver_local_exact_dong");
    expect(result.exactDongFound).toBe(true);
  });

  it("I: all providers exact miss → base preview + auto registration blocked", async () => {
    const resolver = ManualAddressCoordinateResolver.fromAdapters({
      kakao: new KakaoGeocodeAdapter(null),
      naverGeocode: new NaverGeocodeAdapter(null, null),
      naverLocal: new NaverLocalSearchAdapter(null, null),
      tmap: new TmapDongAdapter(null),
    });
    const result = await resolver.resolve({
      buildingName: "없는아파트",
      dong: "503",
      baseLatitude: 37.43,
      baseLongitude: 126.75,
    });
    expect(result.exactDongFound).toBe(false);
    expect(result.requiresPinConfirmation).toBe(true);
    expect(result.selected?.matchType).toBe("base_address");
    expect(
      assertManualDongRegisterAllowed({
        requestedDong: "503동",
        exactDongVerified: result.exactDongFound,
        userPinConfirmed: false,
      }),
    ).toEqual({
      allowed: false,
      code: "manual_pin_confirmation_required",
    });
  });

  it("J: Kakao exact 503 + Naver miss + TMAP verified 503 → no wrong dong", async () => {
    const kakao = new KakaoGeocodeAdapter(
      "k",
      jest.fn(async (url: string) => {
        if (url.includes("keyword")) {
          return {
            status: 200,
            json: async () => ({
              documents: [
                {
                  place_name: "서창센트럴푸르지오아파트 503동",
                  category_name: "부동산 > 아파트 동",
                  x: "126.74861487206365",
                  y: "37.42829218537658",
                },
              ],
            }),
          };
        }
        return { status: 200, json: async () => ({ documents: [] }) };
      }) as never,
    );
    const naverLocal = new NaverLocalSearchAdapter(null, null);
    const tmapFetch = jest.fn(async (url: string) => {
      if (url.includes("/pois")) {
        return {
          status: 200,
          json: async () => ({
            searchPoiInfo: {
              pois: {
                poi: {
                  name: "서창센트럴푸르지오아파트 503동",
                  noorLat: "37.42832726",
                  noorLon: "126.74857363",
                },
              },
            },
          }),
        };
      }
      if (url.includes("reversegeocoding")) {
        return {
          status: 200,
          json: async () => ({
            addressInfo: { buildingName: "서창센트럴푸르지오 503동" },
          }),
        };
      }
      return { status: 404, json: async () => ({}) };
    });
    const resolver = ManualAddressCoordinateResolver.fromAdapters({
      kakao,
      naverGeocode: new NaverGeocodeAdapter(null, null),
      naverLocal,
      tmap: new TmapDongAdapter("tmap-key", tmapFetch as never),
    });
    const result = await resolver.resolve({
      buildingName: "서창센트럴푸르지오",
      dong: "503",
      baseLatitude: 37.4296855783311,
      baseLongitude: 126.748136924985,
    });
    expect(result.exactDongFound).toBe(true);
    expect(result.selected?.sourceType).toBe("kakao_exact_dong");
    expect(result.selected?.matchedDong).toBe("503동");
    expect(result.selected?.latitude).toBeCloseTo(37.42829218537658, 6);
    const exactPool = result.candidates.filter(
      (c) => c.matchType === "exact_dong",
    );
    expect(exactPool.every((c) => c.matchedDong === "503동")).toBe(true);
    expect(exactPool.some((c) => c.matchedDong === "501동")).toBe(false);
  });

  it("A retention: Kakao + TMAP exact → Kakao final, persistable", async () => {
    const kakao = new KakaoGeocodeAdapter(
      "k",
      jest.fn(async (url: string) => {
        if (url.includes("keyword")) {
          return {
            status: 200,
            json: async () => ({
              documents: [
                {
                  place_name: "서창센트럴푸르지오아파트 503동",
                  category_name: "부동산 > 아파트 동",
                  x: "126.74861487206365",
                  y: "37.42829218537658",
                },
              ],
            }),
          };
        }
        return { status: 200, json: async () => ({ documents: [] }) };
      }) as never,
    );
    const tmapFetch = jest.fn(async (url: string) => {
      if (url.includes("/pois")) {
        return {
          status: 200,
          json: async () => ({
            searchPoiInfo: {
              pois: {
                poi: {
                  name: "서창센트럴푸르지오아파트 503동",
                  noorLat: "37.42832726",
                  noorLon: "126.74857363",
                },
              },
            },
          }),
        };
      }
      return {
        status: 200,
        json: async () => ({
          addressInfo: { buildingName: "서창센트럴푸르지오 503동" },
        }),
      };
    });
    const result = await ManualAddressCoordinateResolver.fromAdapters({
      kakao,
      naverGeocode: new NaverGeocodeAdapter(null, null),
      naverLocal: new NaverLocalSearchAdapter(null, null),
      tmap: new TmapDongAdapter("k", tmapFetch as never),
    }).resolve({
      buildingName: "서창센트럴푸르지오",
      dong: "503",
      baseLatitude: 37.4296855783311,
      baseLongitude: 126.748136924985,
    });
    expect(result.exactDongFound).toBe(true);
    expect(result.requiresPinConfirmation).toBe(false);
    expect(result.selected?.provider).toBe("kakao");
    expect(result.selected?.sourceType).toBe("kakao_exact_dong");
  });

  it("B retention: Naver + TMAP exact → Naver final", async () => {
    const kakao = new KakaoGeocodeAdapter(
      "k",
      jest.fn().mockResolvedValue({
        status: 200,
        json: async () => ({ documents: [] }),
      }) as never,
    );
    const naverLocal = new NaverLocalSearchAdapter(
      "id",
      "secret",
      jest.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          items: [
            {
              title: "샘플아파트 503동",
              mapx: "1267486148",
              mapy: "374282921",
            },
          ],
        }),
      }) as never,
    );
    const tmapFetch = jest.fn(async (url: string) => {
      if (url.includes("/pois")) {
        return {
          status: 200,
          json: async () => ({
            searchPoiInfo: {
              pois: {
                poi: {
                  name: "샘플아파트 503동",
                  noorLat: "37.42830",
                  noorLon: "126.74860",
                },
              },
            },
          }),
        };
      }
      return {
        status: 200,
        json: async () => ({
          addressInfo: { buildingName: "샘플아파트 503동" },
        }),
      };
    });
    const result = await ManualAddressCoordinateResolver.fromAdapters({
      kakao,
      naverGeocode: new NaverGeocodeAdapter(null, null),
      naverLocal,
      tmap: new TmapDongAdapter("k", tmapFetch as never),
    }).resolve({
      buildingName: "샘플아파트",
      dong: "503동",
      baseLatitude: 37.43,
      baseLongitude: 126.75,
    });
    expect(result.exactDongFound).toBe(true);
    expect(result.selected?.sourceType).toBe("naver_local_exact_dong");
    expect(result.requiresPinConfirmation).toBe(false);
  });

  it("C retention: TMAP only exact → confirmation required, not auto-persist", async () => {
    const tmapFetch = jest.fn(async (url: string) => {
      if (url.includes("/pois")) {
        return {
          status: 200,
          json: async () => ({
            searchPoiInfo: {
              pois: {
                poi: {
                  name: "서창센트럴푸르지오아파트 503동",
                  noorLat: "37.42832726",
                  noorLon: "126.74857363",
                },
              },
            },
          }),
        };
      }
      return {
        status: 200,
        json: async () => ({
          addressInfo: { buildingName: "서창센트럴푸르지오 503동" },
        }),
      };
    });
    const result = await ManualAddressCoordinateResolver.fromAdapters({
      kakao: new KakaoGeocodeAdapter(
        "k",
        jest.fn().mockResolvedValue({
          status: 200,
          json: async () => ({ documents: [] }),
        }) as never,
      ),
      naverGeocode: new NaverGeocodeAdapter(null, null),
      naverLocal: new NaverLocalSearchAdapter(null, null),
      tmap: new TmapDongAdapter("k", tmapFetch as never),
    }).resolve({
      buildingName: "서창센트럴푸르지오",
      dong: "503",
      baseLatitude: 37.4296855783311,
      baseLongitude: 126.748136924985,
    });
    expect(result.selected?.sourceType).toBe("tmap_exact_dong");
    expect(result.selected?.verification).toBe("verified");
    expect(result.exactDongFound).toBe(false);
    expect(result.requiresPinConfirmation).toBe(true);
    expect(
      assertManualDongRegisterAllowed({
        requestedDong: "503동",
        exactDongVerified: result.exactDongFound,
        userPinConfirmed: false,
      }).allowed,
    ).toBe(false);
  });
});
