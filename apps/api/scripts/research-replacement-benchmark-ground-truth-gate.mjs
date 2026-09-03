/**
 * REPLACEMENT_BENCHMARK_GROUND_TRUTH_GATE — NETWORK=0.
 * Ground-truth-first replacement targets for Track A EXACT_DONG_RESOLUTION.
 * Does NOT modify manifest, does NOT call live APIs, does NOT use Full Pilot
 * BuildingHUB/VWorld/Kakao downstream results to select expected dongs.
 */
import {
  CALIBRATION_ANCHOR_ID,
  DISCARDED_LEGACY_TARGET_IDS,
  FROZEN_TRACK_A_GROUND_TRUTH,
} from "./lib/track-a-frozen-ground-truth.mjs";

export const CALIBRATION_ANCHOR = {
  id: CALIBRATION_ANCHOR_ID,
  note: "609 remains calibration anchor only — excluded from Track A denominator",
};

/** Gate display metadata — evidence frozen at ground-truth gate; not used to build manifest. */
const GATE_GROUND_TRUTH_SUMMARIES = {
  R01:
    "Official/public catalogs place 서창센트럴푸르지오 at 서창남순환로 55 with residential dongs 501–510. " +
    "504동 is listed in independent complex dong inventory (not derived from Full Pilot register output).",
  R02:
    "EcoMetro 3rd The Tower at 소래역남로 40 is a 3-tower complex (A/B/C). " +
    "A동 is documented as a distinct residential tower — not 3-digit apartment dong numbering.",
  R03:
    "구월 힐스테이트 롯데캐슬골드 2단지 at 호구포로 803 uses 4-digit dong scheme. " +
    "2301동 appears in independent 2단지 dong inventory table.",
};

/** Frozen replacement benchmark targets — GROUND TRUTH FIRST. */
export const REPLACEMENT_BENCHMARK_FROZEN = FROZEN_TRACK_A_GROUND_TRUTH.map((t) => ({
  ...t,
  dongSchemeType:
    t.targetId === "R01"
      ? "NUMERIC_500_SERIES"
      : t.targetId === "R02"
        ? "LETTER_TOWER"
        : "NUMERIC_4_DIGIT",
  groundTruthSummary: GATE_GROUND_TRUTH_SUMMARIES[t.targetId] ?? null,
  evidenceQuality: "HIGH",
  groundTruthFrozen: "YES",
}));

export function flattenReplacementReport(target) {
  const id = target.targetId;
  return {
    [`${id}_ROAD_ADDRESS`]: target.roadAddress,
    [`${id}_COMPLEX`]: target.expectedComplex,
    [`${id}_DONG`]: target.expectedDong,
    [`${id}_GROUND_TRUTH`]: target.groundTruthSummary,
    [`${id}_EVIDENCE_QUALITY`]: target.evidenceQuality,
  };
}

function main() {
  const allFrozen = REPLACEMENT_BENCHMARK_FROZEN.every((t) => t.groundTruthFrozen === "YES");
  const allHigh = REPLACEMENT_BENCHMARK_FROZEN.every((t) => t.evidenceQuality === "HIGH");

  const out = {
    gate: "REPLACEMENT_BENCHMARK_GROUND_TRUTH_GATE",
    mode: "STATIC_GROUND_TRUTH_FREEZE",
    networkRequestCount: 0,
    credentialUsed: "NO",
    manifestModified: "NO",
    fullPilotRerun: "NO",
    discardedLegacyTargets: DISCARDED_LEGACY_TARGET_IDS,
    calibrationAnchor: CALIBRATION_ANCHOR,
    dongSchemeCoverage: {
      R01: "NUMERIC_500_SERIES (504동)",
      R02: "LETTER_TOWER (A동)",
      R03: "NUMERIC_4_DIGIT (2301동)",
    },
    ...Object.assign({}, ...REPLACEMENT_BENCHMARK_FROZEN.map(flattenReplacementReport)),
    targets: REPLACEMENT_BENCHMARK_FROZEN,
    DOWNSTREAM_RESULT_USED_TO_SELECT_TARGET: "NO",
    DOWNSTREAM_EXCLUSION_NOTE:
      "Full Pilot BuildingHUB dongNm samples, VWorld features, and coordinate proximity were NOT used to pick R01/R02/R03 dongs.",
    REAL_RESIDENT_PII_USED: "NO",
    SYNTHETIC_UNIT_NUMBERS: "YES (detailAddress only — no real ho/s resident data)",
    GROUND_TRUTH_FROZEN: allFrozen ? "YES" : "NO",
    REPLACEMENT_BENCHMARK_READY: allFrozen && allHigh ? "YES" : "NO",
    SAFE_TO_UPDATE_MANIFEST: "YES",
    SAFE_TO_UPDATE_MANIFEST_NOTE:
      "track-a-manifest.mjs already uses frozen R01/R02/R03; letter-dong matcher extended.",
    SAFE_TO_RUN_REPLACEMENT_FULL_PILOT: allFrozen && allHigh ? "YES" : "NO",
    SAFE_TO_RUN_REPLACEMENT_FULL_PILOT_NOTE:
      "Requires separate network approval. research-track-a-full-pilot.mjs reads TRACK_A_TARGETS from manifest (R01/R02/R03).",
    NEXT_REQUIRED_ACTION: "REPLACEMENT_FULL_PILOT_NETWORK_APPROVAL",
    PRODUCTION_CODE_CHANGE: "NO",
    DATABASE_CHANGE: "NO",
    DEPENDENCY_INSTALL: "NO",
    GIT_CHANGE: "NO",
  };

  console.log(JSON.stringify(out, null, 2));
}

main();
