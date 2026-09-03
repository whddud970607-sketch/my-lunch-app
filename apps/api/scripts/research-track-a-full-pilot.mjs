/**
 * TRACK A Replacement Full Pilot — live PUBLIC data pipeline for R01/R02/R03.
 * Never prints credentials, Authorization headers, .env, or raw API responses.
 */
import path from "path";
import { fileURLToPath } from "url";
import { createLiveKakaoAddressParcelAdapter } from "./lib/kakao-address-parcel.adapter.mjs";
import { runTrackAPipeline } from "./lib/track-a-pipeline.mjs";
import { TRACK_A_TARGETS } from "./lib/track-a-manifest.mjs";
import {
  BUILDING_HUB_OPERATIONAL_MAX_PAGES_PER_TARGET,
  TRACK_A_TOTAL_NETWORK_BUDGET,
} from "./lib/track-a-network-budget.mjs";
import {
  createLiveBuildingHubFetcher,
  createLiveVworldFetcher,
} from "./lib/track-a-live-fetchers.mjs";
import {
  credentialPresence,
  createNetworkBudgetTracker,
  loadResearchEnv,
  pickCredential,
} from "./lib/research-env.mjs";
import {
  classifyTrackAPilotVerdict,
  flattenTargetReportForFinal,
  sanitizeTargetReport,
} from "./lib/track-a-target-report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env");

async function main() {
  const env = loadResearchEnv(ENV_PATH);
  const presence = credentialPresence(env);

  const kakaoKey = pickCredential(env, ["KAKAO_REST_API_KEY"]);
  const dataGoKey = pickCredential(env, [
    "DATA_GO_KR_SERVICE_KEY",
    "PUBLIC_DATA_SERVICE_KEY",
    "BUILDING_REGISTER_SERVICE_KEY",
    "SERVICE_KEY",
  ]);
  const vworldKey = pickCredential(env, ["VWORLD_API_KEY", "VWORLD_KEY", "VWORLD_DEV_KEY"]);

  const out = {
    gate: "TRACK_A_REPLACEMENT_FULL_PILOT",
    mode: "LIVE_NETWORK",
    credentialPresence: presence,
    authorizedTargets: ["R01", "R02", "R03"],
    FROZEN_GROUND_TRUTH_MUTATED: "NO",
    FUZZY_DONG_MATCH_USED: "NO",
    NETWORK_BUDGET_EXCEEDED: "NO",
    PROXIMITY_USED: "NO",
    NEAREST_BUILDING_USED: "NO",
    BBOX_IDENTITY_USED: "NO",
    ROAD_BUILDING_NUMBER_FALLBACK_USED: "NO",
    BUILDING_ENTRANCE_VERIFIED: "NO",
    VEHICLE_ACCESS_POINT_VERIFIED: "NO",
    PRODUCTION_CODE_CHANGE: "NO",
    DATABASE_CHANGE: "NO",
    DEPENDENCY_INSTALL: "NO",
    ENV_CHANGE: "NO",
    GIT_COMMIT_PUSH: "NO",
    KAKAO_REQUEST_COUNT: 0,
    BUILDING_HUB_REQUEST_COUNT: 0,
    VWORLD_REQUEST_COUNT: 0,
    TOTAL_NETWORK_REQUEST_COUNT: 0,
    TOTAL_NETWORK_REQUEST_BUDGET: TRACK_A_TOTAL_NETWORK_BUDGET,
    targets: [],
  };

  if (!kakaoKey || !dataGoKey || !vworldKey) {
    out.error = "REQUIRED_CREDENTIALS_NOT_CONFIGURED";
    out.TRACK_A_FULL_PILOT = "FAIL";
    out.BUILDING_RESOLUTION_GENERALIZATION = "NOT_SUPPORTED";
    out.NEXT_REQUIRED_ACTION = "CONFIGURE_RESEARCH_CREDENTIALS";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const budget = createNetworkBudgetTracker(TRACK_A_TOTAL_NETWORK_BUDGET);
  const parcelResolver = createLiveKakaoAddressParcelAdapter({ apiKey: kakaoKey });
  const fetchBuildingHubPage = createLiveBuildingHubFetcher(dataGoKey);
  const fetchVworldGetFeature = createLiveVworldFetcher(vworldKey);

  const sanitizedReports = [];

  for (const target of TRACK_A_TARGETS) {
    const result = await runTrackAPipeline(target, {
      parcelResolver,
      fetchBuildingHubPage,
      fetchVworldGetFeature,
      maxBuildingHubPages: BUILDING_HUB_OPERATIONAL_MAX_PAGES_PER_TARGET,
      budget,
    });

    out.KAKAO_REQUEST_COUNT += result.counters?.kakaoRequests ?? 0;
    out.BUILDING_HUB_REQUEST_COUNT += result.counters?.buildingHubRequests ?? 0;
    out.VWORLD_REQUEST_COUNT += result.counters?.vworldRequests ?? 0;

    if (result.networkBudgetExceeded === "YES") {
      out.NETWORK_BUDGET_EXCEEDED = "YES";
    }

    const sanitized = sanitizeTargetReport(result);
    sanitizedReports.push(sanitized);
    out.targets.push(sanitized);
    Object.assign(out, flattenTargetReportForFinal(sanitized));
  }

  out.TOTAL_NETWORK_REQUEST_COUNT =
    out.KAKAO_REQUEST_COUNT + out.BUILDING_HUB_REQUEST_COUNT + out.VWORLD_REQUEST_COUNT;

  if (out.TOTAL_NETWORK_REQUEST_COUNT > TRACK_A_TOTAL_NETWORK_BUDGET) {
    out.NETWORK_BUDGET_EXCEEDED = "YES";
  }

  const verdict = classifyTrackAPilotVerdict(sanitizedReports);
  Object.assign(out, verdict);
  out.TRACK_A_REPLACEMENT_FULL_PILOT = out.TRACK_A_FULL_PILOT;

  console.log(JSON.stringify(out, null, 2));

  if (out.TRACK_A_REPLACEMENT_FULL_PILOT === "FAIL" || out.NETWORK_BUDGET_EXCEEDED === "YES") {
    process.exit(1);
  }
}

main().catch(() => process.exit(1));
