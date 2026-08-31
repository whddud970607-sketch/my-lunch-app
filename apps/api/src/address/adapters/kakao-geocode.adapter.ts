import type {
  CoordinateCandidate,
  CoordinateType,
  ParsedAddress,
} from "../address.types";
import type { GeocodeProvider } from "../ports/geocode-provider.port";

type KakaoAddressDoc = {
  x?: string;
  y?: string;
  address_name?: string;
  address_type?: string;
  road_address?: { building_name?: string };
};

type KakaoKeywordDoc = {
  x?: string;
  y?: string;
  place_name?: string;
  category_name?: string;
  id?: string;
};

export type KakaoFetchFn = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * EXTRACT from apps/api/scripts/kakao-resolve-pin.mjs — single Nest adapter.
 * Official Kakao Local API: address.json + keyword.json (apartment-dong).
 */
export class KakaoGeocodeAdapter implements GeocodeProvider {
  readonly providerId = "kakao" as const;

  constructor(
    private readonly restApiKey: string | null | undefined,
    private readonly fetchFn: KakaoFetchFn = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.restApiKey?.trim());
  }

  async resolveCandidates(parsed: ParsedAddress): Promise<CoordinateCandidate[]> {
    if (!this.isConfigured() || !parsed.roadAddress) {
      return [];
    }

    const restKey = this.restApiKey!.trim();
    const addr = await this.kakaoAddress(restKey, parsed.roadAddress);
    const building =
      parsed.buildingName ||
      parsed.complexName ||
      addr.buildingName ||
      null;
    const dong = parsed.dong;
    const now = new Date().toISOString();

    if (dong && building) {
      const places = await this.kakaoKeyword(
        restKey,
        `${building} ${dong}동`,
        {
          x: addr.longitude,
          y: addr.latitude,
          radius: 1000,
        },
      );
      const dongPlace = places.find(
        (p) =>
          String(p.category_name || "").includes("아파트 동") &&
          String(p.place_name || "").includes(`${dong}동`),
      );
      if (dongPlace?.x && dongPlace?.y) {
        return [
          this.toCandidate({
            latitude: Number(dongPlace.y),
            longitude: Number(dongPlace.x),
            coordinateType: "BUILDING_CANDIDATE",
            sourceType: "keyword_apartment_dong",
            confidence: 0.82,
            evidence: [
              "kakao_keyword_apartment_dong",
              `place=${dongPlace.place_name ?? "unknown"}`,
            ],
            resolvedDong: dong,
            providerPlaceId: dongPlace.id ?? null,
            createdAt: now,
          }),
        ];
      }
    }

    const hasBuilding = Boolean(addr.buildingName || building);
    return [
      this.toCandidate({
        latitude: addr.latitude,
        longitude: addr.longitude,
        coordinateType: hasBuilding
          ? "BUILDING_CANDIDATE"
          : "COMPLEX_REPRESENTATIVE",
        sourceType: "address",
        confidence: hasBuilding ? 0.65 : 0.45,
        evidence: [
          "kakao_address_search",
          `address_type=${addr.addressType ?? "unknown"}`,
        ],
        resolvedDong: dong,
        providerPlaceId: null,
        createdAt: now,
      }),
    ];
  }

  private toCandidate(input: {
    latitude: number;
    longitude: number;
    coordinateType: CoordinateType;
    sourceType: string;
    confidence: number;
    evidence: string[];
    resolvedDong: string | null;
    providerPlaceId: string | null;
    createdAt: string;
  }): CoordinateCandidate {
    return {
      latitude: input.latitude,
      longitude: input.longitude,
      provider: "kakao",
      sourceType: input.sourceType,
      coordinateType: input.coordinateType,
      confidence: input.confidence,
      evidence: input.evidence,
      resolvedDong: input.resolvedDong,
      providerPlaceId: input.providerPlaceId,
      createdAt: input.createdAt,
    };
  }

  private async kakaoAddress(restKey: string, query: string) {
    const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
    url.searchParams.set("query", query);
    const res = await this.fetchFn(url.toString(), {
      headers: { Authorization: `KakaoAK ${restKey}` },
    });
    const body = (await res.json().catch(() => null)) as {
      documents?: KakaoAddressDoc[];
      message?: string;
      errorType?: string;
    } | null;
    const doc = body?.documents?.[0];
    if (res.status !== 200 || !doc?.x || !doc?.y) {
      throw new Error(
        body?.message ||
          `kakao address geocode failed http=${res.status} type=${body?.errorType}`,
      );
    }
    return {
      longitude: Number(doc.x),
      latitude: Number(doc.y),
      addressName: doc.address_name ?? null,
      buildingName: doc.road_address?.building_name ?? null,
      addressType: doc.address_type ?? null,
    };
  }

  private async kakaoKeyword(
    restKey: string,
    query: string,
    opts: { x: number; y: number; radius: number },
  ): Promise<KakaoKeywordDoc[]> {
    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    url.searchParams.set("query", query);
    url.searchParams.set("size", "15");
    url.searchParams.set("x", String(opts.x));
    url.searchParams.set("y", String(opts.y));
    url.searchParams.set("radius", String(opts.radius));
    const res = await this.fetchFn(url.toString(), {
      headers: { Authorization: `KakaoAK ${restKey}` },
    });
    const body = (await res.json().catch(() => null)) as {
      documents?: KakaoKeywordDoc[];
      message?: string;
    } | null;
    if (res.status !== 200) {
      throw new Error(body?.message || `kakao keyword search failed http=${res.status}`);
    }
    return body?.documents ?? [];
  }
}
