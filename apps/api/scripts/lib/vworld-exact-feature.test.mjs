import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOgcFilter,
  classifyGetFeatureResult,
  classifyVworldComplexEvidence,
  parseGetFeatureGeoJson,
  VWORLD_COMPLEX_EVIDENCE,
} from "./vworld-exact-feature.mjs";

const expected = {
  pnu: "2820010500106950000",
  buldNmDc: "609동",
  complexNormalized: "에코에비뉴",
};

const validGeometry = {
  type: "MultiPolygon",
  coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]],
};

const modelBOptions = { buildingHubIdentityVerified: true };

function feature(props, geometry = validGeometry) {
  return { type: "Feature", properties: props, geometry };
}

function classifyBody(features, options = modelBOptions) {
  const parsed = parseGetFeatureGeoJson(JSON.stringify({ type: "FeatureCollection", features }));
  return classifyGetFeatureResult(parsed, expected, options);
}

test("OGC filter contains pnu and buld_nm_dc", () => {
  const f = buildOgcFilter({ pnu: expected.pnu, buldNmDc: "609동" });
  assert.equal(f.ok, true);
  assert.match(f.filterXml, /pnu/);
  assert.match(f.filterXml, /buld_nm_dc/);
  assert.match(f.filterXml, /609동/);
  assert.doesNotMatch(f.filterXml, /bbox/i);
});

test("classifyVworldComplexEvidence — MISSING for null/absent/empty", () => {
  assert.equal(classifyVworldComplexEvidence(null, "ABC"), VWORLD_COMPLEX_EVIDENCE.MISSING);
  assert.equal(classifyVworldComplexEvidence(undefined, "ABC"), VWORLD_COMPLEX_EVIDENCE.MISSING);
  assert.equal(classifyVworldComplexEvidence("", "ABC"), VWORLD_COMPLEX_EVIDENCE.MISSING);
  assert.equal(classifyVworldComplexEvidence("   ", "ABC"), VWORLD_COMPLEX_EVIDENCE.MISSING);
});

test("classifyVworldComplexEvidence — MATCHING", () => {
  assert.equal(
    classifyVworldComplexEvidence("에코 에비뉴", "에코에비뉴"),
    VWORLD_COMPLEX_EVIDENCE.MATCHING,
  );
});

test("classifyVworldComplexEvidence — CONTRADICTORY", () => {
  assert.equal(
    classifyVworldComplexEvidence("다른단지", "에코에비뉴"),
    VWORLD_COMPLEX_EVIDENCE.CONTRADICTORY,
  );
});

test("classifyVworldComplexEvidence — UNKNOWN without expected complex", () => {
  assert.equal(classifyVworldComplexEvidence("에코 에비뉴", null), VWORLD_COMPLEX_EVIDENCE.UNKNOWN);
  assert.equal(classifyVworldComplexEvidence("에코 에비뉴", ""), VWORLD_COMPLEX_EVIDENCE.UNKNOWN);
});

test("MODEL B — MISSING buld_nm + valid geometry => GEOMETRY VERIFIED", () => {
  const c = classifyBody([
    feature({ pnu: expected.pnu, buld_nm_dc: "609동" }),
  ]);
  assert.equal(c.terminal, "READY_FOR_REPRESENTATIVE_POINT");
  assert.equal(c.evaluations[0].vworldComplexEvidence, VWORLD_COMPLEX_EVIDENCE.MISSING);
  assert.equal(c.provenance.complexCorroboration, VWORLD_COMPLEX_EVIDENCE.MISSING);
  assert.equal(c.buildingGeometryVerified, true);
});

test("MODEL B — MATCHING buld_nm + valid geometry => GEOMETRY VERIFIED", () => {
  const c = classifyBody([
    feature({ pnu: expected.pnu, buld_nm: "에코 에비뉴", buld_nm_dc: "609동" }),
  ]);
  assert.equal(c.terminal, "READY_FOR_REPRESENTATIVE_POINT");
  assert.equal(c.evaluations[0].vworldComplexEvidence, VWORLD_COMPLEX_EVIDENCE.MATCHING);
});

test("MODEL B — CONTRADICTORY buld_nm => FAIL", () => {
  const c = classifyBody([
    feature({ pnu: expected.pnu, buld_nm: "다른단지", buld_nm_dc: "609동" }),
  ]);
  assert.equal(c.terminal, "NO_MATCH");
  assert.equal(c.failureReason, "VWORLD_CONTRADICTORY_COMPLEX");
});

test("MODEL B — BuildingHUB identity false => FAIL", () => {
  const c = classifyBody(
    [feature({ pnu: expected.pnu, buld_nm_dc: "609동" })],
    { buildingHubIdentityVerified: false },
  );
  assert.equal(c.terminal, "NO_MATCH");
  assert.equal(c.failureReason, "BUILDING_HUB_IDENTITY_NOT_VERIFIED");
});

test("MODEL B — featureCount 0 => FAIL", () => {
  const parsed = parseGetFeatureGeoJson(JSON.stringify({ type: "FeatureCollection", features: [] }));
  const c = classifyGetFeatureResult(parsed, expected, modelBOptions);
  assert.equal(c.terminal, "NO_MATCH");
  assert.equal(c.failureReason, "VWORLD_NO_MATCH");
});

test("MODEL B — featureCount > 1 => FAIL", () => {
  const c = classifyBody([
    feature({ pnu: expected.pnu, buld_nm: "에코 에비뉴", buld_nm_dc: "609동" }),
    feature({ pnu: expected.pnu, buld_nm: "에코 에비뉴", buld_nm_dc: "609동" }),
  ]);
  assert.equal(c.terminal, "AMBIGUOUS");
  assert.equal(c.failureReason, "VWORLD_AMBIGUOUS");
});

test("MODEL B — PNU mismatch => FAIL", () => {
  const c = classifyBody([
    feature({ pnu: "1111111111111111111", buld_nm_dc: "609동" }),
  ]);
  assert.equal(c.terminal, "NO_MATCH");
  assert.equal(c.failureReason, "VWORLD_WRONG_PNU");
});

test("MODEL B — dong mismatch => FAIL", () => {
  const c = classifyBody([
    feature({ pnu: expected.pnu, buld_nm: "에코 에비뉴", buld_nm_dc: "608동" }),
  ]);
  assert.equal(c.terminal, "NO_MATCH");
  assert.equal(c.failureReason, "VWORLD_WRONG_DONG");
});

test("MODEL B — geometry missing => FAIL", () => {
  const c = classifyBody([
    feature({ pnu: expected.pnu, buld_nm: "에코 에비뉴", buld_nm_dc: "609동" }, null),
  ]);
  assert.equal(c.terminal, "GEOMETRY_UNRESOLVED");
  assert.equal(c.failureReason, "GEOMETRY_MISSING");
});

test("MODEL B — geometry invalid => FAIL", () => {
  const c = classifyBody([
    feature(
      { pnu: expected.pnu, buld_nm: "에코 에비뉴", buld_nm_dc: "609동" },
      { type: "Point", coordinates: [0, 0] },
    ),
  ]);
  assert.equal(c.terminal, "GEOMETRY_UNRESOLVED");
  assert.equal(c.failureReason, "GEOMETRY_INVALID");
});

test("MODEL B — UNKNOWN complex evidence state => FAIL", () => {
  const parsed = parseGetFeatureGeoJson(
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        feature({ pnu: expected.pnu, buld_nm: "에코 에비뉴", buld_nm_dc: "609동" }),
      ],
    }),
  );
  const c = classifyGetFeatureResult(parsed, { ...expected, complexNormalized: "" }, modelBOptions);
  assert.equal(c.terminal, "NO_MATCH");
  assert.equal(c.failureReason, "VWORLD_COMPLEX_EVIDENCE_UNKNOWN");
  assert.equal(c.evaluations[0].vworldComplexEvidence, VWORLD_COMPLEX_EVIDENCE.UNKNOWN);
});

test("MISSING must NOT be reported as MATCHING", () => {
  const c = classifyBody([
    feature({ pnu: expected.pnu, buld_nm_dc: "609동" }),
  ]);
  assert.equal(c.evaluations[0].vworldComplexEvidence, VWORLD_COMPLEX_EVIDENCE.MISSING);
  assert.notEqual(c.evaluations[0].vworldComplexEvidence, VWORLD_COMPLEX_EVIDENCE.MATCHING);
  assert.equal(c.evaluations[0].complexNameMatch, "NO");
});

test("CONTRADICTORY must not fall back to proximity/fuzzy acceptance", () => {
  const c = classifyBody([
    feature({ pnu: expected.pnu, buld_nm: "에코에비뉴2차", buld_nm_dc: "609동" }),
  ]);
  assert.equal(c.terminal, "NO_MATCH");
  assert.equal(c.failureReason, "VWORLD_CONTRADICTORY_COMPLEX");
  assert.notEqual(c.terminal, "READY_FOR_REPRESENTATIVE_POINT");
  assert.notEqual(c.failureReason, "VWORLD_AMBIGUOUS");
});

test("provenance preserved separately", () => {
  const c = classifyBody([
    feature({ pnu: expected.pnu, bd_mgt_sn: "2820010500106950000000009", buld_nm_dc: "609동" }),
  ]);
  assert.equal(c.provenance.identityProvenance, "BUILDING_HUB_VERIFIED");
  assert.equal(c.provenance.geometryProvenance, "VWORLD_EXACT_PNU_DONG_FEATURE");
  assert.equal(c.provenance.complexCorroboration, VWORLD_COMPLEX_EVIDENCE.MISSING);
  assert.equal(c.provenance.vworldProviderBuildingId, "2820010500106950000000009");
});
