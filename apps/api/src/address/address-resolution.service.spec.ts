import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { AddressResolutionService } from "./address-resolution.service";
import { KakaoGeocodeAdapter } from "./adapters/kakao-geocode.adapter";
import { NaverGeocodeAdapter } from "./adapters/naver-geocode.adapter";

describe("AddressResolutionService (integration, mocked providers)", () => {
  const ecoInput = {
    roadAddress: "인천광역시 남동구 서창남순환로 190-100",
    detailAddress: "609동 503호",
    complexName: "에코에비뉴",
  };

  function mockFetchSequence() {
    return jest
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
              id: "kakao-609",
            },
          ],
        }),
      });
  }

  it("orchestrates kakao primary and returns building candidate for 609동", async () => {
    const fetchFn = mockFetchSequence();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AddressResolutionService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === "KAKAO_REST_API_KEY" ? "test-kakao" : undefined,
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(AddressResolutionService);
    // Inject mocked fetch via private adapters — patch after construction
    (service as unknown as { kakao: KakaoGeocodeAdapter }).kakao =
      new KakaoGeocodeAdapter("test-kakao", fetchFn);

    const result = await service.resolve(ecoInput);

    expect(result.parsed.dong).toBe("609");
    expect(result.decision.candidate).not.toBeNull();
    expect(result.decision.candidate!.resolvedDong).toBe("609");
    expect(result.decision.candidate!.coordinateType).toBe("BUILDING_CANDIDATE");
    expect(result.decision.candidate!.coordinateType).not.toBe("BUILDING_VERIFIED");
    expect(result.decision.pinQuality).not.toBe("UNRESOLVED");
  });

  it("returns unresolved when no provider configured", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AddressResolutionService,
        {
          provide: ConfigService,
          useValue: { get: () => undefined },
        },
      ],
    }).compile();

    const result = await moduleRef.get(AddressResolutionService).resolve(ecoInput);
    expect(result.decision.candidate).toBeNull();
    expect(result.decision.unresolvedReason).toBe("provider_not_configured");
  });

  it("invokes secondary naver when kakao confidence insufficient", async () => {
    const kakaoFetch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          documents: [
            {
              x: "126.74",
              y: "37.42",
              address_type: "ROAD_ADDR",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ documents: [] }),
      });

    const naverFetch = jest.fn().mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        addresses: [{ x: "126.7415", y: "37.4255" }],
      }),
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AddressResolutionService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === "KAKAO_REST_API_KEY") return "kakao-key";
              if (key === "NAVER_MAP_CLIENT_ID") return "naver-id";
              if (key === "NAVER_MAP_CLIENT_SECRET") return "naver-secret";
              return undefined;
            },
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(AddressResolutionService);
    (service as unknown as { kakao: KakaoGeocodeAdapter }).kakao =
      new KakaoGeocodeAdapter("kakao-key", kakaoFetch);
    (service as unknown as { naver: NaverGeocodeAdapter }).naver =
      new NaverGeocodeAdapter("naver-id", "naver-secret", naverFetch);

    const result = await service.resolve({
      roadAddress: "인천광역시 남동구 서창남순환로 190-100",
    });

    expect(naverFetch).toHaveBeenCalled();
    expect(result.decision.allCandidates.some((c) => c.provider === "naver")).toBe(
      true,
    );
  });

  it("handles provider failure gracefully", async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error("network"));
    const moduleRef = await Test.createTestingModule({
      providers: [
        AddressResolutionService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === "KAKAO_REST_API_KEY" ? "test-kakao" : undefined,
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(AddressResolutionService);
    (service as unknown as { kakao: KakaoGeocodeAdapter }).kakao =
      new KakaoGeocodeAdapter("test-kakao", fetchFn);

    const result = await service.resolve(ecoInput);
    expect(result.decision.candidate).toBeNull();
    expect(result.decision.unresolvedReason).toBe("no_candidates");
  });
});
