import assert from "node:assert/strict";
import test from "node:test";
import { buildPnu, mapPlatGbToPnuField } from "./pnu-builder.mjs";

test("platGbCd 0 maps to PNU field 1", () => {
  const m = mapPlatGbToPnuField("0");
  assert.equal(m.ok, true);
  assert.equal(m.pnuField, "1");
});

test("platGbCd 1 maps to PNU field 2", () => {
  const m = mapPlatGbToPnuField("1");
  assert.equal(m.ok, true);
  assert.equal(m.pnuField, "2");
});

test("unsupported platGbCd rejected", () => {
  const m = mapPlatGbToPnuField("2");
  assert.equal(m.ok, false);
});

test("buildPnu produces 19 digits", () => {
  const r = buildPnu({
    sigunguCd: "28200",
    bjdongCd: "10500",
    platGbCd: "0",
    bun: "0695",
    ji: "0000",
  });
  assert.equal(r.ok, true);
  assert.equal(r.pnu, "2820010500106950000");
  assert.equal(r.pnu.length, 19);
});

test("invalid sigungu rejected", () => {
  const r = buildPnu({
    sigunguCd: "abc",
    bjdongCd: "10500",
    platGbCd: "0",
    bun: "0695",
    ji: "0000",
  });
  assert.equal(r.ok, false);
});
