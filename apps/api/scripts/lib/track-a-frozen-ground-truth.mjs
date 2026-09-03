/**
 * Frozen Track A replacement benchmark ground truth.
 * Do not modify based on pipeline results.
 */

export const CALIBRATION_ANCHOR_ID = "PUBLIC_609";

export const DISCARDED_LEGACY_TARGET_IDS = ["T01", "T07", "T09"];

export const FROZEN_TRACK_A_GROUND_TRUTH = [
  {
    targetId: "R01",
    roadAddress: "인천광역시 남동구 서창남순환로 55",
    expectedComplex: "서창센트럴푸르지오",
    expectedComplexNormalized: "서창센트럴푸르지오",
    expectedDong: "504동",
    parsedDong: "504",
    kind: "아파트",
    syntheticDetailAddress: "테스트아파트 504동 1201호",
  },
  {
    targetId: "R02",
    roadAddress: "인천광역시 남동구 소래역남로 40",
    expectedComplex: "에코메트로3차 더타워",
    expectedComplexNormalized: "에코메트로3차더타워",
    expectedDong: "A동",
    parsedDong: "A",
    kind: "주상복합",
    syntheticDetailAddress: "테스트아파트 A동 502호",
  },
  {
    targetId: "R03",
    roadAddress: "인천광역시 남동구 호구포로 803",
    expectedComplex: "롯데캐슬골드",
    expectedComplexNormalized: "롯데캐슬골드",
    expectedDong: "2301동",
    parsedDong: "2301",
    kind: "아파트",
    syntheticDetailAddress: "테스트아파트 2301동 1103호",
  },
];
