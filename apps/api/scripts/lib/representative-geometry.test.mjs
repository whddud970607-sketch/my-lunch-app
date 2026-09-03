import assert from "node:assert/strict";
import test from "node:test";
import {
  customInteriorPointMultiPolygon,
  customInteriorPointPolygon,
  multiPolygonCentroid,
  pointInMultiPolygon,
  pointInPolygonWithHoles,
  polygonCentroidWithHoles,
} from "./representative-geometry.mjs";

const square = [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]];
const squareCw = [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]];

const concaveC = [[
  [0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [4, 3], [4, 4], [0, 4], [0, 0],
]];

const squareWithHole = [
  [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
  [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]],
];

const multi = [
  [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
  [[[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]]],
];

test("simple polygon centroid is inside (ccw and cw)", () => {
  for (const poly of [square, squareCw]) {
    const c = polygonCentroidWithHoles(poly);
    assert.ok(c);
    assert.ok(Math.abs(c[0] - 1) < 1e-9);
    assert.ok(Math.abs(c[1] - 1) < 1e-9);
    assert.equal(pointInPolygonWithHoles(c, poly), true);
  }
});

test("concave polygon centroid can be outside", () => {
  const c = polygonCentroidWithHoles(concaveC);
  assert.ok(c);
  assert.equal(pointInPolygonWithHoles(c, concaveC), false);
});

test("polygon with hole centroid is orientation-independent", () => {
  const holeCw = [
    [[0, 0], [0, 4], [4, 4], [4, 0], [0, 0]],
    [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]],
  ];
  const c1 = polygonCentroidWithHoles(squareWithHole);
  const c2 = polygonCentroidWithHoles(holeCw);
  assert.ok(c1 && c2);
  assert.ok(Math.abs(c1[0] - c2[0]) < 1e-9);
  assert.ok(Math.abs(c1[1] - c2[1]) < 1e-9);
});

test("multipolygon centroid may fall outside disjoint parts", () => {
  const c = multiPolygonCentroid(multi);
  assert.ok(c);
  assert.ok(Math.abs(c[0] - 1.5) < 1e-9);
  assert.ok(Math.abs(c[1] - 0.5) < 1e-9);
  assert.equal(pointInMultiPolygon(c, multi), false);
});

test("multipolygon custom interior point is inside union", () => {
  const r = customInteriorPointMultiPolygon(multi);
  assert.ok(r.point);
  assert.equal(r.method, "CUSTOM_INTERIOR_POINT");
  assert.equal(pointInMultiPolygon(r.point, multi), true);
});

test("custom interior point is inside for centroid-outside concave case", () => {
  const r = customInteriorPointPolygon(concaveC);
  assert.ok(r.point);
  assert.equal(r.method, "CUSTOM_INTERIOR_POINT");
  assert.equal(pointInPolygonWithHoles(r.point, concaveC), true);
});

test("custom interior point handles polygon with hole", () => {
  const r = customInteriorPointPolygon(squareWithHole);
  assert.ok(r.point);
  assert.equal(pointInPolygonWithHoles(r.point, squareWithHole), true);
});
