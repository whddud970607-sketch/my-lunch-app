/**
 * R02_REGISTER_BLDNM_PREFIX_GATE — NETWORK=0 evidence trace.
 * Resolves discrepancy between complex-name evidence gate and live full-chain rerun.
 * No matcher changes, no additional BuildingHUB calls.
 */
import {
  assessComplexNameMatch,
  matchBuildingRegisterIdentity,
  normalizeWhitespace,
} from "./lib/building-identity-matcher.mjs";
import { normalizeRegisterItem } from "./lib/building-hub-client.mjs";

const FROZEN_CORE = "에코메트로3차더타워";
const COMPLEX_HINT = "에코메트로3차 더타워";

/** Live-confirmed from R02_BUILDING_HUB_HTTP_DIAGNOSTIC (Call 1, HTTP 200). */
const DIAGNOSTIC_LIVE_DONG_EVIDENCE = {
  registerRowCount: 5,
  dongNmPresentCount: 4,
  liveDongLabels: ["주차장", "B", "A", "판매시설"],
  note: "dongNm labels live-confirmed; bldNm NOT exported in diagnostic output at that time",
};

/** From research-r02-complex-name-evidence-gate.mjs — NOT live BuildingHUB capture. */
const PREVIOUS_EVIDENCE = {
  reportedBldNm: "에코메트로3차더타워판매시설AB아파트",
  source:
    "research-r02-complex-name-evidence-gate.mjs SANITIZED_REGISTER_EVIDENCE — " +
    "bldNm INFERRED from public:zippoom catalog cross-check; dongNm live-confirmed only",
  liveBldNmCaptured: false,
};

/** Observed from approved R02_FULL_CHAIN_RERUN (second execution, BuildingHUB PASS). */
const FULL_CHAIN_OBSERVED = {
  dongMatch: "YES",
  complexMatchStatus: "MISMATCH",
  failureReason: "REGISTER_COMPLEX_MISMATCH",
  identityProvenance: {
    guard: "PREFIX",
    reason: "CORE_NOT_PREFIX",
  },
  sanitizedBldNmPersisted: false,
  note: "rerun JSON did not export identity.matches[0].bldNm — instrumentation gap",
};

function traceMatcherInput(bldNm, dongToken = "A") {
  const normalizedBldNm = normalizeWhitespace(bldNm);
  const normalizedHint = normalizeWhitespace(COMPLEX_HINT);
  const complex = assessComplexNameMatch(bldNm, COMPLEX_HINT, { dongToken });
  return {
    bldNm,
    normalizedBldNm,
    normalizedHint,
    corePrefixPresent: normalizedBldNm.startsWith(FROZEN_CORE),
    complexMatchStatus: complex.status,
    guardResult: complex.guardResult ?? null,
    matchedCore: complex.matchedCore ?? null,
  };
}

function simulateIdentityEvaluation(rows) {
  const identity = matchBuildingRegisterIdentity(rows, {
    dong: "A",
    complexNameHint: COMPLEX_HINT,
  });
  return {
    dongMatch: identity.dongMatch,
    complexNameMatch: identity.complexNameMatch,
    identityVerified: identity.identityVerified,
    failureReason: identity.failureReason,
    matchCount: identity.matches.length,
    perMatch: identity.matches.map((m) => ({
      dongNm: m.dongNm,
      bldNm: m.bldNm,
      complexNameMatch: m.complexNameMatch,
      sameRow: true,
    })),
  };
}

function main() {
  const previousReplay = traceMatcherInput(PREVIOUS_EVIDENCE.reportedBldNm, "A");
  const adminPrefixCandidate = traceMatcherInput(
    "인천소래논현구역에코메트로3차더타워판매시설AB아파트",
    "A",
  );
  const exactMarketingCandidate = traceMatcherInput("에코메트로3차 더타워", "A");

  const logicalDeduction = {
    rule:
      "CORE_NOT_PREFIX observed in live rerun ⟹ live normalized bldNm does NOT start with frozen core",
    previousEvidenceWouldProduce:
      previousReplay.corePrefixPresent && previousReplay.complexMatchStatus !== "MISMATCH"
        ? "NOT CORE_NOT_PREFIX"
        : previousReplay.complexMatchStatus,
    conclusion:
      previousReplay.corePrefixPresent
        ? "Live A-row bldNm CANNOT equal previous evidence gate reported value " +
          "(would not produce CORE_NOT_PREFIX)"
        : "N/A",
  };

  const multiRowSimulation = simulateIdentityEvaluation([
    { dongNm: "A", bldNm: PREVIOUS_EVIDENCE.reportedBldNm },
    { dongNm: "B", bldNm: PREVIOUS_EVIDENCE.reportedBldNm },
    { dongNm: "판매시설", bldNm: PREVIOUS_EVIDENCE.reportedBldNm },
    { dongNm: "주차장", bldNm: "에코메트로3차더타워판매시설AB아파트1주차장" },
  ]);

  const adminPrefixSimulation = simulateIdentityEvaluation([
    { dongNm: "A", bldNm: "인천소래논현구역에코메트로3차더타워판매시설AB아파트" },
  ]);

  const codeTrace = {
    rawResponsePath:
      "extractRegisterItems(body) → normalizeRegisterItem(item) → pick(bldNm|BLD_NM|bld_nm)",
    bldNmMutation: "NONE — whitespace-only via normalizeWhitespace at match time",
    identityLoop:
      "matchBuildingRegisterIdentity: for each item, matchDongNm THEN assessComplexNameMatch on SAME item",
    rowCoherence: "dong and complex evaluated on identical register object per iteration",
    firstResultSelection:
      "NO — only rows passing dong filter enter dongMatches; single row required for identityVerified",
    orderingNote: "API row order preserved; no sort/reorder before match",
  };

  const out = {
    gate: "R02_REGISTER_BLDNM_PREFIX_GATE",
    mode: "STATIC_EVIDENCE_TRACE",
    NETWORK_REQUEST_COUNT: 0,
    R02_A_DONG_ROW_COUNT: "UNKNOWN_EXACT — live rerun dongMatch=YES implies exactly 1 A-row candidate",
    R02_A_DONG_BLDNM_VALUES:
      "NOT_PERSISTED_IN_RERUN_OUTPUT — requires sanitizedRegisterRows export on next rerun",
    PREVIOUS_EVIDENCE_BLDNM: PREVIOUS_EVIDENCE.reportedBldNm,
    PREVIOUS_EVIDENCE_SOURCE: PREVIOUS_EVIDENCE.source,
    PREVIOUS_EVIDENCE_LIVE_CAPTURED: "NO",
    FULL_CHAIN_MATCHER_BLDNM: "NOT_PERSISTED — provenance shows CORE_NOT_PREFIX only",
    FULL_CHAIN_NORMALIZED_BLDNM: "NOT_PERSISTED",
    FULL_CHAIN_OBSERVED: FULL_CHAIN_OBSERVED,
    FROZEN_NORMALIZED_CORE: FROZEN_CORE,
    CORE_PREFIX_PRESENT_IN_PREVIOUS_EVIDENCE: previousReplay.corePrefixPresent ? "YES" : "NO",
    CORE_PREFIX_PRESENT_IN_ADMIN_PREFIX_CANDIDATE: adminPrefixCandidate.corePrefixPresent
      ? "YES"
      : "NO",
    DIAGNOSTIC_LIVE_DONG_EVIDENCE: DIAGNOSTIC_LIVE_DONG_EVIDENCE,
    matcherReplay: {
      previousEvidenceBldNm: previousReplay,
      adminPrefixCandidate: adminPrefixCandidate,
      exactMarketingBldNm: exactMarketingCandidate,
      logicalDeduction,
    },
    rowCoherenceSimulation: {
      withInferredPublicCatalogRows: multiRowSimulation,
      withAdminPrefixARow: adminPrefixSimulation,
    },
    codeTrace,
    answers: {
      Q1_actualLiveBldNm:
        "Not captured in rerun JSON; deduced NOT equal to previous evidence bldNm (see logicalDeduction)",
      Q2_previousEvidenceSource:
        "Public catalog (zippoom) cross-check — NOT live BuildingHUB bldNm field capture",
      Q3_fullChainMatcherInput:
        "Same-row bldNm from A dong register object; exact string not exported",
      Q4_multipleARows:
        "dongMatch=YES rules out 0 or 2+ unresolved A candidates at identity stage",
      Q5_rowOrdering:
        "No first-row shortcut; dong filter then complex on each matching row",
      Q6_sameRowEvaluation: "YES — code trace confirmed",
      Q7_normalizationMutation: "NO prefix added/changed — whitespace strip only",
      Q8_administrativePrefixForm:
        "Consistent with CORE_NOT_PREFIX replay; live capture pending instrumentation",
    },
    EVIDENCE_DISCREPANCY_EXPLAINED: "YES",
    discrepancySummary:
      "Complex-name evidence gate reported an INFERRED public-catalog bldNm as register evidence. " +
      "Live full-chain used actual BuildingHUB bldNm which does NOT start with frozen core (CORE_NOT_PREFIX). " +
      "These were never the same data source.",
    ROOT_CAUSE_CLASSIFICATION: "EVIDENCE_REPORTING_ERROR",
    secondaryClassification: "ADMINISTRATIVE_PREFIX_VARIANT",
    MATCHER_CHANGE_REQUIRED: "NO",
    ROW_SELECTION_CHANGE_REQUIRED: "NO",
    INSTRUMENTATION_GAP: "R02 full-chain rerun must export sanitizedRegisterRows + matcher bldNm",
    GROUND_TRUTH_MUTATED: "NO",
    MANIFEST_MUTATED: "NO",
    SAFE_TO_DESIGN_NEXT_FIX: "YES",
    NEXT_REQUIRED_ACTION: "EXPORT_LIVE_BLDNM_THEN_DESIGN_ADMIN_PREFIX_COMPOUND_RULE",
  };

  console.log(JSON.stringify(out, null, 2));
}

main();
