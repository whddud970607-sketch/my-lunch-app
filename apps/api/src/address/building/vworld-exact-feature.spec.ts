import {
  buildOgcFilter,
  classifyGetFeatureResult,
  classifyVworldComplexEvidence,
  parseGetFeatureGeoJson,
  VWORLD_COMPLEX_EVIDENCE,
} from "./vworld-exact-feature";

const expected = {
  pnu: "2820010500106950000",
  buldNmDc: "609동",
  complexNormalized: "에코에비뉴",
};

const validGeometry = {
  type: "MultiPolygon" as const,
  coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]],
};

const modelBOptions = { buildingHubIdentityVerified: true };

function feature(
  props: Record<string, unknown>,
  geometry: typeof validGeometry | null = validGeometry,
) {
  return { type: "Feature" as const, properties: props, geometry };
}

function classifyBody(
  features: ReturnType<typeof feature>[],
  options = modelBOptions,
) {
  const parsed = parseGetFeatureGeoJson(
    JSON.stringify({ type: "FeatureCollection", features }),
  );
  return classifyGetFeatureResult(parsed, expected, options);
}

describe("vworld-exact-feature", () => {
  describe("buildOgcFilter", () => {
    it("contains pnu and buld_nm_dc", () => {
      const f = buildOgcFilter({ pnu: expected.pnu, buldNmDc: "609동" });
      expect(f.ok).toBe(true);
      if (f.ok) {
        expect(f.filterXml).toMatch(/pnu/);
        expect(f.filterXml).toMatch(/buld_nm_dc/);
        expect(f.filterXml).toMatch(/609동/);
        expect(f.filterXml).not.toMatch(/bbox/i);
      }
    });
  });

  describe("classifyVworldComplexEvidence", () => {
    it("MISSING for null/absent/empty", () => {
      expect(classifyVworldComplexEvidence(null, "ABC")).toBe(VWORLD_COMPLEX_EVIDENCE.MISSING);
      expect(classifyVworldComplexEvidence(undefined, "ABC")).toBe(VWORLD_COMPLEX_EVIDENCE.MISSING);
      expect(classifyVworldComplexEvidence("", "ABC")).toBe(VWORLD_COMPLEX_EVIDENCE.MISSING);
      expect(classifyVworldComplexEvidence("   ", "ABC")).toBe(VWORLD_COMPLEX_EVIDENCE.MISSING);
    });

    it("MATCHING", () => {
      expect(classifyVworldComplexEvidence("에코 에비뉴", "에코에비뉴")).toBe(
        VWORLD_COMPLEX_EVIDENCE.MATCHING,
      );
    });

    it("CONTRADICTORY", () => {
      expect(classifyVworldComplexEvidence("다른단지", "에코에비뉴")).toBe(
        VWORLD_COMPLEX_EVIDENCE.CONTRADICTORY,
      );
    });

    it("UNKNOWN without expected complex", () => {
      expect(classifyVworldComplexEvidence("에코 에비뉴", null)).toBe(
        VWORLD_COMPLEX_EVIDENCE.UNKNOWN,
      );
      expect(classifyVworldComplexEvidence("에코 에비뉴", "")).toBe(
        VWORLD_COMPLEX_EVIDENCE.UNKNOWN,
      );
    });
  });

  describe("MODEL B matrix", () => {
    it("MISSING buld_nm + valid geometry => GEOMETRY VERIFIED", () => {
      const c = classifyBody([feature({ pnu: expected.pnu, buld_nm_dc: "609동" })]);
      expect(c.terminal).toBe("READY_FOR_REPRESENTATIVE_POINT");
      expect(c.evaluations[0].vworldComplexEvidence).toBe(VWORLD_COMPLEX_EVIDENCE.MISSING);
      expect(c.provenance?.complexCorroboration).toBe(VWORLD_COMPLEX_EVIDENCE.MISSING);
      expect(c.buildingGeometryVerified).toBe(true);
    });

    it("MATCHING buld_nm + valid geometry => GEOMETRY VERIFIED", () => {
      const c = classifyBody([
        feature({
          pnu: expected.pnu,
          buld_nm: "에코 에비뉴",
          buld_nm_dc: "609동",
        }),
      ]);
      expect(c.terminal).toBe("READY_FOR_REPRESENTATIVE_POINT");
      expect(c.evaluations[0].vworldComplexEvidence).toBe(VWORLD_COMPLEX_EVIDENCE.MATCHING);
    });

    it("CONTRADICTORY buld_nm => FAIL", () => {
      const c = classifyBody([
        feature({
          pnu: expected.pnu,
          buld_nm: "다른단지",
          buld_nm_dc: "609동",
        }),
      ]);
      expect(c.terminal).toBe("NO_MATCH");
      expect(c.failureReason).toBe("VWORLD_CONTRADICTORY_COMPLEX");
    });

    it("BuildingHUB identity false => FAIL", () => {
      const c = classifyBody(
        [feature({ pnu: expected.pnu, buld_nm_dc: "609동" })],
        { buildingHubIdentityVerified: false },
      );
      expect(c.terminal).toBe("NO_MATCH");
      expect(c.failureReason).toBe("BUILDING_HUB_IDENTITY_NOT_VERIFIED");
    });

    it("featureCount 0 => FAIL", () => {
      const parsed = parseGetFeatureGeoJson(
        JSON.stringify({ type: "FeatureCollection", features: [] }),
      );
      const c = classifyGetFeatureResult(parsed, expected, modelBOptions);
      expect(c.terminal).toBe("NO_MATCH");
      expect(c.failureReason).toBe("VWORLD_NO_MATCH");
    });

    it("featureCount > 1 => FAIL", () => {
      const c = classifyBody([
        feature({
          pnu: expected.pnu,
          buld_nm: "에코 에비뉴",
          buld_nm_dc: "609동",
        }),
        feature({
          pnu: expected.pnu,
          buld_nm: "에코 에비뉴",
          buld_nm_dc: "609동",
        }),
      ]);
      expect(c.terminal).toBe("AMBIGUOUS");
      expect(c.failureReason).toBe("VWORLD_AMBIGUOUS");
    });

    it("PNU mismatch => FAIL", () => {
      const c = classifyBody([feature({ pnu: "1111111111111111111", buld_nm_dc: "609동" })]);
      expect(c.terminal).toBe("NO_MATCH");
      expect(c.failureReason).toBe("VWORLD_WRONG_PNU");
    });

    it("dong mismatch => FAIL", () => {
      const c = classifyBody([
        feature({
          pnu: expected.pnu,
          buld_nm: "에코 에비뉴",
          buld_nm_dc: "608동",
        }),
      ]);
      expect(c.terminal).toBe("NO_MATCH");
      expect(c.failureReason).toBe("VWORLD_WRONG_DONG");
    });

    it("geometry missing => FAIL", () => {
      const c = classifyBody([
        feature(
          { pnu: expected.pnu, buld_nm: "에코 에비뉴", buld_nm_dc: "609동" },
          null,
        ),
      ]);
      expect(c.terminal).toBe("GEOMETRY_UNRESOLVED");
      expect(c.failureReason).toBe("GEOMETRY_MISSING");
    });

    it("geometry invalid => FAIL", () => {
      const c = classifyBody([
        feature(
          { pnu: expected.pnu, buld_nm: "에코 에비뉴", buld_nm_dc: "609동" },
          { type: "Point", coordinates: [0, 0] } as never,
        ),
      ]);
      expect(c.terminal).toBe("GEOMETRY_UNRESOLVED");
      expect(c.failureReason).toBe("GEOMETRY_INVALID");
    });

    it("UNKNOWN complex evidence state => FAIL", () => {
      const parsed = parseGetFeatureGeoJson(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            feature({
              pnu: expected.pnu,
              buld_nm: "에코 에비뉴",
              buld_nm_dc: "609동",
            }),
          ],
        }),
      );
      const c = classifyGetFeatureResult(
        parsed,
        { ...expected, complexNormalized: "" },
        modelBOptions,
      );
      expect(c.terminal).toBe("NO_MATCH");
      expect(c.failureReason).toBe("VWORLD_COMPLEX_EVIDENCE_UNKNOWN");
      expect(c.evaluations[0].vworldComplexEvidence).toBe(VWORLD_COMPLEX_EVIDENCE.UNKNOWN);
    });

    it("MISSING must NOT be reported as MATCHING", () => {
      const c = classifyBody([feature({ pnu: expected.pnu, buld_nm_dc: "609동" })]);
      expect(c.evaluations[0].vworldComplexEvidence).toBe(VWORLD_COMPLEX_EVIDENCE.MISSING);
      expect(c.evaluations[0].vworldComplexEvidence).not.toBe(VWORLD_COMPLEX_EVIDENCE.MATCHING);
      expect(c.evaluations[0].complexNameMatch).toBe("NO");
    });

    it("CONTRADICTORY must not fall back to proximity/fuzzy acceptance", () => {
      const c = classifyBody([
        feature({
          pnu: expected.pnu,
          buld_nm: "에코에비뉴2차",
          buld_nm_dc: "609동",
        }),
      ]);
      expect(c.terminal).toBe("NO_MATCH");
      expect(c.failureReason).toBe("VWORLD_CONTRADICTORY_COMPLEX");
      expect(c.terminal).not.toBe("READY_FOR_REPRESENTATIVE_POINT");
      expect(c.failureReason).not.toBe("VWORLD_AMBIGUOUS");
    });

    it("provenance preserved separately", () => {
      const c = classifyBody([
        feature({
          pnu: expected.pnu,
          bd_mgt_sn: "2820010500106950000000009",
          buld_nm_dc: "609동",
        }),
      ]);
      expect(c.provenance?.identityProvenance).toBe("BUILDING_HUB_VERIFIED");
      expect(c.provenance?.geometryProvenance).toBe("VWORLD_EXACT_PNU_DONG_FEATURE");
      expect(c.provenance?.complexCorroboration).toBe(VWORLD_COMPLEX_EVIDENCE.MISSING);
      expect(c.provenance?.vworldProviderBuildingId).toBe("2820010500106950000000009");
    });
  });
});
