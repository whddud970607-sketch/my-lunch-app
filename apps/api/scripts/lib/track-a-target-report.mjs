/**
 * Sanitized per-target report for TRACK A full pilot.
 */

import { ParcelResolverStatus } from "./parcel-resolver.port.mjs";
import { TerminalState } from "./benchmark-report.mjs";
import { summarizeRegisterDongEvidence } from "./building-identity-matcher.mjs";

export function classifyTargetStages(result) {
  const parcelResolved =
    result.parcelResult?.status === ParcelResolverStatus.RESOLVED &&
    result.parcelResult?.parcel != null;

  const identityVerified = result.identity?.identityVerified === true;

  const geometryVerified =
    result.vworldClass?.terminal === "READY_FOR_REPRESENTATIVE_POINT" &&
    result.featureCount === 1;

  const buildingCenterVerified = result.buildingCenter?.verified === true;

  let failureReason = result.failureReason ?? null;
  if (!failureReason && result.pipelineBlockedAt) {
    failureReason = result.failureReason ?? result.pipelineBlockedAt;
  }

  return {
    PARCEL_RESOLVED: parcelResolved ? "YES" : "NO",
    BUILDING_IDENTITY_VERIFIED: identityVerified ? "YES" : "NO",
    BUILDING_GEOMETRY_VERIFIED: geometryVerified ? "YES" : "NO",
    BUILDING_CENTER_VERIFIED: buildingCenterVerified ? "YES" : "NO",
    FAILURE_REASON: failureReason,
    pipelineBlockedAt: result.pipelineBlockedAt ?? null,
    terminal: result.terminal ?? null,
    networkBudgetExceeded: result.networkBudgetExceeded ?? "NO",
  };
}

export function sanitizeTargetReport(result) {
  const stages = classifyTargetStages(result);
  const parcel = result.parcelResult?.parcel ?? null;

  return {
    targetId: result.targetId,
    ...stages,
    parcel: parcel
      ? {
          sigunguCd: parcel.sigunguCd,
          bjdongCd: parcel.bjdongCd,
          platGbCd: parcel.platGbCd,
          bun: parcel.bun,
          ji: parcel.ji,
          provenance: parcel.provenance ?? null,
        }
      : null,
    pnu: result.pnuResult?.ok ? result.pnuResult.pnu : null,
    dongMatch: result.identity?.dongMatch ?? null,
    complexNameMatch: result.identity?.complexNameMatch ?? null,
    featureCount: result.featureCount ?? 0,
    buildingHubPageCount: result.hubPages?.pageCount ?? result.counters?.buildingHubRequests ?? 0,
    buildingHubTotalCount: result.hubPages?.totalCount ?? null,
    registerDongEvidence:
      result.identity?.identityVerified === false && result.hubPages?.items
        ? summarizeRegisterDongEvidence(result.hubPages.items)
        : null,
    buildingCenter: result.buildingCenter?.buildingCenter ?? null,
    selectedMethod: result.buildingCenter?.selectedMethod ?? "NONE",
    counters: result.counters ?? null,
  };
}

export function classifyTrackAPilotVerdict(reports) {
  const verified = reports.filter((r) => r.BUILDING_CENTER_VERIFIED === "YES").length;
  let verdict = "FAIL";
  if (verified === reports.length) verdict = "PASS";
  else if (verified === reports.length - 1 && reports.length >= 2) verdict = "PARTIAL_PASS";

  let generalization = "NOT_SUPPORTED";
  if (verified === reports.length) generalization = "SUPPORTED";
  else if (verified >= 2) generalization = "PARTIAL";

  let nextAction = "ANALYZE_GENERALIZATION_FAILURE";
  if (verdict === "PASS") {
    nextAction = "TRACK_B_IDENTITY_GATE";
  } else if (verdict === "PARTIAL_PASS") {
    nextAction = "ANALYZE_FAILED_TARGET_WITHOUT_FALLBACK";
  }

  return {
    BUILDING_CENTER_VERIFIED_COUNT: verified,
    TRACK_A_FULL_PILOT: verdict,
    BUILDING_RESOLUTION_GENERALIZATION: generalization,
    NEXT_REQUIRED_ACTION: nextAction,
  };
}

export function flattenTargetReportForFinal(sanitized) {
  const id = sanitized.targetId;
  return {
    [`${id}_PARCEL`]: sanitized.PARCEL_RESOLVED,
    [`${id}_IDENTITY`]: sanitized.BUILDING_IDENTITY_VERIFIED,
    [`${id}_GEOMETRY`]: sanitized.BUILDING_GEOMETRY_VERIFIED,
    [`${id}_BUILDING_CENTER`]: sanitized.BUILDING_CENTER_VERIFIED,
    [`${id}_FAILURE_REASON`]: sanitized.FAILURE_REASON,
  };
}
