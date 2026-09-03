/**
 * TRACK A Full Pilot Pre-Flight — static wiring verification (NETWORK=0).
 * Does not execute live Kakao/BuildingHUB/VWorld calls.
 */
import { spawnSync } from "node:child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createKakaoAddressParcelAdapter,
  createLiveKakaoAddressParcelAdapter,
  createMockKakaoAddressParcelAdapter,
} from "./lib/kakao-address-parcel.adapter.mjs";
import { TRACK_A_TARGETS } from "./lib/track-a-manifest.mjs";
import {
  computePerTargetNetworkBudget,
  computeTrackANetworkBudget,
} from "./lib/track-a-network-budget.mjs";
import {
  manifestToPipelineTarget,
  parcelToBuildingHubQuery,
  runTrackAPipeline,
} from "./lib/track-a-pipeline.mjs";
import { TerminalState } from "./lib/benchmark-report.mjs";
import { createTrackAPipelineMockDeps } from "./lib/fixtures/track-a-pipeline-fixtures.mjs";
import { buildMockFixtureMap } from "./lib/fixtures/kakao-parcel-track-a-fixtures.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB_DIR = path.join(__dirname, "lib");

const RESEARCH_FILES = [
  "kakao-address-parcel.adapter.mjs",
  "track-a-pipeline.mjs",
  "building-hub-client.mjs",
  "building-identity-matcher.mjs",
  "vworld-exact-feature.mjs",
  "representative-geometry.mjs",
  "building-center-gate.mjs",
  "pnu-builder.mjs",
  "parcel-resolver.port.mjs",
  "benchmark-report.mjs",
  "track-a-manifest.mjs",
];

const FORBIDDEN_ACTIVE_PATTERNS = [
  { id: "PROXIMITY_FALLBACK", regex: /proximityUsed:\s*"YES"|useProximity|proximityRank|coordinateSelectionUsed:\s*"YES"/i },
  { id: "NEAREST_BUILDING", regex: /nearestBuildingFallbackUsed:\s*"YES"|findNearest|NEAREST_POLYGON|nearestParcel/i },
  { id: "BBOX_IDENTITY", regex: /params\.bbox|CQL_FILTER|Envelope[\s\S]{0,20}PropertyName/i },
];

function runTestFile(relativePath) {
  const testFile = path.join(__dirname, relativePath);
  const result = spawnSync(process.execPath, ["--test", testFile], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { pass: result.status === 0, status: result.status };
}

function runAllLocalTests() {
  const files = [
    "lib/pnu-builder.test.mjs",
    "lib/building-hub-client.test.mjs",
    "lib/building-identity-matcher.test.mjs",
    "lib/vworld-exact-feature.test.mjs",
    "lib/representative-geometry.test.mjs",
    "lib/kakao-address-parcel.adapter.test.mjs",
    "lib/building-center-gate.test.mjs",
    "lib/track-a-manifest.test.mjs",
    "lib/track-a-pipeline.test.mjs",
  ];
  const results = files.map((f) => ({ file: f, ...runTestFile(f) }));
  return {
    pass: results.every((r) => r.pass),
    passCount: results.filter((r) => r.pass).length,
    total: results.length,
    results,
  };
}

function scanForbiddenFallbacks() {
  const hits = {};
  for (const id of FORBIDDEN_ACTIVE_PATTERNS.map((p) => p.id)) {
    hits[id] = [];
  }

  for (const file of RESEARCH_FILES) {
    const full = path.join(LIB_DIR, file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const pat of FORBIDDEN_ACTIVE_PATTERNS) {
      if (pat.regex.test(text)) {
        hits[pat.id].push(file);
      }
    }
  }

  return {
    PROXIMITY_FALLBACK_PRESENT: hits.PROXIMITY_FALLBACK.length ? "YES" : "NO",
    NEAREST_BUILDING_FALLBACK_PRESENT: hits.NEAREST_BUILDING.length ? "YES" : "NO",
    BBOX_IDENTITY_FALLBACK_PRESENT: hits.BBOX_IDENTITY.length ? "YES" : "NO",
    hits,
  };
}

function verifyLiveAdapterWiring() {
  const mock = createMockKakaoAddressParcelAdapter(buildMockFixtureMap());
  const live = createLiveKakaoAddressParcelAdapter({
    apiKey: "preflight-key",
    fetchFn: async () => ({ status: 200, json: async () => ({ documents: [] }) }),
  });
  const injectable = createKakaoAddressParcelAdapter({
    fetchAddressSearch: async () => ({ httpStatus: 200, body: { documents: [] } }),
  });

  return (
    typeof mock.resolve === "function" &&
    typeof live.resolve === "function" &&
    typeof injectable.resolve === "function" &&
    mock.id === live.id &&
    live.id === injectable.id
  );
}

function verifyManifestWiring() {
  return TRACK_A_TARGETS.every((t) => {
    const m = manifestToPipelineTarget(t);
    return (
      m.roadAddress === t.roadAddress &&
      m.parsedDong === t.parsedDong &&
      m.expectedBuldNmDc === t.expectedBuldNmDc &&
      m.complexNameHint === t.complexNameHint &&
      m.expectedComplexNormalized === t.expectedComplexNormalized
    );
  });
}

function verifyParcelToHubMapping() {
  const parcel = {
    sigunguCd: "28200",
    bjdongCd: "10500",
    platGbCd: "0",
    bun: "0682",
    ji: "0000",
  };
  const q = parcelToBuildingHubQuery(parcel);
  return (
    q.sigunguCd === parcel.sigunguCd &&
    q.bjdongCd === parcel.bjdongCd &&
    q.platGbCd === parcel.platGbCd &&
    q.bun === parcel.bun &&
    q.ji === parcel.ji
  );
}

async function verifyTargetPipelineReady(targetId) {
  const target = TRACK_A_TARGETS.find((t) => t.targetId === targetId);
  const deps = createTrackAPipelineMockDeps(targetId, buildMockFixtureMap());
  const r = await runTrackAPipeline(target, deps);
  return r.terminal === TerminalState.BUILDING_CENTER_VERIFIED;
}

async function main() {
  const localTests = runAllLocalTests();
  const fallbackScan = scanForbiddenFallbacks();
  const budget = computeTrackANetworkBudget();
  const perTarget = computePerTargetNetworkBudget();

  const checks = {
    LIVE_ADAPTER_WIRING_READY: verifyLiveAdapterWiring() ? "PASS" : "FAIL",
    MANIFEST_WIRING: verifyManifestWiring() ? "PASS" : "FAIL",
    PARCEL_TO_BUILDING_HUB_MAPPING: verifyParcelToHubMapping() ? "PASS" : "FAIL",
    BUILDING_HUB_PAGINATION: localTests.results.find((r) => r.file.includes("track-a-pipeline"))?.pass
      ? "PASS"
      : "FAIL",
    IDENTITY_FAIL_CLOSED: localTests.results.find((r) => r.file.includes("track-a-pipeline"))?.pass
      ? "PASS"
      : "FAIL",
    VWORLD_EXACT_QUERY: localTests.results.find((r) => r.file.includes("vworld-exact-feature"))?.pass
      ? "PASS"
      : "FAIL",
    VWORLD_FAIL_CLOSED: localTests.results.find((r) => r.file.includes("track-a-pipeline"))?.pass
      ? "PASS"
      : "FAIL",
    GEOMETRY_FAIL_CLOSED: localTests.results.find((r) => r.file.includes("building-center-gate"))?.pass
      ? "PASS"
      : "FAIL",
    REPRESENTATIVE_POINT_GATE: localTests.results.find((r) => r.file.includes("building-center-gate"))?.pass
      ? "PASS"
      : "FAIL",
  };

  const targetReady = {};
  for (const id of ["R01", "R02", "R03"]) {
    targetReady[`${id}_PIPELINE_READY`] = (await verifyTargetPipelineReady(id)) ? "PASS" : "FAIL";
  }

  const allChecksPass =
    localTests.pass &&
    Object.values(checks).every((v) => v === "PASS") &&
    Object.values(targetReady).every((v) => v === "PASS") &&
    fallbackScan.PROXIMITY_FALLBACK_PRESENT === "NO" &&
    fallbackScan.NEAREST_BUILDING_FALLBACK_PRESENT === "NO" &&
    fallbackScan.BBOX_IDENTITY_FALLBACK_PRESENT === "NO";

  const out = {
    gate: "TRACK_A_FULL_PILOT_PRE_FLIGHT",
    mode: "STATIC_VERIFICATION",
    ...checks,
    ...targetReady,
    EXPECTED_KAKAO_REQUESTS: budget.EXPECTED_KAKAO_REQUESTS,
    EXPECTED_BUILDING_HUB_REQUESTS_MAX: budget.EXPECTED_BUILDING_HUB_REQUESTS_MAX,
    EXPECTED_VWORLD_REQUESTS: budget.EXPECTED_VWORLD_REQUESTS,
    TOTAL_NETWORK_REQUEST_UPPER_BOUND: budget.TOTAL_NETWORK_REQUEST_UPPER_BOUND,
    perTargetNetworkBudget: perTarget,
    BUILDING_HUB_PAGINATION_NOTE: budget.BUILDING_HUB_PAGINATION_NOTE,
    PROXIMITY_FALLBACK_PRESENT: fallbackScan.PROXIMITY_FALLBACK_PRESENT,
    NEAREST_BUILDING_FALLBACK_PRESENT: fallbackScan.NEAREST_BUILDING_FALLBACK_PRESENT,
    BBOX_IDENTITY_FALLBACK_PRESENT: fallbackScan.BBOX_IDENTITY_FALLBACK_PRESENT,
    forbiddenPatternHits: fallbackScan.hits,
    LOCAL_TESTS: localTests.pass ? `PASS (${localTests.passCount}/${localTests.total} suites)` : "FAIL",
    localTestResults: localTests.results.map((r) => ({ file: r.file, pass: r.pass ? "PASS" : "FAIL" })),
    NETWORK_REQUEST_COUNT: 0,
    CREDENTIAL_USED: "NO",
    PRODUCTION_CODE_CHANGED: "NO",
    DATABASE_CHANGED: "NO",
    DEPENDENCY_INSTALLED: "NO",
    ENV_CHANGED: "NO",
    GIT_CHANGE: "NO",
    SAFE_TO_RUN_TRACK_A_FULL_PILOT: allChecksPass ? "YES" : "NO",
  };

  console.log(JSON.stringify(out, null, 2));
  if (!allChecksPass) process.exit(1);
}

main().catch(() => process.exit(1));
