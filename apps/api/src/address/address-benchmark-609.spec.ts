/**
 * PUBLIC/SYNTHETIC benchmark — 에코에비뉴 609동
 * Proves: parse → dong=609 → building candidate → provenance → confidence → pin decision
 * Does NOT claim BUILDING_VERIFIED without verified evidence.
 */
import { parseAddress } from "./address.parser";
import { KakaoGeocodeAdapter } from "./adapters/kakao-geocode.adapter";
import { fuseCandidates } from "./coordinate-fusion.service";
import { scoreCandidateConfidence } from "./confidence-scorer.service";
import { applyPinQualityGate } from "./pin-quality-gate.service";

describe("609동 benchmark (PUBLIC fixture, mocked Kakao)", () => {
  const input = {
    roadAddress: "인천광역시 남동구 서창남순환로 190-100",
    detailAddress: "609동 503호",
    complexName: "에코에비뉴",
  };

  it("end-to-end pipeline for ecoavenue 609동", async () => {
    const parsed = parseAddress(input);
    expect(parsed.dong).toBe("609");

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
              id: "bench-609",
            },
          ],
        }),
      });

    const kakao = new KakaoGeocodeAdapter("bench-key", fetchFn);
    const candidates = await kakao.resolveCandidates(parsed);
    expect(candidates[0].resolvedDong).toBe("609");
    expect(candidates[0].coordinateType).toBe("BUILDING_CANDIDATE");
    expect(candidates[0].evidence).toContain("kakao_keyword_apartment_dong");

    const fusion = fuseCandidates(candidates);
    const adjusted = fusion.ranked.map((c) =>
      scoreCandidateConfidence(c, {
        requiresDong: true,
        hasProviderConflict: fusion.hasConflict,
      }),
    );

    const decision = applyPinQualityGate({
      rankedCandidates: fusion.ranked,
      requiresDong: true,
      hasProviderConflict: fusion.hasConflict,
      adjustedConfidences: adjusted,
    });

    expect(decision.candidate).not.toBeNull();
    expect(decision.pinQuality).toMatch(/CANDIDATE|HIGH_CONFIDENCE/);
    expect(decision.candidate!.coordinateType).not.toBe("BUILDING_VERIFIED");
    expect(decision.pinAccuracy).toBe("building");
  });
});
