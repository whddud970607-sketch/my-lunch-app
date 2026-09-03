export const EvidenceProvenanceTypes = {
  LIVE_PROVIDER: "LIVE_PROVIDER",
  PUBLIC_OFFICIAL: "PUBLIC_OFFICIAL",
  PUBLIC_CATALOG: "PUBLIC_CATALOG",
  INFERRED: "INFERRED",
  MOCK_FIXTURE: "MOCK_FIXTURE",
} as const;

export type EvidenceProvenanceType =
  (typeof EvidenceProvenanceTypes)[keyof typeof EvidenceProvenanceTypes];

export function validateProvenanceReporting(record: {
  provenance: string;
  reportedAs?: string;
}): { valid: boolean; reason: string | null } {
  if (
    record.provenance === EvidenceProvenanceTypes.INFERRED &&
    record.reportedAs === EvidenceProvenanceTypes.LIVE_PROVIDER
  ) {
    return {
      valid: false,
      reason: "INFERRED_EVIDENCE_REPORTED_AS_LIVE_PROVIDER",
    };
  }
  return { valid: true, reason: null };
}
