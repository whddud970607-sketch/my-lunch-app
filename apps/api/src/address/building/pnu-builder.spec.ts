import { buildPnu, mapPlatGbToPnuField } from "./pnu-builder";

describe("pnu-builder", () => {
  describe("mapPlatGbToPnuField", () => {
    it("maps platGbCd 0 to PNU field 1", () => {
      const m = mapPlatGbToPnuField("0");
      expect(m.ok).toBe(true);
      if (m.ok) expect(m.pnuField).toBe("1");
    });

    it("maps platGbCd 1 to PNU field 2", () => {
      const m = mapPlatGbToPnuField("1");
      expect(m.ok).toBe(true);
      if (m.ok) expect(m.pnuField).toBe("2");
    });

    it("rejects unsupported platGbCd", () => {
      expect(mapPlatGbToPnuField("2").ok).toBe(false);
    });
  });

  describe("buildPnu", () => {
    it("produces 19 digits", () => {
      const r = buildPnu({
        sigunguCd: "28200",
        bjdongCd: "10500",
        platGbCd: "0",
        bun: "0695",
        ji: "0000",
        provenance: "test",
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.pnu).toBe("2820010500106950000");
        expect(r.pnu.length).toBe(19);
      }
    });

    it("rejects invalid sigungu", () => {
      const r = buildPnu({
        sigunguCd: "abc",
        bjdongCd: "10500",
        platGbCd: "0",
        bun: "0695",
        ji: "0000",
        provenance: "test",
      });
      expect(r.ok).toBe(false);
    });
  });
});
