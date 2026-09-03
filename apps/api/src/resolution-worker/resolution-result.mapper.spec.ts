import type { AddressResolutionResult } from "../address/address.types";
import { VWORLD_COMPLEX_EVIDENCE } from "../address/address.types";
import {
  mapProviderCallError,
  mapResolutionResult,
  mapThrownError,
} from "./resolution-result.mapper";
import { ResolutionProviderCallError } from "./resolution-worker.types";

const NOW = new Date("2026-09-02T12:00:00.000Z");

function ctx(overrides: Partial<{
  attemptCount: number;
  maxAttempts: number;
}> = {}) {
  return {
    attemptCount: overrides.attemptCount ?? 1,
    maxAttempts: overrides.maxAttempts ?? 8,
    backoffBaseMs: 30_000,
    backoffMaxMs: 3_600_000,
    now: NOW,
  };
}

function baseResult(
  candidate: AddressResolutionResult["decision"]["candidate"],
  unresolvedReason: AddressResolutionResult["decision"]["unresolvedReason"] = null,
): AddressResolutionResult {
  return {
    parsed: {
      originalAddress: "인천광역시 남동구 테스트로 1",
      roadAddress: "인천광역시 남동구 테스트로 1",
      lotAddress: null,
      complexName: null,
      buildingName: null,
      dong: null,
      ho: null,
      postalCode: null,
      normalizedAddress: "인천광역시 남동구 테스트로 1",
      detailAddress: null,
    },
    decision: {
      candidate,
      pinQuality: candidate ? "HIGH_CONFIDENCE" : "UNRESOLVED",
      pinAccuracy: "address",
      unresolvedReason,
      failureMessage: null,
      allCandidates: candidate ? [candidate] : [],
      requiresDong: false,
    },
  };
}

function verifiedBuildingCenter(
  corroboration: string | null = VWORLD_COMPLEX_EVIDENCE.MATCHING,
) {
  const evidence = [
    "building_hub_identity_verified",
    "vworld_exact_pnu_dong_geometry",
  ];
  if (corroboration) {
    evidence.push(`complex_corroboration=${corroboration}`);
  }
  return {
    latitude: 37.4,
    longitude: 126.7,
    provider: "public_building" as const,
    sourceType: "building_hub",
    coordinateType: "BUILDING_CENTER" as const,
    confidence: 0.95,
    evidence,
    createdAt: NOW.toISOString(),
  };
}

describe("resolution-result.mapper", () => {
  it("maps verified BUILDING_CENTER to resolved + building", () => {
    const payload = mapResolutionResult(
      baseResult(verifiedBuildingCenter()),
      ctx(),
    );
    expect(payload.resolutionStatus).toBe("resolved");
    expect(payload.resolutionStage).toBe("building_center");
    expect(payload.pinAccuracy).toBe("building");
    expect(payload.location).toEqual({ latitude: 37.4, longitude: 126.7 });
  });

  it("accepts MODEL B MISSING only with verified BuildingHUB identity", () => {
    const payload = mapResolutionResult(
      baseResult(verifiedBuildingCenter(VWORLD_COMPLEX_EVIDENCE.MISSING)),
      ctx(),
    );
    expect(payload.resolutionStatus).toBe("resolved");
    expect(payload.complexCorroboration).toBe(VWORLD_COMPLEX_EVIDENCE.MISSING);
  });

  it("rejects MODEL B CONTRADICTORY", () => {
    const payload = mapResolutionResult(
      baseResult(verifiedBuildingCenter(VWORLD_COMPLEX_EVIDENCE.CONTRADICTORY)),
      ctx(),
    );
    expect(payload.resolutionStatus).toBe("unresolved");
    expect(payload.resolutionFailureCode).toBe("VWORLD_CONTRADICTORY_COMPLEX");
  });

  it("rejects MODEL B UNKNOWN", () => {
    const payload = mapResolutionResult(
      baseResult(verifiedBuildingCenter(VWORLD_COMPLEX_EVIDENCE.UNKNOWN)),
      ctx(),
    );
    expect(payload.resolutionStatus).toBe("unresolved");
    expect(payload.resolutionFailureCode).toBe("VWORLD_COMPLEX_EVIDENCE_UNKNOWN");
  });

  it("demotes BUILDING_CANDIDATE to lower_quality", () => {
    const payload = mapResolutionResult(
      baseResult({
        latitude: 37.1,
        longitude: 126.1,
        provider: "kakao",
        sourceType: "geocode",
        coordinateType: "BUILDING_CANDIDATE",
        confidence: 0.8,
        evidence: [],
        createdAt: NOW.toISOString(),
      }),
      ctx(),
    );
    expect(payload.resolutionStatus).toBe("lower_quality");
    expect(payload.pinAccuracy).toBe("address");
    expect(payload.resolutionStage).not.toBe("building_center");
  });

  it("demotes COMPLEX_REPRESENTATIVE to lower_quality", () => {
    const payload = mapResolutionResult(
      baseResult({
        latitude: 37.2,
        longitude: 126.2,
        provider: "kakao",
        sourceType: "geocode",
        coordinateType: "COMPLEX_REPRESENTATIVE",
        confidence: 0.75,
        evidence: [],
        createdAt: NOW.toISOString(),
      }),
      ctx(),
    );
    expect(payload.resolutionStatus).toBe("lower_quality");
    expect(payload.pinAccuracy).toBe("address");
  });

  it("demotes high-confidence geocode to lower_quality", () => {
    const payload = mapResolutionResult(
      baseResult({
        latitude: 37.3,
        longitude: 126.3,
        provider: "naver",
        sourceType: "geocode",
        coordinateType: "BUILDING_VERIFIED",
        confidence: 0.92,
        evidence: ["high_confidence_geocode"],
        createdAt: NOW.toISOString(),
      }),
      ctx(),
    );
    expect(payload.resolutionStatus).toBe("lower_quality");
    expect(payload.pinAccuracy).toBe("address");
  });

  it("maps address-level geocode to lower_quality", () => {
    const payload = mapResolutionResult(
      baseResult({
        latitude: 37.5,
        longitude: 126.5,
        provider: "kakao",
        sourceType: "geocode",
        coordinateType: "BUILDING_CANDIDATE",
        confidence: 0.55,
        evidence: [],
        createdAt: NOW.toISOString(),
      }),
      ctx(),
    );
    expect(payload.resolutionStatus).toBe("lower_quality");
    expect(payload.pinAccuracy).toBe("address");
  });

  it("classifies provider timeout", () => {
    const payload = mapProviderCallError(
      new ResolutionProviderCallError("timeout"),
      ctx(),
    );
    expect(payload.resolutionStatus).toBe("provider_error");
    expect(payload.resolutionFailureCode).toBe("PROVIDER_TIMEOUT");
    expect(payload.resolutionNextAttemptAt).not.toBeNull();
    expect(payload.retryDelayMs).toBeGreaterThan(0);
    expect(payload.retryDelayMs).toBeLessThanOrEqual(3_600_000);
  });

  it("classifies provider 429", () => {
    const payload = mapProviderCallError(
      new ResolutionProviderCallError("rate_limited"),
      ctx(),
    );
    expect(payload.resolutionFailureCode).toBe("PROVIDER_RATE_LIMITED");
  });

  it("classifies provider 401/403", () => {
    const payload = mapProviderCallError(
      new ResolutionProviderCallError("auth_failed"),
      ctx(),
    );
    expect(payload.resolutionFailureCode).toBe("PROVIDER_AUTH_FAILED");
  });

  it("classifies provider 5xx", () => {
    const payload = mapProviderCallError(
      new ResolutionProviderCallError("server_error"),
      ctx(),
    );
    expect(payload.resolutionFailureCode).toBe("PROVIDER_TIMEOUT");
  });

  it("keeps provider_error after retry exhaustion", () => {
    const payload = mapProviderCallError(
      new ResolutionProviderCallError("timeout"),
      ctx({ attemptCount: 8, maxAttempts: 8 }),
    );
    expect(payload.resolutionStatus).toBe("provider_error");
    expect(payload.resolutionRetryExhausted).toBe(true);
    expect(payload.resolutionNextAttemptAt).toBeNull();
    expect(payload.resolutionFailureCode).toBe("PROVIDER_TIMEOUT");
  });

  it("maps unknown thrown errors to provider timeout", () => {
    const payload = mapThrownError(new Error("network down"), ctx());
    expect(payload.resolutionStatus).toBe("provider_error");
    expect(payload.resolutionFailureCode).toBe("PROVIDER_TIMEOUT");
  });
});
