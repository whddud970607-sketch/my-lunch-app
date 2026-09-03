/**
 * Production building-resolution stage — internal to AddressResolutionService.
 * Fail-closed at each gate; no proximity/bbox identity fallbacks.
 */

import { fetchAllRegisterPages } from "./building-hub-client";
import {
  formatDongLabel,
  matchBuildingRegisterIdentity,
  normalizeWhitespace,
} from "./building-identity-matcher";
import { assessBuildingCenterGate } from "./building-center-gate";
import {
  ParcelResolverStatus,
  type ParcelResolver,
} from "./parcel-resolver.port";
import { buildPnu } from "./pnu-builder";
import {
  buildGetFeatureParams,
  classifyGetFeatureResult,
  parseGetFeatureGeoJson,
} from "./vworld-exact-feature";
import {
  IdentityProvenance,
  GeometryProvenance,
  PinProvenance,
  ResolutionStageStatus,
  type BuildingResolutionFailureReason,
  type BuildingResolutionResult,
  type GeoJsonGeometry,
  type ParcelIdentity,
  type RegisterRow,
} from "./building-resolution.types";
import {
  DiagnosticStage,
  emitDiagnostic,
  parcelFingerprintMaterial,
  recordDiagnosticFingerprint,
  type ResolutionDiagnosticSink,
} from "./resolution-diagnostic-trace";

export type BuildingResolutionTarget = {
  roadAddress: string;
  dong: string | null;
  complexNameHint: string | null;
  expectedBuldNmDc: string | null;
  expectedComplexNormalized: string | null;
};

export type BuildingResolutionDeps = {
  parcelResolver: ParcelResolver;
  fetchBuildingHubPage: (
    parcel: ParcelIdentity,
    pageNo: number,
  ) => Promise<{ httpStatus: number; body: unknown }>;
  fetchVworldGetFeature: (
    params: Record<string, string>,
  ) => Promise<{ httpStatus: number; text: string }>;
  maxBuildingHubPages?: number;
  frozenParcel?: ParcelIdentity | null;
  /** Optional scoped diagnostic sink — absent ⇒ no tracing, no behavior change. */
  diagnosticTrace?: ResolutionDiagnosticSink | null;
};

function emptyStages(): import("./building-resolution.types").BuildingResolutionStageReport {
  return {
    addressNormalized: ResolutionStageStatus.PENDING,
    buildingIdentityVerified: ResolutionStageStatus.PENDING,
    buildingGeometryVerified: ResolutionStageStatus.PENDING,
    buildingCenter: ResolutionStageStatus.PENDING,
  };
}

function fail(
  failureReason: BuildingResolutionFailureReason,
  stages: ReturnType<typeof emptyStages>,
  provenance: Partial<
    import("./building-resolution.types").BuildingResolutionProvenance
  > = {},
): BuildingResolutionResult {
  return { ok: false, failureReason, stages, provenance };
}

export function targetFromParsedAddress(parsed: {
  roadAddress: string | null;
  dong: string | null;
  complexName: string | null;
  buildingName: string | null;
}): BuildingResolutionTarget | null {
  if (!parsed.roadAddress?.trim()) return null;
  const dong = parsed.dong?.trim() || null;
  const complexNameHint =
    parsed.complexName?.trim() || parsed.buildingName?.trim() || null;
  const expectedBuldNmDc = dong ? formatDongLabel(dong) : null;
  const expectedComplexNormalized = complexNameHint
    ? normalizeWhitespace(complexNameHint)
    : null;
  return {
    roadAddress: parsed.roadAddress.trim(),
    dong,
    complexNameHint,
    expectedBuldNmDc,
    expectedComplexNormalized,
  };
}

function mapIdentityFailure(
  reason: string | null | undefined,
): BuildingResolutionFailureReason {
  switch (reason) {
    case "REGISTER_DONG_NOT_FOUND":
      return "REGISTER_DONG_NOT_FOUND";
    case "REGISTER_DONG_AMBIGUOUS":
      return "REGISTER_DONG_AMBIGUOUS";
    case "REGISTER_COMPLEX_MISMATCH":
      return "REGISTER_COMPLEX_MISMATCH";
    default:
      return "REGISTER_IDENTITY_UNRESOLVED";
  }
}

function mapCenterFailure(
  reason: string | null | undefined,
): BuildingResolutionFailureReason {
  if (reason === "GEOMETRY_MISSING" || reason === "REPRESENTATIVE_POINT_FAILED") {
    return "GEOMETRY_MISSING";
  }
  if (reason === "GEOMETRY_INVALID" || reason === "INTERIOR_POINT_NOT_INSIDE") {
    return "GEOMETRY_INVALID";
  }
  return "BUILDING_CENTER_NOT_VERIFIED";
}

export async function runBuildingResolutionChain(
  target: BuildingResolutionTarget,
  deps: BuildingResolutionDeps,
): Promise<BuildingResolutionResult> {
  const stages = emptyStages();
  stages.addressNormalized = ResolutionStageStatus.VERIFIED;
  const trace = deps.diagnosticTrace ?? null;

  recordDiagnosticFingerprint(trace, "complex", target.complexNameHint);
  recordDiagnosticFingerprint(trace, "dong", target.dong);

  let parcelResult;
  if (deps.frozenParcel) {
    parcelResult = {
      status: ParcelResolverStatus.RESOLVED,
      parcel: deps.frozenParcel,
      reason: null,
      provenance: deps.frozenParcel.provenance,
    };
  } else {
    parcelResult = await deps.parcelResolver.resolve(target.roadAddress);
  }

  const parcelResolved =
    parcelResult.status === ParcelResolverStatus.RESOLVED &&
    parcelResult.parcel != null;

  emitDiagnostic(trace, DiagnosticStage.PARCEL_RESOLVED, {
    parcelResolved,
    parcelStatus: parcelResult.status,
  });

  if (!parcelResolved || !parcelResult.parcel) {
    return fail(
      parcelResult.status === ParcelResolverStatus.PROVIDER_ERROR
        ? "BUILDING_HUB_FETCH_FAILED"
        : "PARCEL_UNRESOLVED",
      stages,
    );
  }

  const parcel = parcelResult.parcel;
  recordDiagnosticFingerprint(
    trace,
    "parcel",
    parcelFingerprintMaterial(parcel),
  );

  const hubPages = await fetchAllRegisterPages(
    async (pageNo) => {
      const { httpStatus, body } = await deps.fetchBuildingHubPage(parcel, pageNo);
      return {
        httpStatus,
        body: (body ?? {}) as Record<string, unknown>,
      };
    },
    { maxPages: deps.maxBuildingHubPages ?? Infinity },
  );

  emitDiagnostic(trace, DiagnosticStage.BUILDING_HUB_RESPONSE_CLASSIFIED, {
    hubPageClassification: hubPages.kind,
    hubFetchOk: hubPages.ok,
    hubPageCount: hubPages.ok
      ? (hubPages.pageCount ?? null)
      : "pageNo" in hubPages
        ? (hubPages.pageNo as number)
        : null,
    hubTotalCount:
      "totalCount" in hubPages ? (hubPages.totalCount as number | null) : null,
  });

  if (!hubPages.ok) {
    return fail("BUILDING_HUB_FETCH_FAILED", stages);
  }

  const dong = target.dong?.trim();
  if (!dong) {
    return fail("REGISTER_DONG_NOT_FOUND", stages);
  }

  const registerRows = hubPages.items.filter((item) => item != null) as (RegisterRow &
    Record<string, unknown>)[];

  emitDiagnostic(trace, DiagnosticStage.REGISTER_CANDIDATES_NORMALIZED, {
    hubCandidateCount: registerRows.length,
    filteredCandidateCount: registerRows.length,
  });

  const identity = matchBuildingRegisterIdentity(registerRows, {
    dong,
    complexNameHint: target.complexNameHint,
  });

  recordDiagnosticFingerprint(trace, "complex", target.complexNameHint);
  recordDiagnosticFingerprint(trace, "dong", dong);

  emitDiagnostic(trace, DiagnosticStage.REGISTER_IDENTITY_MATCHED, {
    dongMatch: identity.dongMatch,
    complexNameMatch: identity.complexNameMatch,
    identityVerified: identity.identityVerified,
    matchedCandidateCount: identity.matches.length,
  });

  if (!identity.identityVerified) {
    stages.buildingIdentityVerified = ResolutionStageStatus.FAILED;
    const identityFailure = mapIdentityFailure(identity.failureReason);
    emitDiagnostic(trace, DiagnosticStage.FINAL_RESOLUTION_DECISION, {
      finalResolutionClass: "IDENTITY_FAILED",
      failureCode: identityFailure,
    });
    return fail(identityFailure, stages);
  }
  stages.buildingIdentityVerified = ResolutionStageStatus.VERIFIED;

  const pnuResult = buildPnu(parcel);
  recordDiagnosticFingerprint(
    trace,
    "parcel",
    parcelFingerprintMaterial(parcel),
  );
  emitDiagnostic(trace, DiagnosticStage.PNU_BUILT, {
    pnuBuilt: pnuResult.ok,
  });

  if (!pnuResult.ok) {
    return fail("PNU_BUILD_FAILED", stages, {
      identityProvenance: IdentityProvenance.BUILDING_HUB_VERIFIED,
    });
  }

  if (!target.expectedBuldNmDc) {
    return fail("REGISTER_DONG_NOT_FOUND", stages);
  }

  const featureParams = buildGetFeatureParams({
    pnu: pnuResult.pnu,
    buldNmDc: target.expectedBuldNmDc,
    maxFeatures: 10,
  });
  if (!featureParams.ok) {
    emitDiagnostic(trace, DiagnosticStage.VWORLD_GEOMETRY_RESULT, {
      geometryVerified: false,
      vworldFeatureCount: 0,
      vworldTerminal: "PARAM_BUILD_FAILED",
    });
    return fail("VWORLD_FETCH_FAILED", stages, {
      identityProvenance: IdentityProvenance.BUILDING_HUB_VERIFIED,
    });
  }

  const vworldHttp = await deps.fetchVworldGetFeature(featureParams.params);
  if (vworldHttp.httpStatus !== 200) {
    emitDiagnostic(trace, DiagnosticStage.VWORLD_GEOMETRY_RESULT, {
      geometryVerified: false,
      vworldFeatureCount: 0,
      vworldHttpOk: false,
    });
    return fail("VWORLD_FETCH_FAILED", stages, {
      identityProvenance: IdentityProvenance.BUILDING_HUB_VERIFIED,
    });
  }

  const parsed = parseGetFeatureGeoJson(vworldHttp.text);
  const vworldClass = classifyGetFeatureResult(
    parsed,
    {
      pnu: pnuResult.pnu,
      buldNmDc: target.expectedBuldNmDc,
      complexNormalized: target.expectedComplexNormalized,
    },
    { buildingHubIdentityVerified: true },
  );

  const geometryVerified =
    vworldClass.terminal === "READY_FOR_REPRESENTATIVE_POINT";
  emitDiagnostic(trace, DiagnosticStage.VWORLD_GEOMETRY_RESULT, {
    geometryVerified,
    vworldFeatureCount: parsed.features?.length ?? 0,
    vworldTerminal: vworldClass.terminal,
    vworldHttpOk: true,
  });

  if (!geometryVerified) {
    stages.buildingGeometryVerified = ResolutionStageStatus.FAILED;
    const reason = (vworldClass.failureReason ??
      "VWORLD_NO_MATCH") as BuildingResolutionFailureReason;
    return fail(reason, stages, {
      identityProvenance: IdentityProvenance.BUILDING_HUB_VERIFIED,
      complexCorroboration:
        vworldClass.provenance?.complexCorroboration ?? null,
      vworldProviderBuildingId:
        vworldClass.provenance?.vworldProviderBuildingId ?? null,
    });
  }

  stages.buildingGeometryVerified = ResolutionStageStatus.VERIFIED;

  const exactFeature = parsed.features[0];
  const buildingCenter = assessBuildingCenterGate(
    (exactFeature?.geometry ?? null) as GeoJsonGeometry | null,
  );

  emitDiagnostic(trace, DiagnosticStage.INTERIOR_POINT_RESULT, {
    interiorPointContained: buildingCenter.interiorPointInside === true,
    buildingCenterVerified: buildingCenter.verified === true,
  });

  if (!buildingCenter.verified || !buildingCenter.buildingCenter) {
    stages.buildingCenter = ResolutionStageStatus.FAILED;
    const centerFailure = mapCenterFailure(buildingCenter.failureReason);
    return fail(centerFailure, stages, {
      identityProvenance: IdentityProvenance.BUILDING_HUB_VERIFIED,
      geometryProvenance: GeometryProvenance.VWORLD_EXACT_PNU_DONG_FEATURE,
      complexCorroboration: vworldClass.provenance?.complexCorroboration ?? null,
      vworldProviderBuildingId:
        vworldClass.provenance?.vworldProviderBuildingId ?? null,
    });
  }

  stages.buildingCenter = ResolutionStageStatus.VERIFIED;

  emitDiagnostic(trace, DiagnosticStage.FINAL_RESOLUTION_DECISION, {
    finalResolutionClass: "BUILDING_CENTER",
    failureCode: null,
  });

  return {
    ok: true,
    latitude: buildingCenter.buildingCenter.lat,
    longitude: buildingCenter.buildingCenter.lng,
    pnu: pnuResult.pnu,
    complexNameMatch: identity.complexNameMatch,
    provenance: {
      identityProvenance: IdentityProvenance.BUILDING_HUB_VERIFIED,
      geometryProvenance: GeometryProvenance.VWORLD_EXACT_PNU_DONG_FEATURE,
      complexCorroboration:
        vworldClass.provenance?.complexCorroboration ?? null,
      vworldProviderBuildingId:
        vworldClass.provenance?.vworldProviderBuildingId ?? null,
      pinProvenance: PinProvenance.BUILDING_CENTER,
    },
    stages,
    failureReason: null,
  };
}
