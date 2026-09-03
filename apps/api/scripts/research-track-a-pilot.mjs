/**
 * TRACK A pilot orchestrator — DRY RUN / MOCK only (NETWORK=0).
 * KakaoAddressParcelAdapter wired with fixture mocks; BuildingHUB/VWorld not called.
 */
import { spawnSync } from "node:child_process";
import path from "path";
import { fileURLToPath } from "url";
import {
  finalizeDryRunReport,
  mapParcelResolverToReport,
  TerminalState,
  createTargetReport,
} from "./lib/benchmark-report.mjs";
import { formatDongLabel } from "./lib/building-identity-matcher.mjs";
import { createMockKakaoAddressParcelAdapter } from "./lib/kakao-address-parcel.adapter.mjs";
import { buildMockFixtureMap } from "./lib/fixtures/kakao-parcel-track-a-fixtures.mjs";
import { ParcelResolverStatus } from "./lib/parcel-resolver.port.mjs";
import { TRACK_A_TARGETS, CALIBRATION_ANCHOR_ID } from "./lib/track-a-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    "lib/track-a-manifest.test.mjs",
  ];
  const results = files.map((f) => ({ file: f, ...runTestFile(f) }));
  const passCount = results.filter((r) => r.pass).length;
  return {
    pass: passCount === files.length,
    total: files.length,
    passCount,
    results,
  };
}

async function dryRunTarget(target, parcelResolver) {
  const expectedDongLabel = formatDongLabel(target.parsedDong);
  const parcelResult = await parcelResolver.resolve(target.roadAddress);
  const parcelStep = mapParcelResolverToReport(parcelResult);

  const parcelResolved = parcelResult.status === ParcelResolverStatus.RESOLVED;
  const pipelineBlockedAt = parcelResolved ? "BUILDING_HUB" : "PARCEL_RESOLVER";
  const terminal =
    parcelStep.terminal ??
    (parcelResolved ? TerminalState.DRY_RUN_BLOCKED : parcelStep.terminal);

  const report = createTargetReport(target.targetId, {
    fixtureKey: target.fixtureKey,
    roadAddress: target.roadAddress,
    detailAddress: target.detailAddress,
    parsedDong: target.parsedDong,
    expectedBuldNmDc: target.expectedBuldNmDc,
    complexNameHint: target.complexNameHint,
    expectedComplexNormalized: target.expectedComplexNormalized,
    parcelResolverStatus: parcelResult.status,
    parcelFailureReason: parcelResult.reason,
    parcelMatch: parcelStep.parcelResolved,
    parcel: parcelResult.parcel,
    buildingHubCallsPlanned: parcelResolved ? 1 : 0,
    vworldCallsPlanned: parcelResolved ? 1 : 0,
    terminal: parcelResolved ? "DRY_RUN_PARCEL_RESOLVED" : terminal,
    failureReason: parcelStep.failureReason,
    pipelineBlockedAt,
    nextSteps: parcelResolved
      ? [
          "BuildingHUB pagination (not executed in dry run)",
          "PNU build",
          "VWorld exact GetFeature",
          "CUSTOM_INTERIOR_POINT",
        ]
      : [
          "Fix parcel resolution before BuildingHUB",
        ],
    dongLabelCheck: expectedDongLabel === target.expectedBuldNmDc ? "YES" : "NO",
    mockPipeline: parcelResult.status,
  });

  return finalizeDryRunReport(report);
}

async function main() {
  const localTests = runAllLocalTests();
  const parcelResolver = createMockKakaoAddressParcelAdapter(buildMockFixtureMap());
  const targets = [];

  for (const target of TRACK_A_TARGETS) {
    targets.push(await dryRunTarget(target, parcelResolver));
  }

  const mockPipelineByTarget = Object.fromEntries(
    targets.map((t) => [t.targetId, t.mockPipeline]),
  );

  const out = {
    implementation: "TRACK_A_PILOT_DRY_RUN",
    mode: "DRY_RUN_MOCK",
    KAKAO_PARCEL_ADAPTER_IMPLEMENTED: "YES",
    KAKAO_PARCEL_TESTS: localTests.results.find((r) => r.file.includes("kakao-address-parcel"))?.pass
      ? "PASS"
      : "FAIL",
    TOTAL_LOCAL_TESTS: `${localTests.passCount}/${localTests.total}`,
    R01_MOCK_PIPELINE: mockPipelineByTarget.R01 ?? null,
    R02_MOCK_PIPELINE: mockPipelineByTarget.R02 ?? null,
    R03_MOCK_PIPELINE: mockPipelineByTarget.R03 ?? null,
    discardedLegacyTargets: ["T01", "T07", "T09"],
    MULTI_DOCUMENT_POLICY: "AMBIGUOUS",
    COORDINATE_SELECTION_USED: "NO",
    PROXIMITY_USED: "NO",
    ROAD_BUILDING_NUMBER_FALLBACK_USED: "NO",
    networkRequestCount: 0,
    credentialUsed: "NO",
    calibrationAnchor: CALIBRATION_ANCHOR_ID,
    calibrationIncludedInPilotMetrics: "NO",
    parcelResolverStatus: "KAKAO_MOCK_ADAPTER",
    parcelResolverInterface: "ParcelResolver.resolve(roadAddress)",
    localTestResults: localTests.results.map((r) => ({
      file: r.file,
      pass: r.pass ? "PASS" : "FAIL",
    })),
    targets,
    productionWired: "NO",
    PRODUCTION_CODE_CHANGED: "NO",
    DB_CHANGED: "NO",
    DEPENDENCY_INSTALLED: "NO",
    GIT_CHANGE: "NO",
    SAFE_TO_RUN_TRACK_A_FULL_PILOT: "NO",
    nextRequiredGate: "REPLACEMENT_FULL_PILOT_NETWORK_APPROVAL",
  };

  console.log(JSON.stringify(out, null, 2));
  if (!localTests.pass) process.exit(1);
}

main().catch(() => process.exit(1));
