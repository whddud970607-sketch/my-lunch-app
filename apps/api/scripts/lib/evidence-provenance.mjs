/**
 * Research evidence provenance labels — separate live from inferred sources.
 */

export const EVIDENCE_PROVENANCE_TYPES = {
  LIVE_PROVIDER: "LIVE_PROVIDER",
  PUBLIC_OFFICIAL: "PUBLIC_OFFICIAL",
  PUBLIC_CATALOG: "PUBLIC_CATALOG",
  INFERRED: "INFERRED",
  MOCK_FIXTURE: "MOCK_FIXTURE",
};

/** @param {{ provenance: string, reportedAs?: string }} record */
export function validateProvenanceReporting(record) {
  if (
    record.provenance === EVIDENCE_PROVENANCE_TYPES.INFERRED &&
    record.reportedAs === EVIDENCE_PROVENANCE_TYPES.LIVE_PROVIDER
  ) {
    return {
      valid: false,
      reason: "INFERRED_EVIDENCE_REPORTED_AS_LIVE_PROVIDER",
    };
  }
  return { valid: true, reason: null };
}
