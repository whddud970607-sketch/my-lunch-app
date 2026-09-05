import {
  hasExactDongToken,
  normalizeCanonicalDong,
  apartmentIdentityMatches,
  compactIdentity,
} from "./apartment-dong-match";
import { isKoreaWgs84 } from "./naver-local-coord";

/** Shared multi-provider dong coordinate candidate (MAP_PROVIDER ≠ this source). */
export type DongCoordinateProvider = "kakao" | "naver" | "tmap" | "official" | "user";

export type DongCoordinateSourceType =
  | "user_adjusted"
  | "user_confirmed"
  | "kakao_exact_dong"
  | "kakao_base_address"
  | "naver_local_exact_dong"
  | "naver_base_geocode"
  | "tmap_exact_dong"
  | "tmap_base_address"
  | "official_exact_building_dong"
  | "official_base_address"
  | "pending_manual_confirmation";

export type DongMatchType = "exact_dong" | "base_address" | "building" | "rejected";

export type DongCoordinateCandidate = {
  provider: DongCoordinateProvider;
  sourceType: DongCoordinateSourceType;
  latitude: number;
  longitude: number;
  matchedComplex: boolean;
  matchedDong: string | null;
  requestedDong: string;
  matchType: DongMatchType;
  confidence: number;
  evidence: string[];
  /** Optional pedestrian entrance — never auto-promote to delivery pin. */
  pedestrianLatitude?: number | null;
  pedestrianLongitude?: number | null;
  verification?: "verified" | "not_verified" | "rejected" | "n/a";
};

export type ManualDongResolveInput = {
  buildingName: string | null;
  dong: string | null;
  roadAddress?: string | null;
  baseLatitude?: number | null;
  baseLongitude?: number | null;
  userAdjusted?: { latitude: number; longitude: number } | null;
  userConfirmed?: { latitude: number; longitude: number } | null;
};

export type ManualDongResolveResult = {
  selected: DongCoordinateCandidate | null;
  exactDongFound: boolean;
  requiresPinConfirmation: boolean;
  candidates: DongCoordinateCandidate[];
  requestedDong: string | null;
};

const FACILITY_REJECT =
  /전기차|충전소|관리사무소|상가|주차장|커뮤니티센터|경비실/u;

export function stripSearchHtml(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/gu, "")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .trim();
}

export function isFacilityPlaceName(name: string | null | undefined): boolean {
  if (!name) return false;
  return FACILITY_REJECT.test(compactIdentity(name));
}

/** Prefer apartment-dong POI; reject chargers/offices even if title contains N동. */
export function isApartmentDongPlace(args: {
  placeName?: string | null;
  categoryName?: string | null;
}): boolean {
  const cat = args.categoryName ?? "";
  if (cat.includes("아파트 동")) return true;
  const name = stripSearchHtml(args.placeName);
  if (!name || isFacilityPlaceName(name)) return false;
  const compact = compactIdentity(name);
  return /\d+동$/u.test(compact);
}

export function exactComplexAndDong(args: {
  buildingName: string;
  requestedDong: string;
  title?: string | null;
  address?: string | null;
  roadAddress?: string | null;
  categoryName?: string | null;
}): { matchedComplex: boolean; matchedDong: string | null; accepted: boolean } {
  const canonical = normalizeCanonicalDong(args.requestedDong);
  if (!canonical) {
    return { matchedComplex: false, matchedDong: null, accepted: false };
  }
  const title = stripSearchHtml(args.title);
  const matchedComplex = apartmentIdentityMatches({
    buildingName: args.buildingName,
    placeName: title,
    addressName: args.address,
    roadAddressName: args.roadAddress,
  });
  const dongHit =
    hasExactDongToken(title, canonical) ||
    hasExactDongToken(args.address, canonical) ||
    hasExactDongToken(args.roadAddress, canonical);
  const matchedDong = dongHit ? canonical : null;
  if (isFacilityPlaceName(title)) {
    return { matchedComplex, matchedDong, accepted: false };
  }
  const accepted = matchedComplex && matchedDong === canonical;
  return { matchedComplex, matchedDong, accepted };
}

export function asExactDongCandidate(args: {
  provider: DongCoordinateProvider;
  sourceType: DongCoordinateSourceType;
  latitude: number;
  longitude: number;
  requestedDong: string;
  matchedDong: string;
  confidence: number;
  evidence: string[];
  verification?: DongCoordinateCandidate["verification"];
  pedestrianLatitude?: number | null;
  pedestrianLongitude?: number | null;
}): DongCoordinateCandidate | null {
  if (!isKoreaWgs84(args.latitude, args.longitude)) return null;
  if (args.matchedDong !== args.requestedDong) return null;
  return {
    provider: args.provider,
    sourceType: args.sourceType,
    latitude: args.latitude,
    longitude: args.longitude,
    matchedComplex: true,
    matchedDong: args.matchedDong,
    requestedDong: args.requestedDong,
    matchType: "exact_dong",
    confidence: args.confidence,
    evidence: args.evidence,
    verification: args.verification ?? "n/a",
    pedestrianLatitude: args.pedestrianLatitude ?? null,
    pedestrianLongitude: args.pedestrianLongitude ?? null,
  };
}

export function asBaseAddressCandidate(args: {
  provider: DongCoordinateProvider;
  sourceType: DongCoordinateSourceType;
  latitude: number;
  longitude: number;
  requestedDong: string;
  evidence: string[];
}): DongCoordinateCandidate | null {
  if (!isKoreaWgs84(args.latitude, args.longitude)) return null;
  return {
    provider: args.provider,
    sourceType: args.sourceType,
    latitude: args.latitude,
    longitude: args.longitude,
    matchedComplex: false,
    matchedDong: null,
    requestedDong: args.requestedDong,
    matchType: "base_address",
    confidence: 0.35,
    evidence: [...args.evidence, "NOT_EXACT_DONG"],
    verification: "n/a",
  };
}

/**
 * Rank for *long-term persistable* exact finals only.
 * TMAP Open API free/retention terms: not auto-persisted as provider final
 * (corroboration / preview only — see isTmapRetentionRestrictedExact).
 */
const EXACT_SOURCE_RANK: DongCoordinateSourceType[] = [
  "user_adjusted",
  "user_confirmed",
  "official_exact_building_dong",
  "kakao_exact_dong",
  "naver_local_exact_dong",
];

/** TMAP reverse-verified exact — usable for corroboration, not long-term auto-final. */
export function isTmapRetentionRestrictedExact(
  candidate: DongCoordinateCandidate | null | undefined,
): boolean {
  if (!candidate) return false;
  return (
    candidate.provider === "tmap" ||
    candidate.sourceType === "tmap_exact_dong"
  );
}

/**
 * True when a verified exact candidate may be auto-persisted as provider final.
 * TMAP-only verified exact → false (Open API ≤24h retention).
 */
export function isLongTermPersistableExactCandidate(
  candidate: DongCoordinateCandidate | null | undefined,
): boolean {
  if (!candidate) return false;
  if (!isExactDongCandidateVerified(candidate, candidate.requestedDong)) {
    return false;
  }
  if (isTmapRetentionRestrictedExact(candidate)) return false;
  return true;
}

/** Prefer Kakao/Naver/official/user — never auto-select TMAP as persisted final. */
export function pickPreferredDongCandidate(
  candidates: DongCoordinateCandidate[],
): DongCoordinateCandidate | null {
  for (const sourceType of EXACT_SOURCE_RANK) {
    const hit = candidates.find(
      (c) =>
        c.sourceType === sourceType &&
        c.matchType === "exact_dong" &&
        c.matchedDong === c.requestedDong &&
        c.matchedComplex === true &&
        c.verification !== "rejected",
    );
    if (hit && isLongTermPersistableExactCandidate(hit)) {
      return hit;
    }
  }
  return null;
}

/** First reverse-verified TMAP exact (preview / corroboration only). */
export function pickTmapVerifiedExactPreview(
  candidates: DongCoordinateCandidate[],
): DongCoordinateCandidate | null {
  return (
    candidates.find(
      (c) =>
        isTmapRetentionRestrictedExact(c) &&
        isExactDongCandidateVerified(c, c.requestedDong),
    ) ?? null
  );
}

/**
 * Provider name alone is never enough — complex + dong + coords required.
 * TMAP exact requires reverse verification (verification === "verified").
 * Base / not_verified never qualify.
 */
export function isExactDongCandidateVerified(
  candidate: DongCoordinateCandidate | null | undefined,
  requestedDong: string,
): boolean {
  if (!candidate) return false;
  if (candidate.matchType !== "exact_dong") return false;
  if (candidate.matchedComplex !== true) return false;
  if (candidate.matchedDong !== requestedDong) return false;
  if (candidate.requestedDong !== requestedDong) return false;
  if (candidate.verification === "rejected") return false;
  if (candidate.verification === "not_verified") return false;
  if (
    (candidate.provider === "tmap" ||
      candidate.sourceType === "tmap_exact_dong") &&
    candidate.verification !== "verified"
  ) {
    return false;
  }
  if (!isKoreaWgs84(candidate.latitude, candidate.longitude)) return false;
  return true;
}

/** Verified exact-dong pool only (no base, no unverified TMAP). */
export function collectVerifiedExactDongPool(
  candidates: DongCoordinateCandidate[],
): DongCoordinateCandidate[] {
  return candidates.filter(
    (c) =>
      c.matchType === "exact_dong" &&
      isExactDongCandidateVerified(c, c.requestedDong),
  );
}
