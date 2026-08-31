import {
  mapCoordinateTypeToPinQuality,
  scoreCandidateConfidence,
} from "./confidence-scorer.service";
import type { CoordinateCandidate } from "./address.types";

const base: CoordinateCandidate = {
  latitude: 37.42,
  longitude: 126.74,
  provider: "kakao",
  sourceType: "test",
  coordinateType: "BUILDING_CANDIDATE",
  confidence: 0.82,
  evidence: [],
  resolvedDong: "609",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("confidence-scorer.service", () => {
  it("boosts building candidate with dong", () => {
    const score = scoreCandidateConfidence(base, {
      requiresDong: true,
      hasProviderConflict: false,
    });
    expect(score).toBeGreaterThan(0.82);
  });

  it("penalizes complex-only when dong required", () => {
    const score = scoreCandidateConfidence(
      { ...base, coordinateType: "COMPLEX_REPRESENTATIVE", confidence: 0.5 },
      { requiresDong: true, hasProviderConflict: false },
    );
    expect(score).toBeLessThan(0.5);
  });

  it("maps building candidate to candidate/high confidence", () => {
    expect(
      mapCoordinateTypeToPinQuality("BUILDING_CANDIDATE", 0.82, true),
    ).toBe("CANDIDATE");
    expect(
      mapCoordinateTypeToPinQuality("COMPLEX_REPRESENTATIVE", 0.5, true),
    ).toBe("COMPLEX_ONLY");
  });
});
