/**
 * Research-only VWorld lt_c_spbd exact feature helpers.
 * OGC Filter only — no bbox, CQL, or proximity selection.
 * MODEL B: cross-provider authority split (BuildingHUB identity + VWorld geometry).
 */

export const VWORLD_COMPLEX_EVIDENCE = {
  MATCHING: "MATCHING",
  MISSING: "MISSING",
  CONTRADICTORY: "CONTRADICTORY",
  UNKNOWN: "UNKNOWN",
};

export const RESEARCH_PROVENANCE = {
  IDENTITY: "BUILDING_HUB_VERIFIED",
  GEOMETRY: "VWORLD_EXACT_PNU_DONG_FEATURE",
  PIN: "BUILDING_CENTER",
};

export function buildOgcFilter({ pnu, buldNmDc }) {
  if (!pnu || !buldNmDc) {
    return { ok: false, reason: "FILTER_INPUT_MISSING" };
  }
  const filterXml = `<Filter xmlns="http://www.opengis.net/ogc"><And><PropertyIsEqualTo><PropertyName>pnu</PropertyName><Literal>${pnu}</Literal></PropertyIsEqualTo><PropertyIsEqualTo><PropertyName>buld_nm_dc</PropertyName><Literal>${buldNmDc}</Literal></PropertyIsEqualTo></And></Filter>`;
  return { ok: true, filterXml };
}

export function buildGetFeatureParams({ pnu, buldNmDc, maxFeatures = 10 }) {
  const filter = buildOgcFilter({ pnu, buldNmDc });
  if (!filter.ok) return filter;
  return {
    ok: true,
    params: {
      service: "WFS",
      request: "GetFeature",
      version: "1.1.0",
      typename: "lt_c_spbd",
      srsname: "EPSG:4326",
      output: "application/json",
      maxfeatures: String(maxFeatures),
      filter: filter.filterXml,
    },
  };
}

export function normalizeName(s) {
  return (s ?? "").replace(/\s+/g, "").trim();
}

export function getFeatureProp(props, name) {
  const hit = Object.entries(props ?? {}).find(
    ([k]) => k.toLowerCase() === name.toLowerCase(),
  );
  return hit ? hit[1] : null;
}

export function parseGetFeatureGeoJson(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "JSON_PARSE_ERROR", features: [], featureCount: 0 };
  }
  const features = Array.isArray(json.features) ? json.features : [];
  return { ok: true, features, featureCount: features.length };
}

export function assessGeometry(geometry) {
  if (!geometry) return { present: false, type: null, valid: false };
  const type = geometry.type ?? null;
  const coords = geometry.coordinates;
  const valid =
    (type === "Polygon" || type === "MultiPolygon") &&
    Array.isArray(coords) &&
    coords.length > 0;
  return { present: Boolean(geometry), type, valid };
}

export function isBuldNmAbsent(buldNm) {
  if (buldNm == null) return true;
  return normalizeName(buldNm) === "";
}

/**
 * Classify VWorld buld_nm corroboration against verified BuildingHUB complex.
 * Does not infer MISSING from UNKNOWN.
 */
export function classifyVworldComplexEvidence(buldNm, expectedComplexNormalized) {
  if (expectedComplexNormalized == null || normalizeName(expectedComplexNormalized) === "") {
    return VWORLD_COMPLEX_EVIDENCE.UNKNOWN;
  }
  if (isBuldNmAbsent(buldNm)) {
    return VWORLD_COMPLEX_EVIDENCE.MISSING;
  }
  const normalized = normalizeName(buldNm);
  const expected = normalizeName(expectedComplexNormalized);
  if (normalized === expected) {
    return VWORLD_COMPLEX_EVIDENCE.MATCHING;
  }
  return VWORLD_COMPLEX_EVIDENCE.CONTRADICTORY;
}

/**
 * Evaluate exact feature attributes for MODEL B geometry gate.
 */
export function evaluateExactFeature(feature, expected) {
  const props = feature?.properties ?? {};
  const pnu = getFeatureProp(props, "pnu");
  const buldNm = getFeatureProp(props, "buld_nm");
  const buldNmDc = getFeatureProp(props, "buld_nm_dc");
  const bdMgtSn = getFeatureProp(props, "bd_mgt_sn");
  const geom = assessGeometry(feature?.geometry);

  const pnuMatch = pnu === expected.pnu ? "YES" : "NO";
  const dongMatch = buldNmDc === expected.buldNmDc ? "YES" : "NO";
  const vworldComplexEvidence = classifyVworldComplexEvidence(
    buldNm,
    expected.complexNormalized,
  );

  return {
    pnu,
    buldNm,
    buldNmDc,
    bdMgtSn: bdMgtSn ?? null,
    pnuMatch,
    dongMatch,
    vworldComplexEvidence,
    complexNameMatch:
      vworldComplexEvidence === VWORLD_COMPLEX_EVIDENCE.MATCHING ? "YES" : "NO",
    geometryPresent: geom.present ? "YES" : "NO",
    geometryType: geom.type,
    geometryValid: geom.valid ? "YES" : "NO",
  };
}

export function buildVworldProvenance(evaluation) {
  return {
    identityProvenance: RESEARCH_PROVENANCE.IDENTITY,
    geometryProvenance: RESEARCH_PROVENANCE.GEOMETRY,
    complexCorroboration: evaluation.vworldComplexEvidence,
    vworldProviderBuildingId: evaluation.bdMgtSn ?? null,
  };
}

/**
 * MODEL B geometry acceptance — requires verified BuildingHUB identity upstream.
 */
export function assessModelBGeometryAcceptance(evaluation, options = {}) {
  const { buildingHubIdentityVerified = false } = options;

  if (!buildingHubIdentityVerified) {
    return {
      accepted: false,
      failureReason: "BUILDING_HUB_IDENTITY_NOT_VERIFIED",
    };
  }
  if (evaluation.pnuMatch === "NO") {
    return { accepted: false, failureReason: "VWORLD_WRONG_PNU" };
  }
  if (evaluation.dongMatch === "NO") {
    return { accepted: false, failureReason: "VWORLD_WRONG_DONG" };
  }
  if (evaluation.vworldComplexEvidence === VWORLD_COMPLEX_EVIDENCE.UNKNOWN) {
    return { accepted: false, failureReason: "VWORLD_COMPLEX_EVIDENCE_UNKNOWN" };
  }
  if (evaluation.vworldComplexEvidence === VWORLD_COMPLEX_EVIDENCE.CONTRADICTORY) {
    return { accepted: false, failureReason: "VWORLD_CONTRADICTORY_COMPLEX" };
  }
  if (evaluation.geometryPresent !== "YES") {
    return { accepted: false, failureReason: "GEOMETRY_MISSING" };
  }
  if (evaluation.geometryValid !== "YES") {
    return { accepted: false, failureReason: "GEOMETRY_INVALID" };
  }
  return { accepted: true, failureReason: null };
}

export function classifyGetFeatureResult(parsed, expected, options = {}) {
  const { buildingHubIdentityVerified = false } = options;

  if (!parsed.ok) {
    return {
      terminal: "ERROR",
      failureReason: "VWORLD_PARSE_ERROR",
      featureCount: 0,
      evaluations: [],
    };
  }

  const { featureCount, features } = parsed;
  if (featureCount === 0) {
    return {
      terminal: "NO_MATCH",
      failureReason: "VWORLD_NO_MATCH",
      featureCount: 0,
      evaluations: [],
    };
  }
  if (featureCount > 1) {
    return {
      terminal: "AMBIGUOUS",
      failureReason: "VWORLD_AMBIGUOUS",
      featureCount,
      evaluations: features.map((f) => evaluateExactFeature(f, expected)),
    };
  }

  const evaluation = evaluateExactFeature(features[0], expected);
  const acceptance = assessModelBGeometryAcceptance(evaluation, {
    buildingHubIdentityVerified,
  });

  if (!acceptance.accepted) {
    const geometryFailures = new Set(["GEOMETRY_MISSING", "GEOMETRY_INVALID"]);
    return {
      terminal: geometryFailures.has(acceptance.failureReason)
        ? "GEOMETRY_UNRESOLVED"
        : "NO_MATCH",
      failureReason: acceptance.failureReason,
      featureCount: 1,
      evaluations: [evaluation],
      provenance: buildVworldProvenance(evaluation),
    };
  }

  return {
    terminal: "READY_FOR_REPRESENTATIVE_POINT",
    failureReason: null,
    featureCount: 1,
    evaluations: [evaluation],
    provenance: buildVworldProvenance(evaluation),
    buildingGeometryVerified: true,
  };
}
