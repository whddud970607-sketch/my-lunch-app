/** Resolution worker domain types — aligned with migrations 024/025 (draft). */

export type ResolutionStatusDb =
  | "pending"
  | "resolved"
  | "lower_quality"
  | "unresolved"
  | "ambiguous"
  | "provider_error";

export type ResolutionStageDb =
  | "pending"
  | "address_normalized"
  | "parcel_resolved"
  | "identity_verified"
  | "geometry_verified"
  | "building_center"
  | "failed";

export type PinAccuracyDb =
  | "address"
  | "building"
  | "entrance"
  | "driver_verified";

export type ResolutionFailureCodeDb =
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
  | "BUILDING_CHAIN_NOT_CONFIGURED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_CONFIGURATION_ERROR"
  | "QUALITY_GATE_REJECTED"
  | "NO_CANDIDATES";

export type ResolutionClaim = {
  pointId: string;
  driverId: string;
  claimToken: string;
  claimedBy: string;
  claimedAt: Date;
  leaseExpiresAt: Date;
  resolutionVersion: number;
  resolutionAttemptCount: number;
};

export type ResolutionPiiFetch = {
  pointId: string;
  rawAddress: string | null;
  detailAddress: string | null;
  normalizedAddress: string | null;
};

export type ResolutionPersistPayload = {
  resolutionStatus: ResolutionStatusDb;
  resolutionStage: ResolutionStageDb;
  pinAccuracy: PinAccuracyDb;
  location: { latitude: number; longitude: number } | null;
  identityProvenance: string | null;
  geometryProvenance: string | null;
  complexCorroboration: string | null;
  resolvedAt: Date | null;
  resolutionFailureCode: ResolutionFailureCodeDb | null;
  resolutionNextAttemptAt: Date | null;
  /** Bounded delay for DB-time next_attempt (preferred for Postgres persist). */
  retryDelayMs?: number | null;
  resolutionRetryExhausted: boolean;
  normalizedAddress?: string | null;
};

export type ResolutionQueuePoint = {
  id: string;
  driverId: string;
  resolutionStatus: ResolutionStatusDb;
  resolutionVersion: number;
  resolutionAttemptCount: number;
  pinAccuracy: PinAccuracyDb;
  resolutionNextAttemptAt: Date | null;
  resolutionRetryExhausted: boolean;
  location: { latitude: number; longitude: number } | null;
  resolutionClaimedBy: string | null;
  resolutionClaimToken: string | null;
  resolutionLeaseExpiresAt: Date | null;
};

export type ProviderErrorKind =
  | "timeout"
  | "rate_limited"
  | "auth_failed"
  | "configuration"
  | "server_error"
  | "network";

export class ResolutionProviderCallError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = "ResolutionProviderCallError";
  }
}
