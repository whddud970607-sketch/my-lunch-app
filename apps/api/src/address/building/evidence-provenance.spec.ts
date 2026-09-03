import {
  EvidenceProvenanceTypes,
  validateProvenanceReporting,
} from "./evidence-provenance";

describe("evidence-provenance", () => {
  it("INFERRED must not be reported as LIVE_PROVIDER", () => {
    const bad = validateProvenanceReporting({
      provenance: EvidenceProvenanceTypes.INFERRED,
      reportedAs: EvidenceProvenanceTypes.LIVE_PROVIDER,
    });
    expect(bad.valid).toBe(false);
    expect(bad.reason).toBe("INFERRED_EVIDENCE_REPORTED_AS_LIVE_PROVIDER");
  });

  it("LIVE_PROVIDER reporting LIVE_PROVIDER is valid", () => {
    const ok = validateProvenanceReporting({
      provenance: EvidenceProvenanceTypes.LIVE_PROVIDER,
      reportedAs: EvidenceProvenanceTypes.LIVE_PROVIDER,
    });
    expect(ok.valid).toBe(true);
  });

  it("INFERRED reported as INFERRED is valid", () => {
    const ok = validateProvenanceReporting({
      provenance: EvidenceProvenanceTypes.INFERRED,
      reportedAs: EvidenceProvenanceTypes.INFERRED,
    });
    expect(ok.valid).toBe(true);
  });
});
