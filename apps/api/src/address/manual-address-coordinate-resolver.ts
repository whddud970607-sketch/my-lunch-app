import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KakaoGeocodeAdapter } from "./adapters/kakao-geocode.adapter";
import { NaverGeocodeAdapter } from "./adapters/naver-geocode.adapter";
import { NaverLocalSearchAdapter } from "./adapters/naver-local-search.adapter";
import { TmapDongAdapter } from "./adapters/tmap-dong.adapter";
import { normalizeCanonicalDong } from "./apartment-dong-match";
import {
  asBaseAddressCandidate,
  asExactDongCandidate,
  collectVerifiedExactDongPool,
  pickPreferredDongCandidate,
  pickTmapVerifiedExactPreview,
  type DongCoordinateCandidate,
  type ManualDongResolveInput,
  type ManualDongResolveResult,
} from "./dong-coordinate-candidate";
import { isKoreaWgs84 } from "./naver-local-coord";

/**
 * Coordinate resolver for manual address registration.
 * Independent of which map provider (Kakao/Naver/TMAP) renders the UI.
 */
@Injectable()
export class ManualAddressCoordinateResolver {
  private readonly kakao: KakaoGeocodeAdapter;
  private readonly naverGeocode: NaverGeocodeAdapter;
  private readonly naverLocal: NaverLocalSearchAdapter;
  private readonly tmap: TmapDongAdapter;

  constructor(config: ConfigService) {
    this.kakao = new KakaoGeocodeAdapter(
      config.get<string>("KAKAO_REST_API_KEY"),
    );
    this.naverGeocode = new NaverGeocodeAdapter(
      config.get<string>("NAVER_MAP_CLIENT_ID"),
      config.get<string>("NAVER_MAP_CLIENT_SECRET"),
    );
    const searchId =
      config.get<string>("NAVER_SEARCH_CLIENT_ID") ||
      config.get<string>("NAVER_CLIENT_ID") ||
      config.get<string>("NAVER_MAP_CLIENT_ID");
    const searchSecret =
      config.get<string>("NAVER_SEARCH_CLIENT_SECRET") ||
      config.get<string>("NAVER_CLIENT_SECRET") ||
      config.get<string>("NAVER_MAP_CLIENT_SECRET");
    this.naverLocal = new NaverLocalSearchAdapter(searchId, searchSecret);
    this.tmap = new TmapDongAdapter(
      config.get<string>("TMAP_APP_KEY") || config.get<string>("TMAP_API_KEY"),
    );
  }

  /** Test / DI seam for injected adapters. */
  static fromAdapters(args: {
    kakao: KakaoGeocodeAdapter;
    naverGeocode: NaverGeocodeAdapter;
    naverLocal: NaverLocalSearchAdapter;
    tmap: TmapDongAdapter;
  }): ManualAddressCoordinateResolver {
    const resolver = Object.create(
      ManualAddressCoordinateResolver.prototype,
    ) as ManualAddressCoordinateResolver;
    (resolver as unknown as { kakao: KakaoGeocodeAdapter }).kakao = args.kakao;
    (resolver as unknown as { naverGeocode: NaverGeocodeAdapter }).naverGeocode =
      args.naverGeocode;
    (resolver as unknown as { naverLocal: NaverLocalSearchAdapter }).naverLocal =
      args.naverLocal;
    (resolver as unknown as { tmap: TmapDongAdapter }).tmap = args.tmap;
    return resolver;
  }

  async resolve(input: ManualDongResolveInput): Promise<ManualDongResolveResult> {
    const requestedDong = normalizeCanonicalDong(input.dong);
    const candidates: DongCoordinateCandidate[] = [];

    if (input.userAdjusted && isKoreaWgs84(input.userAdjusted.latitude, input.userAdjusted.longitude)) {
      candidates.push({
        provider: "user",
        sourceType: "user_adjusted",
        latitude: input.userAdjusted.latitude,
        longitude: input.userAdjusted.longitude,
        matchedComplex: true,
        matchedDong: requestedDong,
        requestedDong: requestedDong ?? "",
        matchType: "exact_dong",
        confidence: 1,
        evidence: ["user_adjusted_pin"],
        verification: "n/a",
      });
    }

    if (input.userConfirmed && isKoreaWgs84(input.userConfirmed.latitude, input.userConfirmed.longitude)) {
      candidates.push({
        provider: "user",
        sourceType: "user_confirmed",
        latitude: input.userConfirmed.latitude,
        longitude: input.userConfirmed.longitude,
        matchedComplex: true,
        matchedDong: requestedDong,
        requestedDong: requestedDong ?? "",
        matchType: "exact_dong",
        confidence: 0.99,
        evidence: ["user_confirmed_pin"],
        verification: "n/a",
      });
    }

    const building = input.buildingName?.trim() || null;
    const baseLat = input.baseLatitude;
    const baseLng = input.baseLongitude;

    if (requestedDong && building) {
      const kakaoExact = await this.safeKakaoExact({
        buildingName: building,
        dong: requestedDong,
        latitude: baseLat,
        longitude: baseLng,
      });
      if (kakaoExact) candidates.push(kakaoExact);

      try {
        const naverExact = await this.naverLocal.lookupExactDongCandidates({
          buildingName: building,
          dong: requestedDong,
          roadAddress: input.roadAddress,
        });
        candidates.push(...naverExact);
      } catch {
        /* provider miss */
      }

      try {
        const tmapExact = await this.tmap.lookupExactDongCandidates({
          buildingName: building,
          dong: requestedDong,
          roadAddress: input.roadAddress,
        });
        candidates.push(...tmapExact);
      } catch {
        /* provider miss */
      }
    }

    // Base address candidates — never promoted to exact_dong
    if (
      baseLat != null &&
      baseLng != null &&
      isKoreaWgs84(baseLat, baseLng) &&
      requestedDong
    ) {
      const base = asBaseAddressCandidate({
        provider: "kakao",
        sourceType: "kakao_base_address",
        latitude: baseLat,
        longitude: baseLng,
        requestedDong,
        evidence: ["manual_suggest_or_payload_base"],
      });
      if (base) candidates.push(base);
    }

    if (input.roadAddress?.trim() && requestedDong) {
      try {
        const tmapBase = await this.tmap.lookupBaseAddressCandidate({
          roadAddress: input.roadAddress.trim(),
          requestedDong,
        });
        if (tmapBase) candidates.push(tmapBase);
      } catch {
        /* ignore */
      }

      if (this.naverGeocode.isConfigured()) {
        try {
          const naverBase = await this.naverGeocode.resolveCandidates({
            originalAddress: input.roadAddress.trim(),
            roadAddress: input.roadAddress.trim(),
            lotAddress: null,
            complexName: building,
            buildingName: building,
            dong: requestedDong,
            ho: null,
            postalCode: null,
            normalizedAddress: input.roadAddress.trim(),
            detailAddress: null,
          });
          const first = naverBase[0];
          if (first && isKoreaWgs84(first.latitude, first.longitude)) {
            const base = asBaseAddressCandidate({
              provider: "naver",
              sourceType: "naver_base_geocode",
              latitude: first.latitude,
              longitude: first.longitude,
              requestedDong,
              evidence: ["naver_map_geocode_v2", "NOT_EXACT_DONG"],
            });
            if (base) candidates.push(base);
          }
        } catch {
          /* ignore */
        }
      }
    }

    // Persistable exact (Kakao/Naver/…) only — TMAP is corroboration/preview.
    const exactPool = collectVerifiedExactDongPool(candidates);
    const selectedExact = pickPreferredDongCandidate(exactPool);
    if (selectedExact) {
      return {
        selected: selectedExact,
        exactDongFound: true,
        requiresPinConfirmation: false,
        candidates,
        requestedDong,
      };
    }

    // TMAP-only verified: preview coords OK, auto long-term persist forbidden.
    const tmapPreview = pickTmapVerifiedExactPreview(exactPool);
    if (tmapPreview) {
      return {
        selected: tmapPreview,
        exactDongFound: false,
        requiresPinConfirmation: true,
        candidates,
        requestedDong,
      };
    }

    const baseOnly =
      candidates.find((c) => c.matchType === "base_address") ?? null;

    return {
      selected: baseOnly,
      exactDongFound: false,
      requiresPinConfirmation: Boolean(requestedDong),
      candidates,
      requestedDong,
    };
  }

  private async safeKakaoExact(args: {
    buildingName: string;
    dong: string;
    latitude?: number | null;
    longitude?: number | null;
  }): Promise<DongCoordinateCandidate | null> {
    if (
      args.latitude == null ||
      args.longitude == null ||
      !isKoreaWgs84(args.latitude, args.longitude)
    ) {
      return null;
    }
    try {
      const hit = await this.kakao.lookupApartmentDong({
        buildingName: args.buildingName,
        dong: args.dong,
        latitude: args.latitude,
        longitude: args.longitude,
      });
      if (!hit) return null;
      return asExactDongCandidate({
        provider: "kakao",
        sourceType: "kakao_exact_dong",
        latitude: hit.latitude,
        longitude: hit.longitude,
        requestedDong: args.dong,
        matchedDong: args.dong,
        confidence: 0.82,
        evidence: [
          "kakao_keyword_apartment_dong_exact",
          "facility_pois_excluded",
        ],
      });
    } catch {
      return null;
    }
  }
}
