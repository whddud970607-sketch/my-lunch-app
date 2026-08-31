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

const PRIMARY_CONFIDENCE_STOP = 0.78;
const PROVIDER_TIMEOUT_MS = 8000;

export type ProviderOrchestrationPolicy = {
  primaryProviderId: "kakao" | "naver";
  secondaryProviderId: "kakao" | "naver" | null;
  invokePublicBuildingWhenDongRequired: boolean;
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
    this.publicBuilding = new PublicBuildingDataAdapter();
    this.geocodeProviders = [this.kakao, this.naver];
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

  async resolve(input: AddressResolutionInput): Promise<AddressResolutionResult> {
    const parsed = parseAddress(input);
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
      return this.unresolvedResult(parsed, requiresDong, "provider_not_configured");
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
          c.coordinateType === "BUILDING_CANDIDATE" && c.resolvedDong === parsed.dong,
      );

    if (
      dongStillMissing &&
      policy.invokePublicBuildingWhenDongRequired &&
      this.publicBuilding.isConfigured()
    ) {
      candidates.push(
        ...(await this.safeResolveBuilding(this.publicBuilding, parsed)),
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
  ): Promise<CoordinateCandidate[]> {
    try {
      return await withTimeout(
        provider.resolveBuildingCandidates(parsed),
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
