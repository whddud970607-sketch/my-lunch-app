import type { ConfigService } from "@nestjs/config";
import type { CoordinateCandidate, ParsedAddress } from "../address.types";
import type { BuildingDataProvider, BuildingResolveOptions } from "../ports/building-data-provider.port";
import {
  createBuildingHubFetchPage,
  getBuildingHubServiceKey,
  isBuildingHubConfigured,
} from "./building-hub.adapter";
import {
  createLiveKakaoParcelResolver,
  isKakaoParcelConfigured,
} from "./kakao-parcel.adapter";
import {
  createVworldFetchFeature,
  isVworldConfigured,
} from "./vworld.adapter";
import {
  runBuildingResolutionChain,
  targetFromParsedAddress,
  type BuildingResolutionDeps,
} from "../building/building-resolution.stage";

export type PublicBuildingAdapterOptions = {
  config?: ConfigService;
  /** Test-only injected deps — NETWORK=0 */
  mockDeps?: BuildingResolutionDeps;
};

/**
 * Delegates to the promoted Track A building-resolution chain.
 * Does not duplicate business logic or invent coordinates.
 */
export class PublicBuildingDataAdapter implements BuildingDataProvider {
  readonly providerId = "public_building" as const;
  private readonly deps: BuildingResolutionDeps | null;

  constructor(options: PublicBuildingAdapterOptions = {}) {
    this.deps = options.mockDeps ?? this.buildProductionDeps(options.config);
  }

  isConfigured(): boolean {
    return this.deps != null;
  }

  async resolveBuildingCandidates(
    parsed: ParsedAddress,
    options?: BuildingResolveOptions,
  ): Promise<CoordinateCandidate[]> {
    if (!this.deps) return [];

    const target = targetFromParsedAddress(parsed);
    if (!target?.dong) return [];

    const deps: BuildingResolutionDeps = options?.diagnosticTrace
      ? { ...this.deps, diagnosticTrace: options.diagnosticTrace }
      : this.deps;

    const result = await runBuildingResolutionChain(target, deps);
    if (!result.ok) return [];

    const now = new Date().toISOString();
    return [
      {
        latitude: result.latitude,
        longitude: result.longitude,
        provider: "public_building",
        sourceType: "track_a_building_chain",
        coordinateType: "BUILDING_CENTER",
        confidence: 0.95,
        evidence: [
          "building_hub_identity_verified",
          "vworld_exact_pnu_dong_geometry",
          `complex_corroboration=${result.provenance.complexCorroboration ?? "null"}`,
          `pnu=${result.pnu}`,
          `pin_provenance=${result.provenance.pinProvenance}`,
        ],
        resolvedDong: parsed.dong,
        resolvedBuildingId: null,
        providerPlaceId: result.provenance.vworldProviderBuildingId,
        createdAt: now,
      },
    ];
  }

  private buildProductionDeps(
    config?: ConfigService,
  ): BuildingResolutionDeps | null {
    if (!config) return null;
    if (
      !isKakaoParcelConfigured(config) ||
      !isBuildingHubConfigured(config) ||
      !isVworldConfigured(config)
    ) {
      return null;
    }

    const hubKey = getBuildingHubServiceKey(config);
    if (!hubKey) return null;

    const kakaoKey = config.get<string>("KAKAO_REST_API_KEY")!;
    const vworldKey = config.get<string>("VWORLD_API_KEY")!;

    return {
      parcelResolver: createLiveKakaoParcelResolver(kakaoKey),
      fetchBuildingHubPage: createBuildingHubFetchPage(hubKey),
      fetchVworldGetFeature: createVworldFetchFeature(vworldKey),
    };
  }
}
