import {
  detectCoordinateConflict,
  fuseCandidates,
  rankCoordinateCandidates,
} from "./coordinate-fusion.service";
import type { CoordinateCandidate } from "./address.types";

function candidate(
  partial: Partial<CoordinateCandidate> & Pick<CoordinateCandidate, "provider">,
): CoordinateCandidate {
  return {
    latitude: partial.latitude ?? 37.42,
    longitude: partial.longitude ?? 126.74,
    provider: partial.provider,
    sourceType: partial.sourceType ?? "test",
    coordinateType: partial.coordinateType ?? "BUILDING_CANDIDATE",
    confidence: partial.confidence ?? 0.7,
    evidence: partial.evidence ?? [],
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
    resolvedDong: partial.resolvedDong ?? null,
  };
}

describe("coordinate-fusion.service", () => {
  it("ranks verified types above complex representative", () => {
    const ranked = rankCoordinateCandidates([
      candidate({
        provider: "kakao",
        coordinateType: "COMPLEX_REPRESENTATIVE",
        confidence: 0.9,
      }),
      candidate({
        provider: "naver",
        coordinateType: "BUILDING_CANDIDATE",
        confidence: 0.7,
      }),
    ]);
    expect(ranked[0].coordinateType).toBe("BUILDING_CANDIDATE");
  });

  it("detects provider conflict when far apart", () => {
    const { hasConflict, conflictProviders } = detectCoordinateConflict([
      candidate({ provider: "kakao", latitude: 37.42, longitude: 126.74 }),
      candidate({ provider: "naver", latitude: 37.5, longitude: 127.0 }),
    ]);
    expect(hasConflict).toBe(true);
    expect(conflictProviders.sort()).toEqual(["kakao", "naver"]);
  });

  it("fuseCandidates returns ranked list", () => {
    const fusion = fuseCandidates([
      candidate({ provider: "kakao", confidence: 0.5 }),
      candidate({ provider: "naver", confidence: 0.8 }),
    ]);
    expect(fusion.ranked.length).toBe(2);
  });
});
