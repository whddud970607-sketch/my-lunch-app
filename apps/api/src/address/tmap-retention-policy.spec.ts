import {
  isLongTermPersistableExactCandidate,
  isTmapRetentionRestrictedExact,
  pickPreferredDongCandidate,
  pickTmapVerifiedExactPreview,
  type DongCoordinateCandidate,
} from "./dong-coordinate-candidate";

function exact(
  overrides: Partial<DongCoordinateCandidate> &
    Pick<DongCoordinateCandidate, "provider" | "sourceType">,
): DongCoordinateCandidate {
  return {
    latitude: 37.428292,
    longitude: 126.748615,
    matchedComplex: true,
    matchedDong: "503동",
    requestedDong: "503동",
    matchType: "exact_dong",
    confidence: 0.8,
    evidence: [],
    verification: overrides.provider === "tmap" ? "verified" : "n/a",
    ...overrides,
  };
}

describe("TMAP retention persist policy", () => {
  it("F: TMAP verified exact is never long-term persistable", () => {
    const tmap = exact({
      provider: "tmap",
      sourceType: "tmap_exact_dong",
      verification: "verified",
    });
    expect(isTmapRetentionRestrictedExact(tmap)).toBe(true);
    expect(isLongTermPersistableExactCandidate(tmap)).toBe(false);
    expect(pickPreferredDongCandidate([tmap])).toBeNull();
  });

  it("A: Kakao + TMAP → Kakao preferred for persist", () => {
    const kakao = exact({
      provider: "kakao",
      sourceType: "kakao_exact_dong",
    });
    const tmap = exact({
      provider: "tmap",
      sourceType: "tmap_exact_dong",
      latitude: 37.428327,
      longitude: 126.748573,
      verification: "verified",
    });
    expect(pickPreferredDongCandidate([tmap, kakao])?.sourceType).toBe(
      "kakao_exact_dong",
    );
  });

  it("B: Naver + TMAP → Naver preferred for persist", () => {
    const naver = exact({
      provider: "naver",
      sourceType: "naver_local_exact_dong",
    });
    const tmap = exact({
      provider: "tmap",
      sourceType: "tmap_exact_dong",
      verification: "verified",
    });
    expect(pickPreferredDongCandidate([tmap, naver])?.sourceType).toBe(
      "naver_local_exact_dong",
    );
  });

  it("C: TMAP-only → preview available, not persist pick", () => {
    const tmap = exact({
      provider: "tmap",
      sourceType: "tmap_exact_dong",
      verification: "verified",
    });
    expect(pickPreferredDongCandidate([tmap])).toBeNull();
    expect(pickTmapVerifiedExactPreview([tmap])?.sourceType).toBe(
      "tmap_exact_dong",
    );
  });
});
