import {
  assessComplexNameMatch,
  formatDongLabel,
  matchBuildingRegisterIdentity,
  matchDongNm,
  parseDongSemanticLabel,
} from "./building-identity-matcher";

const row = (dongNm: string, bldNm: string) => ({ dongNm, bldNm });

describe("building-identity-matcher", () => {
  describe("dong semantic", () => {
    it.each([
      ["504", "504동"],
      ["504동", "504"],
      ["2301", "2301동"],
      ["A", "A동"],
      ["A동", "A"],
      ["a", "A동"],
    ])("matchDongNm(%s, %s) = true", (a, b) => {
      expect(matchDongNm(a, b)).toBe(true);
    });

    it.each([
      ["B동", "A동"],
      ["AA동", "A동"],
      ["2301동", "301동"],
      ["504동", "505동"],
    ])("matchDongNm(%s, %s) = false", (a, b) => {
      expect(matchDongNm(a, b)).toBe(false);
    });

    it("rejects empty/invalid labels", () => {
      expect(matchDongNm("", "504동")).toBe(false);
      expect(matchDongNm("504동", "")).toBe(false);
      expect(matchDongNm(null, "504동")).toBe(false);
      expect(parseDongSemanticLabel("경비실")).toBeNull();
      expect(parseDongSemanticLabel("AA동")).toBeNull();
      expect(formatDongLabel("")).toBeNull();
      expect(formatDongLabel("A")).toBe("A동");
      expect(formatDongLabel("504")).toBe("504동");
      expect(formatDongLabel("2301")).toBe("2301동");
    });
  });

  describe("exact normalized", () => {
    it("complex exact normalized", () => {
      const c = assessComplexNameMatch("에코 에비뉴", "에코에비뉴");
      expect(c.status).toBe("EXACT_NORMALIZED");
    });

    it("R01 register identity — 504동", () => {
      const r = matchBuildingRegisterIdentity([row("504동", "서창센트럴푸르지오")], {
        dong: "504",
        complexNameHint: "서창센트럴푸르지오",
      });
      expect(r.dongMatch).toBe("YES");
      expect(r.identityVerified).toBe(true);
    });

    it("R02 register identity — A동", () => {
      const r = matchBuildingRegisterIdentity([row("A동", "에코메트로3차 더타워")], {
        dong: "A",
        complexNameHint: "에코메트로3차 더타워",
      });
      expect(r.dongMatch).toBe("YES");
      expect(r.expectedDongLabel).toBe("A동");
      expect(r.identityVerified).toBe(true);
    });

    it("R03 register identity — 2301동", () => {
      const r = matchBuildingRegisterIdentity([row("2301동", "롯데캐슬골드")], {
        dong: "2301",
        complexNameHint: "롯데캐슬골드",
      });
      expect(r.dongMatch).toBe("YES");
      expect(r.identityVerified).toBe(true);
    });

    it("separates complex mismatch from dong match", () => {
      const r = matchBuildingRegisterIdentity([row("2301동", "다른단지")], {
        dong: "2301",
        complexNameHint: "롯데캐슬골드",
      });
      expect(r.dongMatch).toBe("YES");
      expect(r.complexNameMatch).toBe("MISMATCH");
      expect(r.identityVerified).toBe(false);
    });
  });

  describe("compound core match", () => {
    it("REGISTER_COMPOUND_CORE_MATCH — R02 compound legal bldNm", () => {
      const c = assessComplexNameMatch(
        "에코메트로3차더타워판매시설AB아파트",
        "에코메트로3차 더타워",
        { dongToken: "A" },
      );
      expect(c.status).toBe("REGISTER_COMPOUND_CORE_MATCH");
      expect(c.matchedCore).toBe("에코메트로3차더타워");
      expect(c.guardResult?.passed).toBe(true);
    });

    it("REGISTER_COMPOUND_CORE_MATCH — simple suffix ABC아파트", () => {
      const c = assessComplexNameMatch("ABC아파트", "ABC");
      expect(c.status).toBe("REGISTER_COMPOUND_CORE_MATCH");
    });

    it("R02 register identity — compound legal bldNm with A dong", () => {
      const r = matchBuildingRegisterIdentity(
        [row("A", "에코메트로3차더타워판매시설AB아파트")],
        { dong: "A", complexNameHint: "에코메트로3차 더타워" },
      );
      expect(r.dongMatch).toBe("YES");
      expect(r.complexNameMatch).toBe("REGISTER_COMPOUND_CORE_MATCH");
      expect(r.identityVerified).toBe(true);
    });

    it("compound match requires CORE prefix — XYZABC아파트", () => {
      const c = assessComplexNameMatch("XYZABC아파트", "ABC");
      expect(c.status).toBe("MISMATCH");
      expect(c.guardResult?.violations[0]?.reason).toBe("UNPARSEABLE_PREFIX");
    });
  });

  describe("structured prefix core match", () => {
    it("REGISTER_STRUCTURED_PREFIX_CORE_MATCH — R02 live bldNm", () => {
      const c = assessComplexNameMatch(
        "인천 소래논현구역 C10블록 에코메트로 3차 더 타워",
        "에코메트로3차 더타워",
        { dongToken: "A" },
      );
      expect(c.status).toBe("REGISTER_STRUCTURED_PREFIX_CORE_MATCH");
      if (c.status !== "REGISTER_STRUCTURED_PREFIX_CORE_MATCH") return;
      expect(c.matchedCore).toBe("에코메트로3차더타워");
      expect(c.structuredPrefix?.administrativeZone).toBe("인천소래논현구역");
      expect(c.structuredPrefix?.blocks).toEqual(["C10블록"]);
      expect(c.structuredPrefix?.blockContext).toBe("ADDITIONAL_REGISTER_CONTEXT");
    });

    it("R02 live register identity — structured prefix match", () => {
      const r = matchBuildingRegisterIdentity(
        [row("A", "인천 소래논현구역 C10블록 에코메트로 3차 더 타워")],
        { dong: "A", complexNameHint: "에코메트로3차 더타워" },
      );
      expect(r.dongMatch).toBe("YES");
      expect(r.complexNameMatch).toBe("REGISTER_STRUCTURED_PREFIX_CORE_MATCH");
      expect(r.identityVerified).toBe(true);
    });

    it("structured prefix generic — 한남도시개발구역 C10블록 ABC아파트", () => {
      const c = assessComplexNameMatch("한남도시개발구역C10블록ABC아파트", "ABC아파트");
      expect(c.status).toBe("REGISTER_STRUCTURED_PREFIX_CORE_MATCH");
    });

    it("block conflict — frozen C10블록 vs register C11블록", () => {
      const c = assessComplexNameMatch("C11블록ABCC10블록", "ABCC10블록");
      expect(c.status).toBe("MISMATCH");
      expect(
        c.guardResult?.violations.some((v) => v.reason === "BLOCK_IDENTITY_MISMATCH"),
      ).toBe(true);
    });
  });
});
