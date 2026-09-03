/**
 * Research-only VWorld lt_c_spbd exact feature helpers.
 * OGC Filter only — no bbox, CQL, or proximity selection.
 * MODEL B: cross-provider authority split (BuildingHUB identity + VWorld geometry).
 */

import {
  GeometryProvenance,
  IdentityProvenance,
  PinProvenance,
  VworldComplexEvidence,
} from "./building-resolution.types";

export const VWORLD_COMPLEX_EVIDENCE = VworldComplexEvidence;

export const RESEARCH_PROVENANCE = {
  IDENTITY: IdentityProvenance.BUILDING_HUB_VERIFIED,
  GEOMETRY: GeometryProvenance.VWORLD_EXACT_PNU_DONG_FEATURE,
  PIN: PinProvenance.BUILDING_CENTER,
} as const;

export function buildOgcFilter({ pnu, buldNmDc }: { pnu?: string | null; buldNmDc?: string | null }) {
  if (!pnu || !buldNmDc) {
    return { ok: false as const, reason: "FILTER_INPUT_MISSING" };
  }
  const filterXml = `<Filter xmlns="http://www.opengis.net/ogc"><And><PropertyIsEqualTo><PropertyName>pnu</PropertyName><Literal>${pnu}</Literal></PropertyIsEqualTo><PropertyIsEqualTo><PropertyName>buld_nm_dc</PropertyName><Literal>${buldNmDc}</Literal></PropertyIsEqualTo></And></Filter>`;
  return { ok: true as const, filterXml };
}

export function buildGetFeatureParams({
  pnu,
  buldNmDc,
  maxFeatures = 10,
}: {
  pnu?: string | null;
  buldNmDc?: string | null;
  maxFeatures?: number;
}) {
  const filter = buildOgcFilter({ pnu, buldNmDc });
  if (!filter.ok) return filter;
  return {
    ok: true as const,
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

export function normalizeName(s: string | null | undefined) {
  return (s ?? "").replace(/\s+/g, "").trim();
}

export function getFeatureProp(props: Record<string, unknown> | null | undefined, name: string) {
  const hit = Object.entries(props ?? {}).find(
    ([k]) => k.toLowerCase() === name.toLowerCase(),
  );
  return hit ? hit[1] : null;
}

export function parseGetFeatureGeoJson(text: string) {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false as const, reason: "JSON_PARSE_ERROR", features: [] as GeoJsonFeature[], featureCount: 0 };
  }
  const features = Array.isArray(json.features) ? (json.features as GeoJsonFeature[]) : [];
  return { ok: true as const, features, featureCount: features.length };
}

export type GeoJsonFeature = {
  properties?: Record<string, unknown>;
  geometry?: GeoJsonGeometry | null;
};

export type GeoJsonGeometry = {
  type?: string;
  coordinates?: unknown;
};

export function assessGeometry(geometry: GeoJsonGeometry | null | undefined) {
  if (!geometry) return { present: false, type: null as string | null, valid: false };
  const type = geometry.type ?? null;
  const coords = geometry.coordinates;
  const valid =
    (type === "Polygon" || type === "MultiPolygon") &&
    Array.isArray(coords) &&
    coords.length > 0;
  return { present: Boolean(geometry), type, valid };
}

export function isBuldNmAbsent(buldNm: unknown) {
  if (buldNm == null) return true;
  return normalizeName(String(buldNm)) === "";
}

/**
 * Classify VWorld buld_nm corroboration against verified BuildingHUB complex.
 * Does not infer MISSING from UNKNOWN.
 */
export function classifyVworldComplexEvidence(
  buldNm: unknown,
  expectedComplexNormalized: string | null | undefined,
) {
  if (expectedComplexNormalized == null || normalizeName(expectedComplexNormalized) === "") {
    return VWORLD_COMPLEX_EVIDENCE.UNKNOWN;
  }
  if (isBuldNmAbsent(buldNm)) {
    return VWORLD_COMPLEX_EVIDENCE.MISSING;
  }
  const normalized = normalizeName(String(buldNm));
  const expected = normalizeName(expectedComplexNormalized);
  if (normalized === expected) {
    return VWORLD_COMPLEX_EVIDENCE.MATCHING;
  }
  return VWORLD_COMPLEX_EVIDENCE.CONTRADICTORY;
}

export type ExpectedExactFeature = {
  pnu: string;
  buldNmDc: string;
  complexNormalized?: string | null;
};

/**
 * Evaluate exact feature attributes for MODEL B geometry gate.
 */
export function evaluateExactFeature(feature: GeoJsonFeature | null | undefined, expected: ExpectedExactFeature) {
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

export function buildVworldProvenance(evaluation: ReturnType<typeof evaluateExactFeature>) {
  return {
    identityProvenance: RESEARCH_PROVENANCE.IDENTITY,
    geometryProvenance: RESEARCH_PROVENANCE.GEOMETRY,
    complexCorroboration: evaluation.vworldComplexEvidence,
    vworldProviderBuildingId: evaluation.bdMgtSn != null ? String(evaluation.bdMgtSn) : null,
  };
}

/**
 * MODEL B geometry acceptance — requires verified BuildingHUB identity upstream.
 */
export function assessModelBGeometryAcceptance(
  evaluation: ReturnType<typeof evaluateExactFeature>,
  options: { buildingHubIdentityVerified?: boolean } = {},
) {
  const { buildingHubIdentityVerified = false } = options;

  if (!buildingHubIdentityVerified) {
    return {
      accepted: false as const,
      failureReason: "BUILDING_HUB_IDENTITY_NOT_VERIFIED",
    };
  }
  if (evaluation.pnuMatch === "NO") {
    return { accepted: false as const, failureReason: "VWORLD_WRONG_PNU" };
  }
  if (evaluation.dongMatch === "NO") {
    return { accepted: false as const, failureReason: "VWORLD_WRONG_DONG" };
  }
  if (evaluation.vworldComplexEvidence === VWORLD_COMPLEX_EVIDENCE.UNKNOWN) {
    return { accepted: false as const, failureReason: "VWORLD_COMPLEX_EVIDENCE_UNKNOWN" };
  }
  if (evaluation.vworldComplexEvidence === VWORLD_COMPLEX_EVIDENCE.CONTRADICTORY) {
    return { accepted: false as const, failureReason: "VWORLD_CONTRADICTORY_COMPLEX" };
  }
  if (evaluation.geometryPresent !== "YES") {
    return { accepted: false as const, failureReason: "GEOMETRY_MISSING" };
  }
  if (evaluation.geometryValid !== "YES") {
    return { accepted: false as const, failureReason: "GEOMETRY_INVALID" };
  }
  return { accepted: true as const, failureReason: null };
}

export function classifyGetFeatureResult(
  parsed: ReturnType<typeof parseGetFeatureGeoJson>,
  expected: ExpectedExactFeature,
  options: { buildingHubIdentityVerified?: boolean } = {},
) {
  const { buildingHubIdentityVerified = false } = options;

  if (!parsed.ok) {
    return {
      terminal: "ERROR" as const,
      failureReason: "VWORLD_PARSE_ERROR",
      featureCount: 0,
      evaluations: [] as ReturnType<typeof evaluateExactFeature>[],
    };
  }

  const { featureCount, features } = parsed;
  if (featureCount === 0) {
    return {
      terminal: "NO_MATCH" as const,
      failureReason: "VWORLD_NO_MATCH",
      featureCount: 0,
      evaluations: [] as ReturnType<typeof evaluateExactFeature>[],
    };
  }
  if (featureCount > 1) {
    return {
      terminal: "AMBIGUOUS" as const,
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
        ? ("GEOMETRY_UNRESOLVED" as const)
        : ("NO_MATCH" as const),
      failureReason: acceptance.failureReason,
      featureCount: 1,
      evaluations: [evaluation],
      provenance: buildVworldProvenance(evaluation),
    };
  }

  return {
    terminal: "READY_FOR_REPRESENTATIVE_POINT" as const,
    failureReason: null,
    featureCount: 1,
    evaluations: [evaluation],
    provenance: buildVworldProvenance(evaluation),
    buildingGeometryVerified: true,
  };
}
