import type {
  CoordinateCandidate,
  CoordinateType,
  ParsedAddress,
} from "../address.types";
import type { GeocodeProvider } from "../ports/geocode-provider.port";
import {
  normalizeCanonicalDong,
  selectExactApartmentDongHit,
  type KakaoKeywordPlace,
} from "../apartment-dong-match";

type KakaoAddressDoc = {
  x?: string;
  y?: string;
  address_name?: string;
  address_type?: string;
  road_address?: { address_name?: string; building_name?: string };
  address?: { address_name?: string };
};

/** Public interactive-search hit. No customer PII. */
export type KakaoAddressSearchDocument = {
  roadAddress: string | null;
  jibunAddress: string | null;
  buildingName: string | null;
  latitude: number | null;
  longitude: number | null;
};

type KakaoKeywordDoc = KakaoKeywordPlace;

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

  /**
   * Interactive address.json typeahead (all documents).
   * Does not change [resolveCandidates] first-document geocode behavior.
   */
  async searchAddressDocuments(
    query: string,
    opts?: { size?: number },
  ): Promise<KakaoAddressSearchDocument[]> {
    if (!this.isConfigured()) {
      return [];
    }
    const restKey = this.restApiKey!.trim();
    const size = Math.min(Math.max(opts?.size ?? 15, 1), 30);
    const body = await this.fetchAddressDocuments(restKey, query, size);
    if (body.httpStatus !== 200) {
      throw new Error(
        body.message ||
          `kakao address search failed http=${body.httpStatus} type=${body.errorType}`,
      );
    }
    return (body.documents ?? [])
      .map((doc) => this.mapSearchDocument(doc))
      .filter((hit) => hit.roadAddress || hit.jibunAddress);
  }

  /**
   * Keyword lookup for an apartment dong near a base address pin.
   * Returns coords only. Does not log the query or place name.
   */
  async lookupApartmentDong(args: {
    buildingName: string;
    dong: string;
    latitude: number;
    longitude: number;
  }): Promise<{ latitude: number; longitude: number } | null> {
    if (!this.isConfigured()) return null;
    const building = args.buildingName.trim();
    const canonicalDong = normalizeCanonicalDong(args.dong);
    if (!building || !canonicalDong) return null;
    if (!Number.isFinite(args.latitude) || !Number.isFinite(args.longitude)) {
      return null;
    }
    try {
      const places = await this.kakaoKeyword(
        this.restApiKey!.trim(),
        `${building} ${canonicalDong}`,
        { x: args.longitude, y: args.latitude, radius: 1000 },
      );
      return selectExactApartmentDongHit({
        buildingName: building,
        dong: canonicalDong,
        documents: places,
      });
    } catch {
      return null;
    }
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

    const canonicalDong = normalizeCanonicalDong(dong);
    if (canonicalDong && building) {
      const places = await this.kakaoKeyword(
        restKey,
        `${building} ${canonicalDong}`,
        {
          x: addr.longitude,
          y: addr.latitude,
          radius: 1000,
        },
      );
      const exact = selectExactApartmentDongHit({
        buildingName: building,
        dong: canonicalDong,
        documents: places,
      });
      if (exact) {
        return [
          this.toCandidate({
            latitude: exact.latitude,
            longitude: exact.longitude,
            coordinateType: "BUILDING_CANDIDATE",
            sourceType: "keyword_apartment_dong_exact",
            confidence: 0.82,
            evidence: [
              "kakao_keyword_apartment_dong_exact",
              "LOW_QUALITY_CANDIDATE_EVIDENCE",
              "NOT_BUILDING_IDENTITY_AUTHORITY",
            ],
            resolvedDong: canonicalDong,
            providerPlaceId: null,
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

  private mapSearchDocument(doc: KakaoAddressDoc): KakaoAddressSearchDocument {
    const lat = doc.y != null && doc.y !== "" ? Number(doc.y) : NaN;
    const lng = doc.x != null && doc.x !== "" ? Number(doc.x) : NaN;
    const road = emptyToNull(doc.road_address?.address_name);
    const jibun = emptyToNull(doc.address?.address_name);
    return {
      roadAddress: road,
      jibunAddress: jibun,
      buildingName: emptyToNull(doc.road_address?.building_name),
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
    };
  }

  private async fetchAddressDocuments(
    restKey: string,
    query: string,
    size: number,
  ): Promise<{
    documents?: KakaoAddressDoc[];
    message?: string;
    errorType?: string;
    httpStatus: number;
  }> {
    const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
    url.searchParams.set("query", query);
    url.searchParams.set("size", String(size));
    const res = await this.fetchFn(url.toString(), {
      headers: { Authorization: `KakaoAK ${restKey}` },
    });
    const body = (await res.json().catch(() => null)) as {
      documents?: KakaoAddressDoc[];
      message?: string;
      errorType?: string;
    } | null;
    return {
      documents: body?.documents,
      message: body?.message,
      errorType: body?.errorType,
      httpStatus: res.status,
    };
  }

  private async kakaoAddress(restKey: string, query: string) {
    const body = await this.fetchAddressDocuments(restKey, query, 1);
    const doc = body.documents?.[0];
    if (body.httpStatus !== 200 || !doc?.x || !doc?.y) {
      throw new Error(
        body.message ||
          `kakao address geocode failed http=${body.httpStatus} type=${body.errorType}`,
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

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}
