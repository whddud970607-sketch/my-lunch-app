import type { AddressResolutionResult } from "../address/address.types";
import {
  GEOMETRY_PROVENANCE,
  IDENTITY_PROVENANCE,
  VWORLD_COMPLEX_EVIDENCE,
} from "../address/address.types";
import type { CoordinateCandidate } from "../address/address.types";
import { computeRetryDelayMs, nextAttemptAt } from "./resolution-backoff";
import type {
  ResolutionFailureCodeDb,
  ResolutionPersistPayload,
  ResolutionProviderCallError,
} from "./resolution-worker.types";

export type ClassifyContext = {
  attemptCount: number;
  maxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  now: Date;
};

export function mapResolutionResult(
  result: AddressResolutionResult,
  ctx: ClassifyContext,
): ResolutionPersistPayload {
  const { decision, parsed } = result;
  const normalizedAddress = parsed.normalizedAddress || null;

  if (!decision.candidate) {
    return mapUnresolvedDecision(decision.unresolvedReason, ctx, normalizedAddress);
  }

  const candidate = decision.candidate;
  if (isVerifiedBuildingCenter(candidate)) {
    const corroboration = parseComplexCorroboration(candidate.evidence);
    if (
      corroboration === VWORLD_COMPLEX_EVIDENCE.CONTRADICTORY ||
      corroboration === VWORLD_COMPLEX_EVIDENCE.UNKNOWN
    ) {
      return terminalUnresolved(
        corroboration === VWORLD_COMPLEX_EVIDENCE.CONTRADICTORY
          ? "VWORLD_CONTRADICTORY_COMPLEX"
          : "VWORLD_COMPLEX_EVIDENCE_UNKNOWN",
        normalizedAddress,
      );
    }
    return {
      resolutionStatus: "resolved",
      resolutionStage: "building_center",
      pinAccuracy: "building",
      location: {
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      },
      identityProvenance: IDENTITY_PROVENANCE.BUILDING_HUB_VERIFIED,
      geometryProvenance: GEOMETRY_PROVENANCE.VWORLD_EXACT_PNU_DONG_FEATURE,
      complexCorroboration: corroboration,
      resolvedAt: ctx.now,
      resolutionFailureCode: null,
      resolutionNextAttemptAt: null,
      resolutionRetryExhausted: false,
      normalizedAddress,
    };
  }

  return lowerQualityFromCandidate(candidate, normalizedAddress, ctx.now);
}

export function mapProviderCallError(
  error: ResolutionProviderCallError,
  ctx: ClassifyContext,
): ResolutionPersistPayload {
  const code = providerErrorCode(error);
  return providerErrorPayload(code, ctx);
}

export function mapThrownError(
  error: unknown,
  ctx: ClassifyContext,
): ResolutionPersistPayload {
  if (isProviderCallError(error)) {
    return mapProviderCallError(error, ctx);
  }
  return providerErrorPayload("PROVIDER_TIMEOUT", ctx);
}

function lowerQualityFromCandidate(
  candidate: CoordinateCandidate,
  normalizedAddress: string | null,
  now: Date,
): ResolutionPersistPayload {
  const geometry = mapGeometryProvenance(candidate.provider);
  return {
    resolutionStatus: "lower_quality",
    resolutionStage: "address_normalized",
    pinAccuracy: "address",
    location: {
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    },
    identityProvenance: null,
    geometryProvenance: geometry,
    complexCorroboration: null,
    resolvedAt: now,
    resolutionFailureCode: null,
    resolutionNextAttemptAt: null,
    resolutionRetryExhausted: false,
    normalizedAddress,
  };
}

function mapUnresolvedDecision(
  reason: string | null,
  ctx: ClassifyContext,
  normalizedAddress: string | null,
): ResolutionPersistPayload {
  if (reason === "conflicting_candidates") {
    return {
      resolutionStatus: "ambiguous",
      resolutionStage: "failed",
      pinAccuracy: "address",
      location: null,
      identityProvenance: null,
      geometryProvenance: null,
      complexCorroboration: null,
      resolvedAt: null,
      resolutionFailureCode: "QUALITY_GATE_REJECTED",
      resolutionNextAttemptAt: null,
      resolutionRetryExhausted: false,
      normalizedAddress,
    };
  }

  if (
    reason === "provider_timeout" ||
    reason === "provider_error" ||
    reason === "provider_not_configured" ||
    reason === "public_data_unavailable"
  ) {
    const code =
      reason === "provider_not_configured"
        ? "PROVIDER_CONFIGURATION_ERROR"
        : reason === "provider_timeout"
          ? "PROVIDER_TIMEOUT"
          : "PROVIDER_TIMEOUT";
    return providerErrorPayload(code, ctx, normalizedAddress);
  }

  const code: ResolutionFailureCodeDb =
    reason === "no_candidates"
      ? "NO_CANDIDATES"
      : reason === "dong_required_but_unresolved"
        ? "REGISTER_DONG_NOT_FOUND"
        : "QUALITY_GATE_REJECTED";

  return terminalUnresolved(code, normalizedAddress);
}

function providerErrorPayload(
  code: ResolutionFailureCodeDb,
  ctx: ClassifyContext,
  normalizedAddress: string | null = null,
): ResolutionPersistPayload {
  const exhausted = ctx.attemptCount >= ctx.maxAttempts;
  const delayMs = exhausted
    ? null
    : computeRetryDelayMs({
        attemptCount: ctx.attemptCount,
        baseMs: ctx.backoffBaseMs,
        maxMs: ctx.backoffMaxMs,
        rateLimited: code === "PROVIDER_RATE_LIMITED",
      });

  return {
    resolutionStatus: "provider_error",
    resolutionStage: "failed",
    pinAccuracy: "address",
    location: null,
    identityProvenance: null,
    geometryProvenance: null,
    complexCorroboration: null,
    resolvedAt: null,
    resolutionFailureCode: code,
    resolutionNextAttemptAt:
      delayMs == null ? null : nextAttemptAt(ctx.now, delayMs),
    retryDelayMs: delayMs,
    resolutionRetryExhausted: exhausted,
    normalizedAddress,
  };
}

function terminalUnresolved(
  code: ResolutionFailureCodeDb,
  normalizedAddress: string | null,
): ResolutionPersistPayload {
  return {
    resolutionStatus: "unresolved",
    resolutionStage: "failed",
    pinAccuracy: "address",
    location: null,
    identityProvenance: null,
    geometryProvenance: null,
    complexCorroboration: null,
    resolvedAt: null,
    resolutionFailureCode: code,
    resolutionNextAttemptAt: null,
    resolutionRetryExhausted: false,
    normalizedAddress,
  };
}

function isVerifiedBuildingCenter(candidate: CoordinateCandidate): boolean {
  return (
    candidate.coordinateType === "BUILDING_CENTER" &&
    candidate.evidence.includes("building_hub_identity_verified") &&
    candidate.evidence.includes("vworld_exact_pnu_dong_geometry")
  );
}

function parseComplexCorroboration(
  evidence: string[],
): string | null {
  const line = evidence.find((e) => e.startsWith("complex_corroboration="));
  if (!line) return null;
  const val = line.split("=")[1];
  if (!val || val === "null") return null;
  return val;
}

function mapGeometryProvenance(
  provider: string,
): string | null {
  if (provider === "kakao") return "KAKAO_GEOCODE";
  if (provider === "naver") return "NAVER_GEOCODE";
  return null;
}

function providerErrorCode(
  error: ResolutionProviderCallError,
): ResolutionFailureCodeDb {
  switch (error.kind) {
    case "rate_limited":
      return "PROVIDER_RATE_LIMITED";
    case "auth_failed":
      return "PROVIDER_AUTH_FAILED";
    case "configuration":
      return "PROVIDER_CONFIGURATION_ERROR";
    case "timeout":
    case "network":
    case "server_error":
    default:
      return "PROVIDER_TIMEOUT";
  }
}

function isProviderCallError(
  error: unknown,
): error is ResolutionProviderCallError {
  return (
    typeof error === "object" &&
    error != null &&
    (error as { name?: string }).name === "ResolutionProviderCallError"
  );
}
