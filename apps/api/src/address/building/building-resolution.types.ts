/**
 * Track A building-resolution domain types — stage-separated provenance.
 */

export const IdentityProvenance = {
  BUILDING_HUB_VERIFIED: "BUILDING_HUB_VERIFIED",
} as const;
export type IdentityProvenance =
  (typeof IdentityProvenance)[keyof typeof IdentityProvenance];

export const GeometryProvenance = {
  VWORLD_EXACT_PNU_DONG_FEATURE: "VWORLD_EXACT_PNU_DONG_FEATURE",
} as const;
export type GeometryProvenance =
  (typeof GeometryProvenance)[keyof typeof GeometryProvenance];

export const PinProvenance = {
  BUILDING_CENTER: "BUILDING_CENTER",
} as const;
export type PinProvenance = (typeof PinProvenance)[keyof typeof PinProvenance];

export const VworldComplexEvidence = {
  MATCHING: "MATCHING",
  MISSING: "MISSING",
  CONTRADICTORY: "CONTRADICTORY",
  UNKNOWN: "UNKNOWN",
} as const;
export type VworldComplexEvidence =
  (typeof VworldComplexEvidence)[keyof typeof VworldComplexEvidence];

export const ResolutionStageStatus = {
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;
export type ResolutionStageStatus =
  (typeof ResolutionStageStatus)[keyof typeof ResolutionStageStatus];

export type BuildingResolutionProvenance = {
  identityProvenance: IdentityProvenance | null;
  geometryProvenance: GeometryProvenance | null;
  complexCorroboration: VworldComplexEvidence | null;
  vworldProviderBuildingId: string | null;
  pinProvenance: PinProvenance | null;
};

export type BuildingResolutionStageReport = {
  addressNormalized: ResolutionStageStatus;
  buildingIdentityVerified: ResolutionStageStatus;
  buildingGeometryVerified: ResolutionStageStatus;
  buildingCenter: ResolutionStageStatus;
};

export type ParcelIdentity = {
  sigunguCd: string;
  bjdongCd: string;
  platGbCd: string;
  bun: string;
  ji: string;
  provenance: string;
};

export type RegisterRow = {
  dongNm?: string | null;
  bldNm?: string | null;
  platPlc?: string | null;
  newPlatPlc?: string | null;
};

export type GeoJsonGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] }
  | null;

export type BuildingResolutionFailureReason =
  | "PARCEL_UNRESOLVED"
  | "BUILDING_HUB_FETCH_FAILED"
  | "REGISTER_IDENTITY_UNRESOLVED"
  | "REGISTER_DONG_NOT_FOUND"
  | "REGISTER_DONG_AMBIGUOUS"
  | "REGISTER_COMPLEX_MISMATCH"
  | "PNU_BUILD_FAILED"
  | "VWORLD_FETCH_FAILED"
  | "VWORLD_NO_MATCH"
  | "VWORLD_AMBIGUOUS"
  | "VWORLD_WRONG_PNU"
  | "VWORLD_WRONG_DONG"
  | "VWORLD_CONTRADICTORY_COMPLEX"
  | "VWORLD_COMPLEX_EVIDENCE_UNKNOWN"
  | "BUILDING_HUB_IDENTITY_NOT_VERIFIED"
  | "GEOMETRY_MISSING"
  | "GEOMETRY_INVALID"
  | "BUILDING_CENTER_NOT_VERIFIED"
  | "BUILDING_CHAIN_NOT_CONFIGURED";

export type BuildingResolutionSuccess = {
  ok: true;
  latitude: number;
  longitude: number;
  pnu: string;
  complexNameMatch: string;
  provenance: BuildingResolutionProvenance;
  stages: BuildingResolutionStageReport;
  failureReason: null;
};

export type BuildingResolutionFailure = {
  ok: false;
  provenance: Partial<BuildingResolutionProvenance>;
  stages: BuildingResolutionStageReport;
  failureReason: BuildingResolutionFailureReason;
};

export type BuildingResolutionResult =
  | BuildingResolutionSuccess
  | BuildingResolutionFailure;
