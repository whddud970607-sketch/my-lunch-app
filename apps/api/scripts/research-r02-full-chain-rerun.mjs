/**
 * R02 FULL CHAIN RE-RUN — frozen parcel, no Kakao.
 * BuildingHUB max 2 (transient retry), VWorld max 1. NETWORK budget = 3.
 */
import path from "path";
import { fileURLToPath } from "url";
import { classifyBuildingHubResponse } from "./lib/building-hub-client.mjs";
import { getTrackATarget } from "./lib/track-a-manifest.mjs";
import { runTrackAPipeline } from "./lib/track-a-pipeline.mjs";
import {
  createLiveBuildingHubFetcher,
  createLiveVworldFetcher,
} from "./lib/track-a-live-fetchers.mjs";
import {
  createNetworkBudgetTracker,
  loadResearchEnv,
  pickCredential,
} from "./lib/research-env.mjs";
import { classifyTargetStages } from "./lib/track-a-target-report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env");
const TOTAL_NETWORK_BUDGET = 3;

const R02_FROZEN_PARCEL = {
  sigunguCd: "28200",
  bjdongCd: "11000",
  platGbCd: "0",
  bun: "0751",
  ji: "0001",
  provenance: "FROZEN_PARCEL_R02_RERUN",
};

const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function isTransientHubResponse(httpStatus, body) {
  if (httpStatus === 0 || TRANSIENT_HTTP_STATUSES.has(httpStatus)) return true;
  const classified = classifyBuildingHubResponse(httpStatus, body);
  return classified.kind === "HTTP_ERROR" && httpStatus >= 500;
}

function createRetryBuildingHubFetcher(serviceKey, fetchFn = fetch) {
  const base = createLiveBuildingHubFetcher(serviceKey, fetchFn);
  let callCount = 0;

  return async function fetchBuildingHubPageWithRetry(parcel, pageNo) {
    callCount += 1;
    const first = await base(parcel, pageNo);
    if (pageNo === 1 && callCount === 1 && isTransientHubResponse(first.httpStatus, first.body)) {
      callCount += 1;
      return base(parcel, pageNo);
    }
    return first;
  };
}

function sanitizeR02Report(result) {
  const stages = classifyTargetStages(result);
  const match = result.identity?.matches?.[0] ?? null;
  const sanitizedRegisterRows = (result.hubPages?.items ?? []).map((item) => ({
    dongNm: item.dongNm ?? null,
    bldNm: item.bldNm ?? null,
    normalizedBldNm: item.bldNm ? String(item.bldNm).replace(/\s+/g, "").trim() : null,
  }));
  const aRows = sanitizedRegisterRows.filter(
    (r) => r.dongNm === "A" || r.dongNm === "A동",
  );
  return {
    R02_BUILDING_HUB_FETCH: result.hubPages?.ok === false ? "FAIL" : "PASS",
    R02_DONG_MATCH: result.identity?.dongMatch ?? null,
    R02_COMPLEX_MATCH_STATUS: result.identity?.complexNameMatch ?? null,
    R02_IDENTITY_VERIFIED: result.identity?.identityVerified === true ? "YES" : "NO",
    R02_VWORLD_FEATURE_COUNT: result.featureCount ?? 0,
    R02_GEOMETRY_VERIFIED: stages.BUILDING_GEOMETRY_VERIFIED,
    R02_BUILDING_CENTER_VERIFIED: stages.BUILDING_CENTER_VERIFIED,
    R02_PIN_PROVENANCE: result.buildingCenter?.selectedMethod ?? "NONE",
    R02_FAILURE_REASON: stages.FAILURE_REASON,
    FULL_CHAIN_MATCHER_BLDNM: match?.bldNm ?? null,
    FULL_CHAIN_NORMALIZED_BLDNM: match?.normalizedBldNm ?? null,
    sanitizedRegisterRows,
    R02_A_DONG_ROW_COUNT: aRows.length,
    R02_A_DONG_BLDNM_VALUES: [...new Set(aRows.map((r) => r.bldNm).filter(Boolean))],
    identityProvenance: match?.complexMatchDetail ?? null,
    pnu: result.pnuResult?.ok ? result.pnuResult.pnu : null,
    buildingCenter: result.buildingCenter?.buildingCenter ?? null,
    pipelineBlockedAt: result.pipelineBlockedAt ?? null,
    terminal: result.terminal ?? null,
  };
}

async function main() {
  const env = loadResearchEnv(ENV_PATH);
  const dataGoKey = pickCredential(env, [
    "DATA_GO_KR_SERVICE_KEY",
    "PUBLIC_DATA_SERVICE_KEY",
    "BUILDING_REGISTER_SERVICE_KEY",
    "SERVICE_KEY",
  ]);
  const vworldKey = pickCredential(env, ["VWORLD_API_KEY", "VWORLD_KEY", "VWORLD_DEV_KEY"]);

  const target = getTrackATarget("R02");
  const out = {
    gate: "R02_FULL_CHAIN_RERUN",
    mode: "LIVE_NETWORK_LIMITED",
    authorizedTarget: "R02",
    frozenParcel: R02_FROZEN_PARCEL,
    KAKAO_REQUEST_COUNT: 0,
    BUILDING_HUB_REQUEST_COUNT: 0,
    VWORLD_REQUEST_COUNT: 0,
    TOTAL_NETWORK_REQUEST_COUNT: 0,
    TOTAL_NETWORK_BUDGET: TOTAL_NETWORK_BUDGET,
    PROXIMITY_USED: "NO",
    NEAREST_BUILDING_USED: "NO",
    BBOX_IDENTITY_USED: "NO",
    FUZZY_MATCH_USED: "NO",
    SUBSTRING_MATCH_USED: "NO",
    GROUND_TRUTH_MUTATED: "NO",
    MANIFEST_MUTATED: "NO",
    PRODUCTION_CHANGE: "NO",
    DATABASE_CHANGE: "NO",
    DEPENDENCY_INSTALL: "NO",
    ENV_CHANGE: "NO",
    GIT_COMMIT_PUSH: "NO",
  };

  if (!dataGoKey || !vworldKey || !target) {
    out.error = "REQUIRED_CREDENTIALS_OR_TARGET_MISSING";
    out.R02_FULL_CHAIN = "FAIL";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const budget = createNetworkBudgetTracker(TOTAL_NETWORK_BUDGET);
  const result = await runTrackAPipeline(target, {
    frozenParcel: R02_FROZEN_PARCEL,
    fetchBuildingHubPage: createRetryBuildingHubFetcher(dataGoKey),
    fetchVworldGetFeature: createLiveVworldFetcher(vworldKey),
    maxBuildingHubPages: 2,
    budget,
  });

  out.KAKAO_REQUEST_COUNT = result.counters?.kakaoRequests ?? 0;
  out.BUILDING_HUB_REQUEST_COUNT = result.counters?.buildingHubRequests ?? 0;
  out.VWORLD_REQUEST_COUNT = result.counters?.vworldRequests ?? 0;
  out.TOTAL_NETWORK_REQUEST_COUNT =
    out.KAKAO_REQUEST_COUNT + out.BUILDING_HUB_REQUEST_COUNT + out.VWORLD_REQUEST_COUNT;

  Object.assign(out, sanitizeR02Report(result));

  out.R02_FULL_CHAIN =
    out.R02_BUILDING_CENTER_VERIFIED === "YES" && out.R02_IDENTITY_VERIFIED === "YES"
      ? "PASS"
      : "FAIL";

  const priorR01 = "PASS";
  const priorR03 = "PASS";
  const r02Pass = out.R02_FULL_CHAIN === "PASS";
  const verifiedCount = (priorR01 === "PASS" ? 1 : 0) + (r02Pass ? 1 : 0) + (priorR03 === "PASS" ? 1 : 0);
  out.TRACK_A_FINAL_RESULT = `${verifiedCount}/3`;
  out.BUILDING_RESOLUTION_GENERALIZATION =
    verifiedCount === 3 ? "SUPPORTED" : verifiedCount === 2 ? "PARTIAL" : "NOT_SUPPORTED";
  out.NEXT_REQUIRED_ACTION =
    verifiedCount === 3 ? "TRACK_B_IDENTITY_GATE" : "ANALYZE_R02_FULL_CHAIN_FAILURE";

  out.priorPilotBaseline = {
    R01_BUILDING_CENTER: "PASS",
    R03_BUILDING_CENTER: "PASS",
    note: "R01/R03 from TRACK_A_REPLACEMENT_FULL_PILOT; R02 from this rerun only",
  };

  console.log(JSON.stringify(out, null, 2));

  if (out.R02_FULL_CHAIN === "FAIL") {
    process.exit(1);
  }
}

main().catch(() => process.exit(1));
