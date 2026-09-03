import assert from "node:assert/strict";
import test from "node:test";
import { assessBuildingCenterGate } from "./building-center-gate.mjs";

const square = {
  type: "MultiPolygon",
  coordinates: [[[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]],
};

const concaveC = {
  type: "MultiPolygon",
  coordinates: [[[
    [0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [4, 3], [4, 4], [0, 4], [0, 0],
  ]]],
};

test("CUSTOM_INTERIOR_POINT inside verifies BUILDING_CENTER", () => {
  const r = assessBuildingCenterGate(square);
  assert.equal(r.verified, true);
  assert.equal(r.terminal, "BUILDING_CENTER_VERIFIED");
  assert.equal(r.selectedMethod, "CUSTOM_INTERIOR_POINT");
  assert.equal(r.pinProvenance, "BUILDING_CENTER");
  assert.equal(r.interiorPointInside, true);
  assert.ok(r.buildingCenter?.lat != null);
  assert.ok(r.buildingCenter?.lng != null);
});

test("centroid outside does not verify BUILDING_CENTER", () => {
  const r = assessBuildingCenterGate(concaveC);
  assert.equal(r.verified, true);
  assert.equal(r.centroidInside, false);
  assert.equal(r.interiorPointInside, true);
  assert.equal(r.selectedMethod, "CUSTOM_INTERIOR_POINT");
});

test("centroid-only inside path does not verify when interior fails", () => {
  const r = assessBuildingCenterGate(null);
  assert.equal(r.verified, false);
  assert.equal(r.selectedMethod, "NONE");
  assert.equal(r.pinProvenance, null);
  assert.equal(r.buildingCenter, null);
});
