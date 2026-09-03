import assert from "node:assert/strict";
import test from "node:test";
import {
  assessComplexNameMatch,
  formatDongLabel,
  matchBuildingRegisterIdentity,
  matchDongNm,
  parseDongSemanticLabel,
} from "./building-identity-matcher.mjs";

const row = (dongNm, bldNm) => ({ dongNm, bldNm });

test("504 ↔ 504동 = MATCH", () => {
  assert.equal(matchDongNm("504", "504동"), true);
  assert.equal(matchDongNm("504동", "504"), true);
});

test("504동 ↔ 504동 = MATCH", () => {
  assert.equal(matchDongNm("504동", "504동"), true);
});

test("2301 ↔ 2301동 = MATCH", () => {
  assert.equal(matchDongNm("2301", "2301동"), true);
});

test("2301동 ↔ 2301동 = MATCH", () => {
  assert.equal(matchDongNm("2301동", "2301동"), true);
});

test("A ↔ A동 = MATCH", () => {
  assert.equal(matchDongNm("A", "A동"), true);
  assert.equal(matchDongNm("A동", "A"), true);
});

test("A동 ↔ A동 = MATCH", () => {
  assert.equal(matchDongNm("A동", "A동"), true);
});

test("case normalization: a ↔ A동 = MATCH", () => {
  assert.equal(matchDongNm("a", "A동"), true);
  assert.equal(matchDongNm("a동", "A동"), true);
});

test("B동 ↔ A동 = NO_MATCH", () => {
  assert.equal(matchDongNm("B동", "A동"), false);
});

test("AA동 ↔ A동 = NO_MATCH", () => {
  assert.equal(matchDongNm("AA동", "A동"), false);
  assert.equal(parseDongSemanticLabel("AA동"), null);
});

test("2301동 ↔ 301동 = NO_MATCH", () => {
  assert.equal(matchDongNm("2301동", "301동"), false);
});

test("504동 ↔ 505동 = NO_MATCH", () => {
  assert.equal(matchDongNm("504동", "505동"), false);
});

test("empty/invalid label = NO_MATCH", () => {
  assert.equal(matchDongNm("", "504동"), false);
  assert.equal(matchDongNm("504동", ""), false);
  assert.equal(matchDongNm(null, "504동"), false);
  assert.equal(parseDongSemanticLabel("경비실"), null);
  assert.equal(formatDongLabel(""), null);
  assert.equal(formatDongLabel("A"), "A동");
  assert.equal(formatDongLabel("504"), "504동");
  assert.equal(formatDongLabel("2301"), "2301동");
});

test("R01 register identity — 504동", () => {
  const r = matchBuildingRegisterIdentity([row("504동", "서창센트럴푸르지오")], {
    dong: "504",
    complexNameHint: "서창센트럴푸르지오",
  });
  assert.equal(r.dongMatch, "YES");
  assert.equal(r.identityVerified, true);
});

test("R02 register identity — A동", () => {
  const r = matchBuildingRegisterIdentity([row("A동", "에코메트로3차 더타워")], {
    dong: "A",
    complexNameHint: "에코메트로3차 더타워",
  });
  assert.equal(r.dongMatch, "YES");
  assert.equal(r.expectedDongLabel, "A동");
  assert.equal(r.identityVerified, true);
});

test("R03 register identity — 2301동", () => {
  const r = matchBuildingRegisterIdentity([row("2301동", "롯데캐슬골드")], {
    dong: "2301",
    complexNameHint: "롯데캐슬골드",
  });
  assert.equal(r.dongMatch, "YES");
  assert.equal(r.identityVerified, true);
});

test("dong not found", () => {
  const r = matchBuildingRegisterIdentity([row("505동", "서창센트럴푸르지오")], {
    dong: "504",
    complexNameHint: "서창센트럴푸르지오",
  });
  assert.equal(r.dongMatch, "NO");
  assert.equal(r.failureReason, "REGISTER_DONG_NOT_FOUND");
});

test("duplicate dong ambiguous", () => {
  const r = matchBuildingRegisterIdentity(
    [row("A동", "에코메트로3차 더타워"), row("A동", "에코메트로3차 더타워")],
    { dong: "A", complexNameHint: "에코메트로3차 더타워" },
  );
  assert.equal(r.dongMatch, "AMBIGUOUS");
});

test("complex exact normalized", () => {
  const c = assessComplexNameMatch("에코 에비뉴", "에코에비뉴");
  assert.equal(c.status, "EXACT_NORMALIZED");
});

test("complex mismatch separated from dong", () => {
  const r = matchBuildingRegisterIdentity([row("2301동", "다른단지")], {
    dong: "2301",
    complexNameHint: "롯데캐슬골드",
  });
  assert.equal(r.dongMatch, "YES");
  assert.equal(r.complexNameMatch, "MISMATCH");
  assert.equal(r.identityVerified, false);
});

test("REGISTER_COMPOUND_CORE_MATCH — R02 compound legal bldNm", () => {
  const c = assessComplexNameMatch(
    "에코메트로3차더타워판매시설AB아파트",
    "에코메트로3차 더타워",
    { dongToken: "A" },
  );
  assert.equal(c.status, "REGISTER_COMPOUND_CORE_MATCH");
  assert.equal(c.matchedCore, "에코메트로3차더타워");
  assert.equal(c.guardResult.passed, true);
});

test("REGISTER_COMPOUND_CORE_MATCH — simple suffix ABC아파트", () => {
  const c = assessComplexNameMatch("ABC아파트", "ABC");
  assert.equal(c.status, "REGISTER_COMPOUND_CORE_MATCH");
});

test("REGISTER_COMPOUND_CORE_MATCH — ABC아파트주차장", () => {
  const c = assessComplexNameMatch("ABC아파트주차장", "ABC아파트");
  assert.equal(c.status, "REGISTER_COMPOUND_CORE_MATCH");
});

test("R02 register identity — compound legal bldNm with A dong", () => {
  const r = matchBuildingRegisterIdentity(
    [row("A", "에코메트로3차더타워판매시설AB아파트")],
    { dong: "A", complexNameHint: "에코메트로3차 더타워" },
  );
  assert.equal(r.dongMatch, "YES");
  assert.equal(r.complexNameMatch, "REGISTER_COMPOUND_CORE_MATCH");
  assert.equal(r.identityVerified, true);
});

test("compound match requires CORE prefix — XYZABC아파트", () => {
  const c = assessComplexNameMatch("XYZABC아파트", "ABC");
  assert.equal(c.status, "MISMATCH");
  assert.equal(c.guardResult.violations[0].reason, "UNPARSEABLE_PREFIX");
});

test("compound match rejects unparsed remainder ABCDEF", () => {
  const c = assessComplexNameMatch("ABCDEF", "ABC");
  assert.equal(c.status, "MISMATCH");
});

test("phase guard — 에코메트로3차 vs 에코메트로2차", () => {
  const c = assessComplexNameMatch("에코메트로2차더타워", "에코메트로3차");
  assert.equal(c.status, "MISMATCH");
});

test("danji guard — ABC아파트 vs ABC아파트2단지", () => {
  const c = assessComplexNameMatch("ABC아파트2단지", "ABC아파트");
  assert.equal(c.status, "MISMATCH");
  assert.equal(c.guardResult.violations.some((v) => v.guard === "DANJI"), true);
});

test("danji guard — ABC1단지 vs ABC2단지", () => {
  const c = assessComplexNameMatch("ABC2단지", "ABC1단지");
  assert.equal(c.status, "MISMATCH");
});

test("tower guard — ABC A타워 vs ABC B타워", () => {
  const c = assessComplexNameMatch("ABCB타워", "ABCA타워");
  assert.equal(c.status, "MISMATCH");
});

test("tower guard — ABC B타워 with dong A", () => {
  const c = assessComplexNameMatch("ABCB타워", "ABC", { dongToken: "A" });
  assert.equal(c.status, "MISMATCH");
});

test("compound AB remainder requires dong context", () => {
  const c = assessComplexNameMatch("에코메트로3차더타워판매시설AB아파트", "에코메트로3차더타워");
  assert.equal(c.status, "MISMATCH");
  assert.equal(
    c.guardResult.violations.some((v) => v.reason === "REMAINDER_TOWER_LETTERS_NEED_DONG_CONTEXT"),
    true,
  );
});

test("EXACT_NORMALIZED regression — whitespace", () => {
  const c = assessComplexNameMatch("에코 에비뉴", "에코에비뉴");
  assert.equal(c.status, "EXACT_NORMALIZED");
  assert.equal(c.matchedCore, "에코에비뉴");
});

test("REGISTER_STRUCTURED_PREFIX_CORE_MATCH — R02 live bldNm", () => {
  const c = assessComplexNameMatch(
    "인천 소래논현구역 C10블록 에코메트로 3차 더 타워",
    "에코메트로3차 더타워",
    { dongToken: "A" },
  );
  assert.equal(c.status, "REGISTER_STRUCTURED_PREFIX_CORE_MATCH");
  assert.equal(c.matchedCore, "에코메트로3차더타워");
  assert.equal(c.structuredPrefix.administrativeZone, "인천소래논현구역");
  assert.deepEqual(c.structuredPrefix.blocks, ["C10블록"]);
  assert.equal(c.structuredPrefix.blockContext, "ADDITIONAL_REGISTER_CONTEXT");
});

test("R02 live register identity — structured prefix match", () => {
  const r = matchBuildingRegisterIdentity(
    [row("A", "인천 소래논현구역 C10블록 에코메트로 3차 더 타워")],
    { dong: "A", complexNameHint: "에코메트로3차 더타워" },
  );
  assert.equal(r.dongMatch, "YES");
  assert.equal(r.complexNameMatch, "REGISTER_STRUCTURED_PREFIX_CORE_MATCH");
  assert.equal(r.identityVerified, true);
});

test("structured prefix generic — 한남도시개발구역 C10블록 ABC아파트", () => {
  const c = assessComplexNameMatch("한남도시개발구역C10블록ABC아파트", "ABC아파트");
  assert.equal(c.status, "REGISTER_STRUCTURED_PREFIX_CORE_MATCH");
});

test("structured prefix + compound suffix — 한남지구 2블록 ABC아파트 주차장", () => {
  const c = assessComplexNameMatch("한남지구2블록ABC아파트주차장", "ABC아파트");
  assert.equal(c.status, "REGISTER_STRUCTURED_PREFIX_CORE_MATCH");
});

test("block conflict — frozen C10블록 vs register C11블록", () => {
  const c = assessComplexNameMatch("C11블록ABCC10블록", "ABCC10블록");
  assert.equal(c.status, "MISMATCH");
  assert.equal(c.guardResult.violations.some((v) => v.reason === "BLOCK_IDENTITY_MISMATCH"), true);
});

test("multiple core occurrences — XXABCYYABC", () => {
  const c = assessComplexNameMatch("XXABCYYABC", "ABC");
  assert.equal(c.status, "MISMATCH");
  assert.equal(c.guardResult.violations[0].reason, "MULTIPLE_CORE_OCCURRENCES");
});

test("unparseable prefix + ABC core — XYZABC아파트", () => {
  const c = assessComplexNameMatch("XYZABC아파트", "ABC");
  assert.equal(c.status, "MISMATCH");
  assert.equal(c.guardResult.violations[0].reason, "UNPARSEABLE_PREFIX");
});

test("phase guard structured — ABC2차 vs ABC3차", () => {
  const c = assessComplexNameMatch("OO ABC3차", "ABC2차");
  assert.equal(c.status, "MISMATCH");
});

test("danji guard structured — ABC1단지 vs ABC2단지", () => {
  const c = assessComplexNameMatch("OO ABC2단지", "ABC1단지");
  assert.equal(c.status, "MISMATCH");
});
