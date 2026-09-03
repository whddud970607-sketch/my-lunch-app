import assert from "node:assert/strict";
import test from "node:test";
import { FROZEN_TRACK_A_GROUND_TRUTH } from "./track-a-frozen-ground-truth.mjs";
import { DISCARDED_LEGACY_TARGET_IDS, TRACK_A_TARGETS } from "./track-a-manifest.mjs";

test("manifest uses R01/R02/R03 only", () => {
  assert.deepEqual(
    TRACK_A_TARGETS.map((t) => t.targetId),
    ["R01", "R02", "R03"],
  );
});

test("discarded legacy targets not in manifest", () => {
  const ids = TRACK_A_TARGETS.map((t) => t.targetId);
  for (const legacy of DISCARDED_LEGACY_TARGET_IDS) {
    assert.equal(ids.includes(legacy), false, `${legacy} must stay excluded`);
  }
});

test("manifest matches frozen ground truth exactly", () => {
  for (const frozen of FROZEN_TRACK_A_GROUND_TRUTH) {
    const manifest = TRACK_A_TARGETS.find((t) => t.targetId === frozen.targetId);
    assert.ok(manifest, frozen.targetId);
    assert.equal(manifest.roadAddress, frozen.roadAddress);
    assert.equal(manifest.expectedBuldNmDc, frozen.expectedDong);
    assert.equal(manifest.parsedDong, frozen.parsedDong);
    assert.equal(manifest.complexNameHint, frozen.expectedComplex);
    assert.equal(manifest.expectedComplexNormalized, frozen.expectedComplexNormalized);
    assert.equal(manifest.detailAddress, frozen.syntheticDetailAddress);
  }
});

test("frozen R01/R02/R03 dong labels", () => {
  assert.equal(TRACK_A_TARGETS.find((t) => t.targetId === "R01").expectedBuldNmDc, "504동");
  assert.equal(TRACK_A_TARGETS.find((t) => t.targetId === "R02").expectedBuldNmDc, "A동");
  assert.equal(TRACK_A_TARGETS.find((t) => t.targetId === "R03").expectedBuldNmDc, "2301동");
});
