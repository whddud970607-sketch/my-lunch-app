/**
 * TRACK A pilot manifest — frozen R01/R02/R03 replacement benchmarks.
 * Legacy T01/T07/T09 (FIXTURE_INVALID) excluded from denominator.
 */

import {
  CALIBRATION_ANCHOR_ID,
  DISCARDED_LEGACY_TARGET_IDS,
  FROZEN_TRACK_A_GROUND_TRUTH,
} from "./track-a-frozen-ground-truth.mjs";

export { CALIBRATION_ANCHOR_ID, DISCARDED_LEGACY_TARGET_IDS };

export const TRACK_A_TARGETS = FROZEN_TRACK_A_GROUND_TRUTH.map((t) => ({
  targetId: t.targetId,
  fixtureKey: `fixture:track-a:${t.targetId.toLowerCase()}`,
  roadAddress: t.roadAddress,
  detailAddress: t.syntheticDetailAddress,
  parsedDong: t.parsedDong,
  expectedBuldNmDc: t.expectedDong,
  complexNameHint: t.expectedComplex,
  expectedComplexNormalized: t.expectedComplexNormalized,
  kind: t.kind,
}));

export function getTrackATarget(targetId) {
  return TRACK_A_TARGETS.find((t) => t.targetId === targetId) ?? null;
}
