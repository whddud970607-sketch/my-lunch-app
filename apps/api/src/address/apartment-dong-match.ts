export type KakaoKeywordPlace = {
  x?: string;
  y?: string;
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  category_name?: string;
  id?: string;
};

export type PlaceSemanticType =
  | "APARTMENT_DONG"
  | "FACILITY"
  | "CHARGING_STATION"
  | "MANAGEMENT_OFFICE"
  | "STORE"
  | "OTHER";

/** Classify POI semantics before exact-dong auto-select. */
export function classifyPlaceSemantic(
  doc: Pick<KakaoKeywordPlace, "place_name" | "category_name">,
): PlaceSemanticType {
  const cat = doc.category_name ?? "";
  const name = (doc.place_name ?? "").replace(/\s+/gu, "");
  if (/전기차|충전소/u.test(name) || cat.includes("충전소")) {
    return "CHARGING_STATION";
  }
  if (/관리사무소/u.test(name) || cat.includes("관리사무소")) {
    return "MANAGEMENT_OFFICE";
  }
  if (/상가|편의점|마트|상점/u.test(name) || cat.includes("쇼핑")) {
    return "STORE";
  }
  if (/주차장|커뮤니티|경비실|시설/u.test(name)) {
    return "FACILITY";
  }
  if (cat.includes("아파트 동")) return "APARTMENT_DONG";
  if (/\d+동$/u.test(name) && !/전기차|충전소|관리사무소|상가/u.test(name)) {
    return "APARTMENT_DONG";
  }
  return "OTHER";
}

/** Exact dong auto-select target: APARTMENT_DONG only. */
export function isKakaoApartmentDongPlace(doc: KakaoKeywordPlace): boolean {
  return classifyPlaceSemantic(doc) === "APARTMENT_DONG";
}

/** "504", "504동", " 504 동 " → "504동" */
export function normalizeCanonicalDong(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const compact = raw.replace(/\s+/gu, "").trim();
  const match = compact.match(/^(\d+)동?$/u);
  if (!match) return null;
  return `${match[1]}동`;
}

/**
 * Independent 동 token only. Rejects 1504동, 504호, 504번길, and bare 504.
 */
export function hasExactDongToken(
  text: string | null | undefined,
  canonicalDong: string,
): boolean {
  if (!text) return false;
  const number = canonicalDong.replace(/동$/u, "");
  if (!/^\d+$/u.test(number)) return false;
  const token = new RegExp(`(?<![0-9])${number}동(?![0-9가-힣])`, "u");
  return token.test(text);
}

export function compactIdentity(value: string): string {
  return value.replace(/\s+/gu, "").trim();
}

export function apartmentIdentityMatches(args: {
  buildingName: string;
  placeName?: string | null;
  addressName?: string | null;
  roadAddressName?: string | null;
}): boolean {
  const building = compactIdentity(args.buildingName);
  if (!building) return false;
  const hay = [args.placeName, args.addressName, args.roadAddressName]
    .filter((part): part is string => Boolean(part && part.trim()))
    .map(compactIdentity)
    .join(" ");
  return hay.includes(building);
}

function parseKeywordCoords(
  doc: KakaoKeywordPlace,
): { latitude: number; longitude: number } | null {
  const latitude = Number(doc.y);
  const longitude = Number(doc.x);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  return { latitude, longitude };
}

/**
 * Exact apartment + exact dong only.
 * Facility POIs (EV charger, office) are rejected even if title contains N동.
 * Ambiguous apartment-dong coords → null (use base + pin confirmation).
 */
export function selectExactApartmentDongHit(args: {
  buildingName: string;
  dong: string;
  documents: KakaoKeywordPlace[];
}): { latitude: number; longitude: number } | null {
  const canonicalDong = normalizeCanonicalDong(args.dong);
  const building = args.buildingName.trim();
  if (!canonicalDong || !building) return null;

  const matches: Array<{ latitude: number; longitude: number }> = [];
  for (const doc of args.documents) {
    if (!isKakaoApartmentDongPlace(doc)) continue;
    // Prefer place_name (동 단위 POI). Address fields alone often lack 동 token.
    const dongHit =
      hasExactDongToken(doc.place_name, canonicalDong) ||
      hasExactDongToken(doc.address_name, canonicalDong) ||
      hasExactDongToken(doc.road_address_name, canonicalDong);
    if (!dongHit) continue;
    if (
      !apartmentIdentityMatches({
        buildingName: building,
        placeName: doc.place_name,
        addressName: doc.address_name,
        roadAddressName: doc.road_address_name,
      })
    ) {
      continue;
    }
    const coords = parseKeywordCoords(doc);
    if (!coords) continue;
    matches.push(coords);
  }

  if (matches.length === 0) return null;
  const first = matches[0];
  const ambiguous = matches.some(
    (item) => item.latitude !== first.latitude || item.longitude !== first.longitude,
  );
  // Multiple distinct exact hits → refuse auto-pick (manual pin instead).
  if (ambiguous) return null;
  return first;
}

export const PROVIDER_DONG_EXACT = "provider_dong_exact" as const;
export const PROVIDER_BASE_ADDRESS = "provider_base_address" as const;
export const USER_ADJUSTED = "user_adjusted" as const;
