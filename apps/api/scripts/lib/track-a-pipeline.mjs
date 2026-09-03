/**
 * Research-only TRACK A end-to-end pipeline orchestrator.
 * Fail-closed at each stage — no proximity/nearest/bbox identity fallbacks.
 */

import { mapRegisterIdentityToTerminal, mapVworldToTerminal, TerminalState } from "./benchmark-report.mjs";
import {
  buildBrTitleInfoUrl,
  classifyBuildingHubResponse,
  extractRegisterItems,
  fetchAllRegisterPages,
} from "./building-hub-client.mjs";
import { matchBuildingRegisterIdentity } from "./building-identity-matcher.mjs";
import { assessBuildingCenterGate } from "./building-center-gate.mjs";
import { ParcelResolverStatus } from "./parcel-resolver.port.mjs";
import { buildPnu } from "./pnu-builder.mjs";
import {
  buildGetFeatureParams,
  classifyGetFeatureResult,
  parseGetFeatureGeoJson,
} from "./vworld-exact-feature.mjs";

export function manifestToPipelineTarget(manifestTarget) {
  return {
    targetId: manifestTarget.targetId,
    roadAddress: manifestTarget.roadAddress,
    detailAddress: manifestTarget.detailAddress,
    parsedDong: manifestTarget.parsedDong,
    expectedBuldNmDc: manifestTarget.expectedBuldNmDc,
    complexNameHint: manifestTarget.complexNameHint,
    expectedComplexNormalized: manifestTarget.expectedComplexNormalized,
  };
}

export function parcelToBuildingHubQuery(parcel) {
  return {
    sigunguCd: parcel.sigunguCd,
    bjdongCd: parcel.bjdongCd,
    platGbCd: parcel.platGbCd,
    bun: parcel.bun,
    ji: parcel.ji,
  };
}

/**
 * @typedef {object} TrackAPipelineDeps
 * @property {{ resolve: (roadAddress:string)=>Promise<object> }} parcelResolver
 * @property {(parcel:object, pageNo:number)=>Promise<{httpStatus:number, body:object}>} fetchBuildingHubPage
 * @property {(params:object)=>Promise<{httpStatus:number, text:string}>} fetchVworldGetFeature
 * @property {string} [buildingHubServiceKey] — used only to validate URL wiring in tests
 */

/**
 * Run full TRACK A research chain with injected fetchers (mock or live).
 * @param {import("./track-a-manifest.mjs").TRACK_A_TARGETS[0]} target
 * @param {TrackAPipelineDeps} deps
 */
export async function runTrackAPipeline(target, deps) {
  const counters = {
    kakaoRequests: 0,
    buildingHubRequests: 0,
    vworldRequests: 0,
  };

  const manifest = manifestToPipelineTarget(target);

  // ── 1. Parcel (Kakao or frozen research parcel) ──
  let parcelResult;
  if (deps.frozenParcel) {
    parcelResult = {
      status: ParcelResolverStatus.RESOLVED,
      parcel: { ...deps.frozenParcel, provenance: deps.frozenParcel.provenance ?? "FROZEN_PARCEL" },
    };
  } else {
    if (deps.budget?.remaining != null && deps.budget.remaining() <= 0) {
      return finalizePipelineResult({
        targetId: manifest.targetId,
        terminal: TerminalState.PROVIDER_ERROR,
        failureReason: "NETWORK_BUDGET_EXCEEDED",
        pipelineBlockedAt: "PARCEL_RESOLVER",
        counters,
        networkBudgetExceeded: "YES",
      });
    }
    counters.kakaoRequests += 1;
    if (deps.budget) deps.budget.consume(1);
    parcelResult = await deps.parcelResolver.resolve(manifest.roadAddress);
  }

  if (parcelResult.status !== ParcelResolverStatus.RESOLVED || !parcelResult.parcel) {
    return finalizePipelineResult({
      targetId: manifest.targetId,
      terminal:
        parcelResult.status === ParcelResolverStatus.PROVIDER_ERROR
          ? TerminalState.PROVIDER_ERROR
          : TerminalState.IDENTITY_UNRESOLVED,
      failureReason: parcelResult.reason ?? "PARCEL_UNRESOLVED",
      pipelineBlockedAt: "PARCEL_RESOLVER",
      parcelResult,
      counters,
    });
  }

  const parcel = parcelResult.parcel;
  const hubQuery = parcelToBuildingHubQuery(parcel);

  // ── 2. BuildingHUB pagination ──
  const hubPages = await fetchAllRegisterPages(async (pageNo) => {
    if (deps.budget?.remaining != null && deps.budget.remaining() <= 0) {
      return { httpStatus: 0, body: null, budgetExceeded: true };
    }
    counters.buildingHubRequests += 1;
    if (deps.budget) deps.budget.consume(1);
    return deps.fetchBuildingHubPage(hubQuery, pageNo);
  }, { maxPages: deps.maxBuildingHubPages ?? Infinity });

  if (hubPages.kind === "BUDGET_EXCEEDED") {
    return finalizePipelineResult({
      targetId: manifest.targetId,
      terminal: TerminalState.PROVIDER_ERROR,
      failureReason: hubPages.reason ?? "NETWORK_BUDGET_EXCEEDED",
      pipelineBlockedAt: "BUILDING_HUB",
      parcelResult,
      hubQuery,
      hubPages,
      counters,
      networkBudgetExceeded: "YES",
    });
  }

  if (!hubPages.ok) {
    const identityTerminal = mapRegisterIdentityToTerminal(
      { identityVerified: false, failureReason: "BUILDING_HUB_FETCH_FAILED" },
      hubPages.kind,
    );
    return finalizePipelineResult({
      targetId: manifest.targetId,
      terminal: identityTerminal.terminal,
      failureReason: identityTerminal.failureReason,
      pipelineBlockedAt: "BUILDING_HUB",
      parcelResult,
      hubQuery,
      hubPages,
      counters,
    });
  }

  const identity = matchBuildingRegisterIdentity(hubPages.items, {
    dong: manifest.parsedDong,
    complexNameHint: manifest.complexNameHint,
    roadAddress: manifest.roadAddress,
  });

  const identityTerminal = mapRegisterIdentityToTerminal(identity, hubPages.kind);
  if (!identity.identityVerified) {
    return finalizePipelineResult({
      targetId: manifest.targetId,
      terminal: identityTerminal.terminal,
      failureReason: identityTerminal.failureReason ?? identity.failureReason,
      pipelineBlockedAt: "BUILDING_IDENTITY",
      parcelResult,
      hubQuery,
      hubPages,
      identity,
      counters,
    });
  }

  // ── 3. PNU ──
  const pnuResult = buildPnu(parcel);
  if (!pnuResult.ok) {
    return finalizePipelineResult({
      targetId: manifest.targetId,
      terminal: TerminalState.IDENTITY_UNRESOLVED,
      failureReason: pnuResult.reason ?? "PNU_BUILD_FAILED",
      pipelineBlockedAt: "PNU",
      parcelResult,
      hubQuery,
      hubPages,
      identity,
      pnuResult,
      counters,
    });
  }

  // ── 4. VWorld exact GetFeature (PNU + exact dong only) ──
  const featureParams = buildGetFeatureParams({
    pnu: pnuResult.pnu,
    buldNmDc: manifest.expectedBuldNmDc,
    maxFeatures: 10,
  });
  if (!featureParams.ok) {
    return finalizePipelineResult({
      targetId: manifest.targetId,
      terminal: TerminalState.PROVIDER_ERROR,
      failureReason: featureParams.reason,
      pipelineBlockedAt: "VWORLD_QUERY",
      parcelResult,
      hubQuery,
      hubPages,
      identity,
      pnuResult,
      counters,
    });
  }

  counters.vworldRequests += 1;
  if (deps.budget?.remaining != null && deps.budget.remaining() <= 0) {
    return finalizePipelineResult({
      targetId: manifest.targetId,
      terminal: TerminalState.PROVIDER_ERROR,
      failureReason: "NETWORK_BUDGET_EXCEEDED",
      pipelineBlockedAt: "VWORLD_EXACT_FEATURE",
      parcelResult,
      hubQuery,
      hubPages,
      identity,
      pnuResult,
      counters,
      networkBudgetExceeded: "YES",
    });
  }
  if (deps.budget) deps.budget.consume(1);
  const vworldHttp = await deps.fetchVworldGetFeature(featureParams.params);
  const parsed = parseGetFeatureGeoJson(vworldHttp.text);
  const vworldClass = classifyGetFeatureResult(parsed, {
    pnu: pnuResult.pnu,
    buldNmDc: manifest.expectedBuldNmDc,
    complexNormalized: manifest.expectedComplexNormalized,
  }, {
    buildingHubIdentityVerified: identity.identityVerified === true,
  });

  const vworldTerminal = mapVworldToTerminal(vworldClass);
  if (vworldClass.terminal !== "READY_FOR_REPRESENTATIVE_POINT") {
    return finalizePipelineResult({
      targetId: manifest.targetId,
      terminal: vworldTerminal.terminal,
      failureReason: vworldTerminal.failureReason ?? vworldClass.failureReason,
      pipelineBlockedAt: "VWORLD_EXACT_FEATURE",
      parcelResult,
      hubQuery,
      hubPages,
      identity,
      pnuResult,
      vworldClass,
      featureCount: vworldClass.featureCount,
      counters,
    });
  }

  // ── 5. Representative geometry — exact matched feature only ──
  const exactFeature = parsed.features[0];
  const buildingCenter = assessBuildingCenterGate(exactFeature.geometry);

  if (!buildingCenter.verified) {
    return finalizePipelineResult({
      targetId: manifest.targetId,
      terminal: TerminalState.GEOMETRY_UNRESOLVED,
      failureReason: buildingCenter.failureReason,
      pipelineBlockedAt: "REPRESENTATIVE_POINT",
      parcelResult,
      hubQuery,
      hubPages,
      identity,
      pnuResult,
      vworldClass,
      featureCount: 1,
      buildingCenter,
      counters,
    });
  }

  return finalizePipelineResult({
    targetId: manifest.targetId,
    terminal: TerminalState.BUILDING_CENTER_VERIFIED,
    failureReason: null,
    pipelineBlockedAt: null,
    parcelResult,
    hubQuery,
    hubPages,
    identity,
    pnuResult,
    vworldClass,
    featureCount: 1,
    buildingCenter,
    provenance: {
      identityProvenance: "BUILDING_HUB_VERIFIED",
      geometryProvenance: "VWORLD_EXACT_PNU_DONG_FEATURE",
      complexCorroboration: vworldClass.provenance?.complexCorroboration ?? null,
      vworldProviderBuildingId: vworldClass.provenance?.vworldProviderBuildingId ?? null,
      pinProvenance: "BUILDING_CENTER",
    },
    counters,
  });
}

function finalizePipelineResult(base) {
  return {
    ...base,
    coordinateSelectionUsed: "NO",
    proximityUsed: "NO",
    roadBuildingNumberFallbackUsed: "NO",
    nearestBuildingFallbackUsed: "NO",
    bboxIdentityFallbackUsed: "NO",
  };
}

export function buildBuildingHubUrlForParcel(parcel, serviceKey, pageNo = 1) {
  return buildBrTitleInfoUrl(parcel, serviceKey, pageNo);
}

export function classifyBuildingHubPage(httpStatus, body) {
  return classifyBuildingHubResponse(httpStatus, body);
}

export function extractHubItems(body) {
  return extractRegisterItems(body);
}
