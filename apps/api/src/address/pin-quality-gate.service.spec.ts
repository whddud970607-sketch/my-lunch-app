import { applyPinQualityGate } from "./pin-quality-gate.service";
import type { CoordinateCandidate } from "./address.types";

const buildingCandidate: CoordinateCandidate = {
  latitude: 37.425,
  longitude: 126.741,
  provider: "kakao",
  sourceType: "keyword_apartment_dong",
  coordinateType: "BUILDING_CANDIDATE",
  confidence: 0.9,
  evidence: ["kakao_keyword_apartment_dong"],
  resolvedDong: "609",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("pin-quality-gate.service", () => {
  it("accepts building candidate for dong-required address", () => {
    const decision = applyPinQualityGate({
      rankedCandidates: [buildingCandidate],
      requiresDong: true,
      hasProviderConflict: false,
      adjustedConfidences: [0.9],
    });
    expect(decision.candidate).not.toBeNull();
    expect(decision.pinQuality).not.toBe("UNRESOLVED");
    expect(decision.pinAccuracy).toBe("building");
  });

  it("rejects complex-only when dong required", () => {
    const decision = applyPinQualityGate({
      rankedCandidates: [
        {
          ...buildingCandidate,
          coordinateType: "COMPLEX_REPRESENTATIVE",
          confidence: 0.45,
        },
      ],
      requiresDong: true,
      hasProviderConflict: false,
      adjustedConfidences: [0.2],
    });
    expect(decision.candidate).toBeNull();
    expect(decision.unresolvedReason).toBe("dong_required_but_unresolved");
  });
});
