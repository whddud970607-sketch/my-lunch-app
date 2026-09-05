import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  AddressResolutionInput,
  AddressResolutionResult,
  CoordinateCandidate,
} from "./address.types";
import { parseAddress } from "./address.parser";
import { fuseCandidates } from "./coordinate-fusion.service";
import { scoreCandidateConfidence } from "./confidence-scorer.service";
import { applyPinQualityGate } from "./pin-quality-gate.service";
import { KakaoGeocodeAdapter } from "./adapters/kakao-geocode.adapter";
import { NaverGeocodeAdapter } from "./adapters/naver-geocode.adapter";
import { PublicBuildingDataAdapter } from "./adapters/public-building-data.adapter";
import type { GeocodeProvider } from "./ports/geocode-provider.port";
import type { BuildingDataProvider } from "./ports/building-data-provider.port";
import {
  DiagnosticStage,
  emitDiagnostic,
  type ResolutionDiagnosticSink,
} from "./building/resolution-diagnostic-trace";

const PRIMARY_CONFIDENCE_STOP = 0.78;
const PROVIDER_TIMEOUT_MS = 8000;

export type ProviderOrchestrationPolicy = {
  primaryProviderId: "kakao" | "naver";
  secondaryProviderId: "kakao" | "naver" | null;
  invokePublicBuildingWhenDongRequired: boolean;
};

export type AddressResolveOptions = {
  /** Scoped diagnostic collector — absent ⇒ no tracing. */
  diagnosticTrace?: ResolutionDiagnosticSink | null;
};

@Injectable()
export class AddressResolutionService {
  private readonly kakao: KakaoGeocodeAdapter;
  private readonly naver: NaverGeocodeAdapter;
  private readonly publicBuilding: PublicBuildingDataAdapter;
  private readonly geocodeProviders: GeocodeProvider[];

  constructor(private readonly config: ConfigService) {
    this.kakao = new KakaoGeocodeAdapter(
      this.config.get<string>("KAKAO_REST_API_KEY"),
    );
    this.naver = new NaverGeocodeAdapter(
      this.config.get<string>("NAVER_MAP_CLIENT_ID"),
      this.config.get<string>("NAVER_MAP_CLIENT_SECRET"),
    );
    this.publicBuilding = new PublicBuildingDataAdapter({ config: this.config });
    this.geocodeProviders = [this.kakao, this.naver];
  }

  isKakaoConfigured(): boolean {
    return this.kakao.isConfigured();
  }

  /**
   * Interactive Kakao address.json typeahead. Does not run Track A resolution.
   */
  searchAddressDocuments(query: string) {
    return this.kakao.searchAddressDocuments(query);
  }

  lookupApartmentDongCoords(args: {
    buildingName: string | null;
    dong: string | null;
    latitude: number;
    longitude: number;
  }) {
    if (!args.buildingName || !args.dong) return Promise.resolve(null);
    return this.kakao.lookupApartmentDong({
      buildingName: args.buildingName,
      dong: args.dong,
      latitude: args.latitude,
      longitude: args.longitude,
    });
  }

  getOrchestrationPolicy(): ProviderOrchestrationPolicy {
    const kakaoOn = this.kakao.isConfigured();
    const naverOn = this.naver.isConfigured();
    return {
      primaryProviderId: kakaoOn ? "kakao" : naverOn ? "naver" : "kakao",
      secondaryProviderId:
        kakaoOn && naverOn ? "naver" : kakaoOn ? null : naverOn ? null : null,
      invokePublicBuildingWhenDongRequired: true,
    };
  }

  async resolve(
    input: AddressResolutionInput,
    options?: AddressResolveOptions,
  ): Promise<AddressResolutionResult> {
    const trace = options?.diagnosticTrace ?? null;

    emitDiagnostic(trace, DiagnosticStage.INPUT_RECEIVED, {
      hasComplexNameHint: Boolean(input.complexNameHint?.trim()),
      hasDongHint: Boolean(input.dongHint?.trim()),
      hasComplexName: Boolean(input.complexName?.trim()),
      hasBuildingName: Boolean(input.buildingName?.trim()),
      hasDetailAddress: Boolean(input.detailAddress?.trim()),
    });

    emitDiagnostic(trace, DiagnosticStage.HINTS_EXTRACTED, {
      hasComplexNameHint: Boolean(input.complexNameHint?.trim()),
      hasDongHint: Boolean(input.dongHint?.trim()),
    });

    const parsed = parseAddress(input);

    emitDiagnostic(trace, DiagnosticStage.ADDRESS_PARSED, {
      hasParsedComplexName: Boolean(parsed.complexName),
      hasParsedBuildingName: Boolean(parsed.buildingName),
      hasParsedDong: Boolean(parsed.dong),
      requiresDong: Boolean(parsed.dong),
    });

    const requiresDong = Boolean(parsed.dong);
    const policy = this.getOrchestrationPolicy();

    const primary = this.providerById(policy.primaryProviderId);
    const secondary = policy.secondaryProviderId
      ? this.providerById(policy.secondaryProviderId)
      : null;

    let candidates: CoordinateCandidate[] = [];

    if (primary?.isConfigured()) {
      candidates.push(...(await this.safeResolve(primary, parsed)));
    } else if (!secondary?.isConfigured()) {
      const unresolved = this.unresolvedResult(
        parsed,
        requiresDong,
        "provider_not_configured",
      );
      emitDiagnostic(trace, DiagnosticStage.FINAL_RESOLUTION_DECISION, {
        finalResolutionClass: unresolved.decision.pinQuality,
        failureCode: unresolved.decision.unresolvedReason,
        hasCandidate: false,
      });
      return unresolved;
    }

    const primaryBest = candidates[0];
    const primaryEnough =
      primaryBest &&
      primaryBest.confidence >= PRIMARY_CONFIDENCE_STOP &&
      (!requiresDong || primaryBest.coordinateType === "BUILDING_CANDIDATE");

    if (!primaryEnough && secondary?.isConfigured()) {
      candidates.push(...(await this.safeResolve(secondary, parsed)));
    }

    const dongStillMissing =
      requiresDong &&
      !candidates.some(
        (c) =>
          isAuthoritativeDongCandidate(c) && c.resolvedDong === parsed.dong,
      );

    if (
      dongStillMissing &&
      policy.invokePublicBuildingWhenDongRequired &&
      this.publicBuilding.isConfigured()
    ) {
      candidates.push(
        ...(await this.safeResolveBuilding(this.publicBuilding, parsed, trace)),
      );
    }

    const fusion = fuseCandidates(candidates);
    const adjustedConfidences = fusion.ranked.map((c) =>
      scoreCandidateConfidence(c, {
        requiresDong,
        hasProviderConflict: fusion.hasConflict,
      }),
    );

    const decision = applyPinQualityGate({
      rankedCandidates: fusion.ranked,
      requiresDong,
      hasProviderConflict: fusion.hasConflict,
      adjustedConfidences,
    });

    if (fusion.hasConflict && decision.candidate && decision.pinQuality !== "VERIFIED") {
      decision.unresolvedReason = "conflicting_candidates";
      if (decision.pinQuality === "UNRESOLVED") {
        decision.candidate = null;
        decision.failureMessage =
          "Providers returned conflicting coordinates beyond quality threshold";
      }
    }

    emitDiagnostic(trace, DiagnosticStage.FINAL_RESOLUTION_DECISION, {
      finalResolutionClass: decision.pinQuality,
      failureCode: decision.unresolvedReason,
      hasCandidate: decision.candidate != null,
      candidateCoordinateType: decision.candidate?.coordinateType ?? null,
      candidateProvider: decision.candidate?.provider ?? null,
    });

    return { parsed, decision };
  }

  private providerById(id: "kakao" | "naver"): GeocodeProvider | null {
    if (id === "kakao") return this.kakao;
    if (id === "naver") return this.naver;
    return null;
  }

  private async safeResolve(
    provider: GeocodeProvider,
    parsed: Parameters<GeocodeProvider["resolveCandidates"]>[0],
  ): Promise<CoordinateCandidate[]> {
    try {
      return await withTimeout(
        provider.resolveCandidates(parsed),
        PROVIDER_TIMEOUT_MS,
      );
    } catch {
      return [];
    }
  }

  private async safeResolveBuilding(
    provider: BuildingDataProvider,
    parsed: Parameters<BuildingDataProvider["resolveBuildingCandidates"]>[0],
    trace: ResolutionDiagnosticSink | null,
  ): Promise<CoordinateCandidate[]> {
    try {
      const resolve = provider.resolveBuildingCandidates.bind(provider);
      return await withTimeout(
        resolve(parsed, trace ? { diagnosticTrace: trace } : undefined),
        PROVIDER_TIMEOUT_MS,
      );
    } catch {
      return [];
    }
  }

  private unresolvedResult(
    parsed: AddressResolutionResult["parsed"],
    requiresDong: boolean,
    reason: AddressResolutionResult["decision"]["unresolvedReason"],
  ): AddressResolutionResult {
    return {
      parsed,
      decision: {
        candidate: null,
        pinQuality: "UNRESOLVED",
        pinAccuracy: "address",
        unresolvedReason: reason,
        failureMessage: "No geocode provider configured",
        allCandidates: [],
        requiresDong,
      },
    };
  }
}

/** Keyword/radius Kakao dong hits are candidate-only — never block verified building chain. */
function isAuthoritativeDongCandidate(candidate: CoordinateCandidate): boolean {
  if (candidate.coordinateType === "BUILDING_CENTER") {
    return candidate.resolvedDong != null;
  }
  if (candidate.coordinateType === "BUILDING_CANDIDATE") {
    return !candidate.evidence.includes("NOT_BUILDING_IDENTITY_AUTHORITY");
  }
  return false;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("provider_timeout")), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}
