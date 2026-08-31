/**
 * Address / coordinate domain types — provider-neutral.
 * WGS84 only; KATEC conversion stays at Kakao Mobility boundary (mobile POC).
 */

export type GeocodeProviderId = "kakao" | "naver" | "public_building";

export type CoordinateType =
  | "COMPLEX_REPRESENTATIVE"
  | "BUILDING_CANDIDATE"
  | "BUILDING_VERIFIED"
  | "BUILDING_CENTER"
  | "BUILDING_ENTRANCE_CANDIDATE"
  | "BUILDING_ENTRANCE_VERIFIED"
  | "VEHICLE_ACCESS_CANDIDATE"
  | "VEHICLE_ACCESS_VERIFIED"
  | "UNRESOLVED";

export type PinQualityLevel =
  | "VERIFIED"
  | "HIGH_CONFIDENCE"
  | "CANDIDATE"
  | "COMPLEX_ONLY"
  | "UNRESOLVED";

export type PinAccuracyDb = "address" | "building" | "entrance" | "driver_verified";

export type ResolutionFailureReason =
  | "provider_not_configured"
  | "provider_timeout"
  | "provider_error"
  | "no_candidates"
  | "conflicting_candidates"
  | "dong_required_but_unresolved"
  | "quality_gate_rejected"
  | "public_data_unavailable";

export interface AddressResolutionInput {
  /** Full or road-level address string (PUBLIC/SYNTHETIC in tests). */
  roadAddress: string;
  /** Optional detail: dong/ho, complex hints. */
  detailAddress?: string | null;
  /** Explicit complex / building name when known from import. */
  complexName?: string | null;
  buildingName?: string | null;
}

export interface ParsedAddress {
  originalAddress: string;
  roadAddress: string | null;
  lotAddress: string | null;
  complexName: string | null;
  buildingName: string | null;
  dong: string | null;
  ho: string | null;
  postalCode: string | null;
  normalizedAddress: string;
  detailAddress: string | null;
}

export interface CoordinateCandidate {
  latitude: number;
  longitude: number;
  provider: GeocodeProviderId;
  sourceType: string;
  coordinateType: CoordinateType;
  confidence: number;
  evidence: string[];
  resolvedBuildingId?: string | null;
  resolvedDong?: string | null;
  providerPlaceId?: string | null;
  createdAt: string;
}

export interface PinPlacementDecision {
  candidate: CoordinateCandidate | null;
  pinQuality: PinQualityLevel;
  pinAccuracy: PinAccuracyDb;
  unresolvedReason: ResolutionFailureReason | null;
  failureMessage: string | null;
  allCandidates: CoordinateCandidate[];
  requiresDong: boolean;
}

export interface AddressResolutionResult {
  parsed: ParsedAddress;
  decision: PinPlacementDecision;
}
