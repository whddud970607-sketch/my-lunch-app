import {
  asBaseAddressCandidate,
  asExactDongCandidate,
  exactComplexAndDong,
  stripSearchHtml,
  type DongCoordinateCandidate,
} from "../dong-coordinate-candidate";
import {
  apartmentIdentityMatches,
  hasExactDongToken,
  normalizeCanonicalDong,
} from "../apartment-dong-match";
import { isKoreaWgs84 } from "../naver-local-coord";
import {
  firstValidGeocodeCoordinate,
  parseTmapCoordinateNumber,
  TMAP_POI_COORD_PRIORITY,
  type TmapPoiCoordKind,
} from "../tmap-coord";

export type TmapFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

type TmapPoi = {
  name?: string;
  poiNm?: string;
  frontLat?: string | number;
  frontLon?: string | number;
  noorLat?: string | number;
  noorLon?: string | number;
  pnsLat?: string | number;
  pnsLon?: string | number;
  upperAddrName?: string;
  middleAddrName?: string;
  lowerAddrName?: string;
  roadName?: string;
  firstNo?: string;
  secondNo?: string;
};

type TmapAddressInfo = {
  buildingName?: string;
  buildingDong?: string;
  fullAddress?: string;
};

export const TMAP_REVERSE_VERIFIED_EVIDENCE =
  "tmap_apartment_dong_reverse_verified" as const;

/**
 * TMAP Open API roles:
 * - Geocoding → BASE_COORDINATE_ONLY (never exact dong)
 * - POI Search → apartment dong *candidates* (name alone ≠ exact)
 * - Reverse Geocoding buildingDetailYn=Y → required for exact
 * - Coord try order: noor → pns → front (see TMAP_POI_COORD_PRIORITY)
 */
export class TmapDongAdapter {
  readonly providerId = "tmap" as const;

  constructor(
    private readonly appKey: string | null | undefined,
    private readonly fetchFn: TmapFetchFn = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.appKey?.trim());
  }

  async lookupExactDongCandidates(args: {
    buildingName: string;
    dong: string;
    roadAddress?: string | null;
  }): Promise<DongCoordinateCandidate[]> {
    if (!this.isConfigured()) return [];
    const building = args.buildingName.trim();
    const requestedDong = normalizeCanonicalDong(args.dong);
    if (!building || !requestedDong) return [];

    const pois = await this.searchPoi(`${building} ${requestedDong}`);
    const out: DongCoordinateCandidate[] = [];

    for (const poi of pois) {
      const name = stripSearchHtml(poi.name || poi.poiNm || "");
      const verdict = exactComplexAndDong({
        buildingName: building,
        requestedDong,
        title: name,
      });
      // Name/complex gate only — coordinates still require reverse verify.
      if (!verdict.accepted || !verdict.matchedDong) continue;

      const verified = await this.verifyPoiCoordinateCandidates({
        poi,
        buildingName: building,
        requestedDong,
        matchedDong: verdict.matchedDong,
      });
      if (verified) out.push(verified);
    }
    return out;
  }

  async lookupBaseAddressCandidate(args: {
    roadAddress: string;
    requestedDong: string;
  }): Promise<DongCoordinateCandidate | null> {
    if (!this.isConfigured() || !args.roadAddress.trim()) return null;
    const requestedDong =
      normalizeCanonicalDong(args.requestedDong) ?? args.requestedDong;
    const coords = await this.geocodeFullAddr(args.roadAddress.trim());
    if (!coords) return null;
    const evidence = ["tmap_full_addr_geocode", "BASE_COORDINATE_ONLY", "NOT_EXACT_DONG"];
    if (coords.buildingDong) {
      evidence.push(`tmap_geocode_buildingDong=${coords.buildingDong}`);
      evidence.push("BASE_NOT_PROMOTED_TO_EXACT");
    }
    return asBaseAddressCandidate({
      provider: "tmap",
      sourceType: "tmap_base_address",
      latitude: coords.latitude,
      longitude: coords.longitude,
      requestedDong,
      evidence,
    });
  }

  /**
   * Try POI coords in policy order; first reverse-verified exact dong wins.
   */
  private async verifyPoiCoordinateCandidates(args: {
    poi: TmapPoi;
    buildingName: string;
    requestedDong: string;
    matchedDong: string;
  }): Promise<DongCoordinateCandidate | null> {
    const { poi, buildingName, requestedDong, matchedDong } = args;
    const coordSlots: Array<{ kind: TmapPoiCoordKind; lat: unknown; lng: unknown }> =
      [
        { kind: "noor", lat: poi.noorLat, lng: poi.noorLon },
        { kind: "pns", lat: poi.pnsLat, lng: poi.pnsLon },
        { kind: "front", lat: poi.frontLat, lng: poi.frontLon },
      ];

    // Honor exported priority constant order
    const ordered = TMAP_POI_COORD_PRIORITY.map(
      (kind) => coordSlots.find((s) => s.kind === kind)!,
    );

    const pnsLat = parseTmapCoordinateNumber(poi.pnsLat);
    const pnsLon = parseTmapCoordinateNumber(poi.pnsLon);

    for (const slot of ordered) {
      const lat = parseTmapCoordinateNumber(slot.lat);
      const lng = parseTmapCoordinateNumber(slot.lng);
      if (lat == null || lng == null) continue;
      if (lat === 0 && lng === 0) continue;
      if (!isKoreaWgs84(lat, lng)) continue;

      const reverse = await this.reverseBuildingDetail(lat, lng);
      const verdict = this.judgeReverseExactDong({
        buildingName,
        requestedDong,
        reverse,
      });

      if (verdict === "rejected" || verdict === "not_verified") {
        continue;
      }

      const candidate = asExactDongCandidate({
        provider: "tmap",
        sourceType: "tmap_exact_dong",
        latitude: lat,
        longitude: lng,
        requestedDong,
        matchedDong,
        confidence: 0.88,
        evidence: [
          "tmap_poi_search",
          "exact_dong_and_complex",
          `tmap_poi_coord_kind=${slot.kind}`,
          "tmap_reverse_buildingDetailYn_verified",
          TMAP_REVERSE_VERIFIED_EVIDENCE,
          "NOT_GUARANTEED_ALL_DONGS",
        ],
        verification: "verified",
        pedestrianLatitude:
          pnsLat != null &&
          pnsLon != null &&
          isKoreaWgs84(pnsLat, pnsLon) &&
          slot.kind !== "pns"
            ? pnsLat
            : null,
        pedestrianLongitude:
          pnsLat != null &&
          pnsLon != null &&
          isKoreaWgs84(pnsLat, pnsLon) &&
          slot.kind !== "pns"
            ? pnsLon
            : null,
      });
      if (candidate) return candidate;
    }
    return null;
  }

  /** sameComplex + exactDong from reverse only. */
  judgeReverseExactDong(args: {
    buildingName: string;
    requestedDong: string;
    reverse: {
      buildingName: string | null;
      buildingDong: string | null;
      fullAddress: string | null;
    };
  }): "verified" | "rejected" | "not_verified" {
    const { buildingName, requestedDong, reverse } = args;
    const name = reverse.buildingName?.trim() || "";
    const dongField = reverse.buildingDong?.trim() || "";
    const full = reverse.fullAddress?.trim() || "";

    if (!name && !dongField) return "not_verified";

    // Explicit reject patterns in reverse text
    const hay = `${name} ${dongField} ${full}`;
    const compact = hay.replace(/\s+/gu, "");
    const reqNum = requestedDong.replace(/동$/u, "");
    if (new RegExp(`${reqNum}호`, "u").test(compact)) return "rejected";
    if (new RegExp(`${reqNum}번길`, "u").test(compact)) return "rejected";

    const reverseDong = this.extractReverseDong(reverse);
    if (!reverseDong) return "not_verified";
    if (reverseDong !== requestedDong) return "rejected";

    const sameComplex = apartmentIdentityMatches({
      buildingName,
      placeName: name || null,
      addressName: full || null,
      roadAddressName: null,
    });
    if (!sameComplex) return "rejected";

    // Require exact token in at least one reverse field
    const exactToken =
      hasExactDongToken(name, requestedDong) ||
      hasExactDongToken(dongField, requestedDong) ||
      hasExactDongToken(full, requestedDong);
    if (!exactToken) return "rejected";

    return "verified";
  }

  extractReverseDong(reverse: {
    buildingName: string | null;
    buildingDong: string | null;
    fullAddress?: string | null;
  }): string | null {
    if (reverse.buildingDong) {
      const fromField = normalizeCanonicalDong(reverse.buildingDong);
      if (fromField) return fromField;
    }
    const text = reverse.buildingName || reverse.fullAddress || "";
    if (!text) return null;
    const compact = text.replace(/\s+/gu, "");
    const matches = [
      ...compact.matchAll(/(?<![0-9])(\d+)동(?![0-9가-힣])/gu),
    ];
    if (matches.length !== 1) return null;
    return normalizeCanonicalDong(`${matches[0][1]}동`);
  }

  private async searchPoi(keyword: string): Promise<TmapPoi[]> {
    const url = new URL("https://apis.openapi.sk.com/tmap/pois");
    url.searchParams.set("version", "1");
    url.searchParams.set("searchKeyword", keyword);
    url.searchParams.set("count", "10");
    url.searchParams.set("searchType", "all");
    url.searchParams.set("resCoordType", "WGS84GEO");
    url.searchParams.set("reqCoordType", "WGS84GEO");
    const res = await this.fetchFn(url.toString(), {
      headers: {
        Accept: "application/json",
        appKey: this.appKey!.trim(),
      },
    });
    if (res.status !== 200) return [];
    const body = (await res.json().catch(() => null)) as {
      searchPoiInfo?: { pois?: { poi?: TmapPoi | TmapPoi[] } };
    } | null;
    const raw = body?.searchPoiInfo?.pois?.poi;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  private async reverseBuildingDetail(
    lat: number,
    lon: number,
  ): Promise<{
    buildingName: string | null;
    buildingDong: string | null;
    fullAddress: string | null;
  }> {
    const url = new URL(
      "https://apis.openapi.sk.com/tmap/geo/reversegeocoding",
    );
    url.searchParams.set("version", "1");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("coordType", "WGS84GEO");
    url.searchParams.set("addressType", "A04");
    url.searchParams.set("buildingDetailYn", "Y");
    const res = await this.fetchFn(url.toString(), {
      headers: {
        Accept: "application/json",
        appKey: this.appKey!.trim(),
      },
    });
    if (res.status !== 200) {
      return { buildingName: null, buildingDong: null, fullAddress: null };
    }
    const body = (await res.json().catch(() => null)) as {
      addressInfo?: TmapAddressInfo;
    } | null;
    const info = body?.addressInfo;
    return {
      buildingName: info?.buildingName?.trim() || null,
      buildingDong: info?.buildingDong?.trim() || null,
      fullAddress: info?.fullAddress?.trim() || null,
    };
  }

  private async geocodeFullAddr(fullAddr: string): Promise<{
    latitude: number;
    longitude: number;
    buildingDong: string | null;
  } | null> {
    const url = new URL("https://apis.openapi.sk.com/tmap/geo/fullAddrGeo");
    url.searchParams.set("version", "1");
    url.searchParams.set("format", "json");
    url.searchParams.set("coordType", "WGS84GEO");
    url.searchParams.set("fullAddr", fullAddr);
    const res = await this.fetchFn(url.toString(), {
      headers: {
        Accept: "application/json",
        appKey: this.appKey!.trim(),
      },
    });
    if (res.status !== 200) return null;
    const body = (await res.json().catch(() => null)) as {
      coordinateInfo?: {
        coordinate?: Array<{
          lat?: string;
          lon?: string;
          newLat?: string;
          newLon?: string;
          frontLat?: string;
          frontLon?: string;
          entranceLat?: string;
          entranceLon?: string;
          buildingName?: string;
          buildingDong?: string;
        }>;
      };
    } | null;
    const c = body?.coordinateInfo?.coordinate?.[0];
    if (!c) return null;
    const picked = firstValidGeocodeCoordinate(c);
    if (!picked) return null;
    return {
      latitude: picked.latitude,
      longitude: picked.longitude,
      buildingDong: c.buildingDong?.trim() || null,
    };
  }
}
