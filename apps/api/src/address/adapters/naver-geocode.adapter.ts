import type { CoordinateCandidate, ParsedAddress } from "../address.types";
import type { GeocodeProvider } from "../ports/geocode-provider.port";

export type NaverFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

type NaverGeocodeDoc = {
  x?: string;
  y?: string;
  roadAddress?: string;
  jibunAddress?: string;
};

/**
 * Naver Cloud Platform Map Geocoding v2 — official REST API.
 * Returns empty when client id/secret are not configured (no guessing).
 * https://api.ncloud-docs.com/docs/application-maps-geocoding
 */
export class NaverGeocodeAdapter implements GeocodeProvider {
  readonly providerId = "naver" as const;

  constructor(
    private readonly clientId: string | null | undefined,
    private readonly clientSecret: string | null | undefined,
    private readonly fetchFn: NaverFetchFn = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.clientId?.trim() && this.clientSecret?.trim());
  }

  async resolveCandidates(parsed: ParsedAddress): Promise<CoordinateCandidate[]> {
    if (!this.isConfigured() || !parsed.roadAddress) {
      return [];
    }

    const url = new URL(
      "https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode",
    );
    url.searchParams.set("query", parsed.roadAddress);

    const res = await this.fetchFn(url.toString(), {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": this.clientId!.trim(),
        "X-NCP-APIGW-API-KEY": this.clientSecret!.trim(),
      },
    });

    const body = (await res.json().catch(() => null)) as {
      addresses?: NaverGeocodeDoc[];
      errorMessage?: string;
    } | null;

    if (res.status !== 200) {
      throw new Error(
        body?.errorMessage || `naver geocode failed http=${res.status}`,
      );
    }

    const doc = body?.addresses?.[0];
    if (!doc?.x || !doc?.y) {
      return [];
    }

    const now = new Date().toISOString();
    const hasBuildingHint = Boolean(parsed.buildingName || parsed.complexName);

    return [
      {
        latitude: Number(doc.y),
        longitude: Number(doc.x),
        provider: "naver",
        sourceType: "geocode_v2",
        coordinateType: hasBuildingHint
          ? "BUILDING_CANDIDATE"
          : "COMPLEX_REPRESENTATIVE",
        confidence: hasBuildingHint ? 0.6 : 0.4,
        evidence: ["naver_map_geocode_v2"],
        resolvedDong: parsed.dong,
        providerPlaceId: null,
        createdAt: now,
      },
    ];
  }
}
