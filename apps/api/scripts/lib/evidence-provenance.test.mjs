import assert from "node:assert/strict";
import test from "node:test";
import {
  EVIDENCE_PROVENANCE_TYPES,
  validateProvenanceReporting,
} from "./evidence-provenance.mjs";

test("INFERRED must not be reported as LIVE_PROVIDER", () => {
  const bad = validateProvenanceReporting({
    provenance: EVIDENCE_PROVENANCE_TYPES.INFERRED,
    reportedAs: EVIDENCE_PROVENANCE_TYPES.LIVE_PROVIDER,
  });
  assert.equal(bad.valid, false);
});

test("LIVE_PROVIDER reporting LIVE_PROVIDER is valid", () => {
  const ok = validateProvenanceReporting({
    provenance: EVIDENCE_PROVENANCE_TYPES.LIVE_PROVIDER,
    reportedAs: EVIDENCE_PROVENANCE_TYPES.LIVE_PROVIDER,
  });
  assert.equal(ok.valid, true);
});

test("INFERRED reported as INFERRED is valid", () => {
  const ok = validateProvenanceReporting({
    provenance: EVIDENCE_PROVENANCE_TYPES.INFERRED,
    reportedAs: EVIDENCE_PROVENANCE_TYPES.INFERRED,
  });
  assert.equal(ok.valid, true);
});
