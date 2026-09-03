/**
 * BENCHMARK_IDENTITY_CORRECTION_GATE — static ground-truth analysis (NETWORK=0).
 * Does not modify manifest, does not call live APIs, does not select replacement dongs
 * from BuildingHUB/VWorld downstream results.
 */
import { TRACK_A_TARGETS } from "./lib/track-a-manifest.mjs";

/** Independent public evidence catalog — sources external to pipeline outputs. */
const PUBLIC_EVIDENCE = {
  T01: {
    roadAddress: "인천광역시 남동구 서창남순환로 55",
    complexPublicName: "서창센트럴푸르지오",
    groundTruthSummary:
      "Road address resolves to 서창센트럴푸르지오 (2018, ~10–11 residential dongs). " +
      "Public dong scheme is 501–510동 plus ancillary facilities — not 100-series.",
    existingFixtureDong: "101동",
    dongExistsAtAddress: false,
    dongSchemeNotes: "501동–510동 (집품, 단지 공개 catalog)",
    parcelRelation: "ROAD_COMPLEX_ALIGNED",
    sources: [
      "repo:fixtures/namdong10-building-names-preview.json (unitTestNote=synthetic_test_only_not_verified_unit)",
      "repo:seed-map-spike.mjs uses 504동 at same road address (contradicts 101 fixture)",
      "public:namu.moe 서창 센트럴 푸르지오 — 서창남순환로 55, 10개동",
      "public:zippoom 센트럴푸르지오 — 501–510동 listed",
    ],
  },
  T07: {
    roadAddress: "인천광역시 남동구 소래역남로 40",
    complexPublicName: "에코메트로3차 더타워",
    groundTruthSummary:
      "Road address is EcoMetro 3rd The Tower — a 3-tower 주상복합 (A/B/C동), not 3-digit apartment dong numbering.",
    existingFixtureDong: "305동",
    dongExistsAtAddress: false,
    dongSchemeNotes: "A동, B동, C동 only (Wikipedia / public wiki catalogs)",
    parcelRelation: "ROAD_COMPLEX_ALIGNED",
    sources: [
      "repo:fixtures/namdong10-building-names-preview.json (unitTestNote=synthetic_test_only_not_verified_unit)",
      "public:ko.wikipedia.org 에코메트로 3차 더 타워 — A/B/C 3동",
      "public:당근부동산 listing — 소래역남로 40 A동",
    ],
  },
  T09: {
    roadAddress: "인천광역시 남동구 호구포로 803",
    complexPublicName: "롯데캐슬골드 (구월 힐스테이트 롯데캐슬골드 2단지)",
    groundTruthSummary:
      "Road address is 롯데캐슬골드 2단지 — large complex with 4-digit dong scheme (2101–2411 range). 701동 is not in public dong inventory.",
    existingFixtureDong: "701동",
    dongExistsAtAddress: false,
    dongSchemeNotes: "2101동–2411동 style (namu.moe 구월 힐스테이트 롯데캐슬골드 2단지 table)",
    parcelRelation: "ROAD_COMPLEX_ALIGNED",
    sources: [
      "repo:fixtures/namdong10-building-names-preview.json (unitTestNote=synthetic_test_only_not_verified_unit)",
      "public:namu.moe 구월 힐스테이트 롯데캐슬골드 — 2단지 호구포로 803",
      "public:dorojuso.kr — 호구포로 803 롯데캐슬골드 (official road address record)",
      "public:aptrank.com — 롯데캐슬골드 40개동 3384세대",
    ],
  },
};

function classifyTarget(evidence) {
  if (!evidence.dongExistsAtAddress) {
    if (evidence.parcelRelation === "ROAD_COMPLEX_ALIGNED") {
      return {
        classification: "FIXTURE_INVALID",
        existingDongValid: "NO",
        parcelRelation: "ROAD_AND_COMPLEX_MATCH_FIXTURE_DONG_INVALID",
      };
    }
    return {
      classification: "PARCEL_RELATION_MISMATCH",
      existingDongValid: "NO",
      parcelRelation: "MISMATCH",
    };
  }
  return {
    classification: "VALID",
    existingDongValid: "YES",
    parcelRelation: "ALIGNED",
  };
}

function main() {
  const targets = {};
  for (const t of TRACK_A_TARGETS) {
    const ev = PUBLIC_EVIDENCE[t.targetId];
    const c = classifyTarget(ev);
    targets[t.targetId] = {
      fixtureKey: t.fixtureKey,
      roadAddress: t.roadAddress,
      existingFixtureDong: t.expectedBuldNmDc,
      complexNameHint: t.complexNameHint,
      GROUND_TRUTH: ev.groundTruthSummary,
      EXISTING_DONG_VALID: c.existingDongValid,
      PARCEL_RELATION: c.parcelRelation,
      CLASSIFICATION: c.classification,
      dongSchemeNotes: ev.dongSchemeNotes,
      independentSources: ev.sources,
    };
  }

  const allInvalid = Object.values(targets).every((t) => t.CLASSIFICATION === "FIXTURE_INVALID");

  const out = {
    gate: "BENCHMARK_IDENTITY_CORRECTION_GATE",
    mode: "STATIC_GROUND_TRUTH_ANALYSIS",
    networkRequestCount: 0,
    credentialUsed: "NO",
    manifestModified: "NO",
    fullPilotRerun: "NO",
    TRACK_A_FULL_PILOT_RECORDED: {
      verdict: "FAIL",
      kakaoParcelResolution: "PASS (3/3)",
      failClosedBehavior: "PASS",
      buildingIdentity: "FAIL (0/3)",
      note: "Identity failure consistent with invalid fixture dongs — not engine-wide failure",
    },
    ...Object.fromEntries(
      Object.entries(targets).flatMap(([id, t]) => [
        [`${id}_GROUND_TRUTH`, t.GROUND_TRUTH],
        [`${id}_EXISTING_DONG_VALID`, t.EXISTING_DONG_VALID],
        [`${id}_PARCEL_RELATION`, t.PARCEL_RELATION],
        [`${id}_CLASSIFICATION`, t.CLASSIFICATION],
      ]),
    ),
    targets,
    BENCHMARK_DATASET_TRUSTWORTHY: allInvalid ? "NO" : "PARTIAL",
    REPLACEMENT_TARGETS_REQUIRED: allInvalid ? "YES (3/3)" : "PARTIAL",
    REPLACEMENT_RULE: "GROUND_TRUTH_FIRST_THEN_PIPELINE — no downstream dong selection",
    SAFE_TO_CORRECT_MANIFEST: "NO",
    SAFE_TO_CORRECT_MANIFEST_NOTE:
      "Replacement targets not yet independently verified. Existing fixtures must be discarded, not patched from pipeline output.",
    SAFE_TO_RERUN_TRACK_A: "NO",
    SAFE_TO_RERUN_TRACK_A_NOTE:
      "Rerun blocked until new benchmark targets pass independent ROAD+COMPLEX+DONG verification gate.",
    NEXT_REQUIRED_GATE: "REPLACEMENT_BENCHMARK_GROUND_TRUTH_GATE",
    PRODUCTION_CODE_CHANGE: "NO",
    DATABASE_CHANGE: "NO",
    DEPENDENCY_INSTALL: "NO",
    GIT_CHANGE: "NO",
  };

  console.log(JSON.stringify(out, null, 2));
}

main();
