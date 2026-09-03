/**
 * Research-only parcel resolver port.
 * Implemented by KakaoAddressParcelAdapter (research Track A).
 */

export const ParcelResolverStatus = {
  RESOLVED: "RESOLVED",
  UNRESOLVED: "UNRESOLVED",
  AMBIGUOUS: "AMBIGUOUS",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  BLOCKED: "BLOCKED",
};

/**
 * @typedef {object} ParcelIdentity
 * @property {string} sigunguCd
 * @property {string} bjdongCd
 * @property {string} platGbCd
 * @property {string} bun
 * @property {string} ji
 * @property {string} provenance
 */

/**
 * @typedef {object} ParcelResolverResult
 * @property {string} status
 * @property {ParcelIdentity|null} parcel
 * @property {string|null} reason
 * @property {string|null} provenance
 */

export function createBlockedParcelResolver() {
  return {
    id: "blocked-parcel-resolver",
    async resolve(_roadAddress) {
      return {
        status: ParcelResolverStatus.BLOCKED,
        parcel: null,
        reason: "PARCEL_SEED_GATE_PENDING",
        provenance: null,
      };
    },
  };
}

/**
 * Test/injection resolver — not a production provider.
 * @param {ParcelIdentity} parcel
 */
export function createFixedParcelResolver(parcel) {
  return {
    id: "fixed-parcel-resolver",
    async resolve(_roadAddress) {
      return {
        status: ParcelResolverStatus.RESOLVED,
        parcel: { ...parcel, provenance: parcel.provenance ?? "test-fixture" },
        reason: null,
        provenance: parcel.provenance ?? "test-fixture",
      };
    },
  };
}
