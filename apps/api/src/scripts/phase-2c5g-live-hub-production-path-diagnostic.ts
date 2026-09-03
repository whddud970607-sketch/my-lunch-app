/**
 * PHASE_2C.5G — live BuildingHUB through REAL production response path.
 *
 * BUILDING_HUB_CALL_LIMIT = 1 (maxPages: 1 — no page-2 follow).
 * Uses frozen R01 parcel (2C.5E proven). No Kakao / VWorld / Naver / worker / DB.
 *
 * Production path (same as worker stage):
 *   createBuildingHubFetchPage
 *   → fetchAllRegisterPages (classify → extractRegisterItems → normalize)
 *   → null filter
 *   → matchBuildingRegisterIdentity
 *
 * Compile: npm run build
 * Run:     node dist/scripts/phase-2c5g-live-hub-production-path-diagnostic.js
 */
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  createBuildingHubFetchPage,
  getBuildingHubServiceKey,
  isBuildingHubConfigured,
} from "../address/adapters/building-hub.adapter";
import {
  fetchAllRegisterPages,
  paginationPlan,
  DEFAULT_PAGE_SIZE,
  type FetchPageResult,
} from "../address/building/building-hub-client";
import {
  buildSanitizedIdentityDiagnostic,
  matchBuildingRegisterIdentity,
} from "../address/building/building-identity-matcher";
import { TRACK_A_KAKAO_PARCEL_FIXTURES } from "../address/fixtures/kakao-parcel-track-a-fixtures";
import { TRACK_A_PIPELINE_FIXTURES } from "../address/fixtures/track-a-production-fixtures";
import type { RegisterRow } from "../address/building/building-resolution.types";

const STAGING_REF = "rjfkavkrqzdihyhmlhur";
const ROAD_KEY = "인천광역시 남동구 서창남순환로 55" as const;

function yn(v: boolean): "YES" | "NO" {
  return v ? "YES" : "NO";
}

function fail(code: string): never {
  console.error(`DIAG_STOP = ${code}`);
  process.exit(2);
}

function loadEnvFile(filePath: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key] != null && process.env[key] !== "") continue;
    let v = m[2] ?? "";
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[key] = v;
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "apps/api/.env"],
    }),
  ],
})
class DiagnosticModule {}

type PathOutcome = {
  httpSuccess: boolean;
  pageClassification: string;
  pageCount: number | null;
  totalCount: number | null;
  requiredPages: number | null;
  additionalPageRequired: boolean;
  fetchOk: boolean;
  budgetExceeded: boolean;
  rawItemCount: number;
  extractedItemCount: number;
  normalizedCandidateCount: number;
  filteredCandidateCount: number;
  matchedCandidateCount: number;
  candidateHasDongName: boolean;
  candidateHasBuildingName: boolean;
  dongMatch: string;
  complexNameMatch: string;
  identityVerified: boolean;
  identityFailureCode: string | null;
  fetchKind: string;
};

/**
 * Exact worker-stage Hub identity segment (no VWorld).
 * Relies on fetchAllRegisterPages for classify/extract/normalize —
 * never extracts from raw body outside that function.
 */
async function runProductionHubIdentityPath(args: {
  fetchPage: (pageNo: number) => Promise<FetchPageResult>;
  dong: string;
  complexNameHint: string;
  maxPages: number;
}): Promise<PathOutcome> {
  const hubPages = await fetchAllRegisterPages(args.fetchPage, {
    maxPages: args.maxPages,
  });

  const budgetExceeded = !hubPages.ok && hubPages.kind === "BUDGET_EXCEEDED";
  const requiredPages =
    !hubPages.ok && "requiredPages" in hubPages
      ? (hubPages.requiredPages as number | null)
      : hubPages.ok
        ? (hubPages.pageCount ?? null)
        : null;
  const totalCount =
    "totalCount" in hubPages ? (hubPages.totalCount as number | null) : null;
  const additionalPageRequired =
    budgetExceeded ||
    (typeof requiredPages === "number" && requiredPages > args.maxPages) ||
    (typeof totalCount === "number" &&
      paginationPlan(totalCount, DEFAULT_PAGE_SIZE).pageCount > args.maxPages);

  const items = hubPages.items ?? [];
  const registerRows = items.filter((item) => item != null) as (RegisterRow &
    Record<string, unknown>)[];

  const match = matchBuildingRegisterIdentity(registerRows, {
    dong: args.dong,
    complexNameHint: args.complexNameHint,
  });
  const diag = buildSanitizedIdentityDiagnostic({
    registerRows,
    matchResult: match,
  });

  const pageCount = hubPages.ok
    ? hubPages.pageCount
    : budgetExceeded
      ? args.maxPages
      : "pageNo" in hubPages
        ? (hubPages.pageNo as number)
        : null;

  return {
    httpSuccess: hubPages.kind === "OK" || budgetExceeded,
    pageClassification: hubPages.kind,
    pageCount,
    totalCount,
    requiredPages:
      requiredPages ??
      (totalCount != null
        ? paginationPlan(totalCount, DEFAULT_PAGE_SIZE).pageCount
        : null),
    additionalPageRequired,
    fetchOk: hubPages.ok,
    budgetExceeded,
    rawItemCount: items.length,
    extractedItemCount: items.length,
    normalizedCandidateCount: diag.registerCandidateCount,
    filteredCandidateCount: registerRows.length,
    matchedCandidateCount: diag.matchedCandidateCount,
    candidateHasDongName: diag.candidateHasDongName,
    candidateHasBuildingName: diag.candidateHasBuildingName,
    dongMatch: diag.dongMatch,
    complexNameMatch: diag.complexNameMatch,
    identityVerified: diag.identityVerified,
    identityFailureCode: diag.identityFailureCode,
    fetchKind: hubPages.kind,
  };
}

function printOutcome(prefix: string, o: PathOutcome): void {
  console.log(`${prefix}_HTTP_SUCCESS = ${yn(o.httpSuccess)}`);
  console.log(`${prefix}_PAGE_CLASSIFICATION = ${o.pageClassification}`);
  console.log(`${prefix}_PAGE_COUNT = ${o.pageCount ?? "null"}`);
  console.log(`${prefix}_TOTAL_COUNT = ${o.totalCount ?? "null"}`);
  console.log(`${prefix}_REQUIRED_PAGES = ${o.requiredPages ?? "null"}`);
  console.log(`${prefix}_FETCH_OK = ${yn(o.fetchOk)}`);
  console.log(`${prefix}_BUDGET_EXCEEDED = ${yn(o.budgetExceeded)}`);
  console.log(`${prefix}_RAW_ITEM_COUNT = ${o.rawItemCount}`);
  console.log(`${prefix}_EXTRACTED_ITEM_COUNT = ${o.extractedItemCount}`);
  console.log(
    `${prefix}_NORMALIZED_CANDIDATE_COUNT = ${o.normalizedCandidateCount}`,
  );
  console.log(
    `${prefix}_FILTERED_CANDIDATE_COUNT = ${o.filteredCandidateCount}`,
  );
  console.log(`${prefix}_MATCHED_CANDIDATE_COUNT = ${o.matchedCandidateCount}`);
  console.log(
    `${prefix}_CANDIDATE_HAS_DONG_NAME = ${yn(o.candidateHasDongName)}`,
  );
  console.log(
    `${prefix}_CANDIDATE_HAS_BUILDING_NAME = ${yn(o.candidateHasBuildingName)}`,
  );
  console.log(`${prefix}_DONG_MATCH = ${o.dongMatch}`);
  console.log(`${prefix}_COMPLEX_NAME_MATCH = ${o.complexNameMatch}`);
  console.log(`${prefix}_IDENTITY_VERIFIED = ${yn(o.identityVerified)}`);
  console.log(
    `${prefix}_IDENTITY_FAILURE_CODE = ${o.identityFailureCode ?? "null"}`,
  );
}

function firstDivergence(frozen: PathOutcome, live: PathOutcome): string {
  const checks: Array<[string, unknown, unknown]> = [
    ["PAGE_CLASSIFICATION", frozen.pageClassification, live.pageClassification],
    ["FETCH_OK", frozen.fetchOk, live.fetchOk],
    ["BUDGET_EXCEEDED", frozen.budgetExceeded, live.budgetExceeded],
    ["ADDITIONAL_PAGE_REQUIRED", frozen.additionalPageRequired, live.additionalPageRequired],
    ["RAW_ITEM_COUNT", frozen.rawItemCount, live.rawItemCount],
    ["EXTRACTED_ITEM_COUNT", frozen.extractedItemCount, live.extractedItemCount],
    [
      "NORMALIZED_CANDIDATE_COUNT",
      frozen.normalizedCandidateCount,
      live.normalizedCandidateCount,
    ],
    [
      "FILTERED_CANDIDATE_COUNT",
      frozen.filteredCandidateCount,
      live.filteredCandidateCount,
    ],
    [
      "MATCHED_CANDIDATE_COUNT",
      frozen.matchedCandidateCount,
      live.matchedCandidateCount,
    ],
    [
      "CANDIDATE_HAS_DONG_NAME",
      frozen.candidateHasDongName,
      live.candidateHasDongName,
    ],
    [
      "CANDIDATE_HAS_BUILDING_NAME",
      frozen.candidateHasBuildingName,
      live.candidateHasBuildingName,
    ],
    ["DONG_MATCH", frozen.dongMatch, live.dongMatch],
    ["COMPLEX_NAME_MATCH", frozen.complexNameMatch, live.complexNameMatch],
    ["IDENTITY_VERIFIED", frozen.identityVerified, live.identityVerified],
    [
      "IDENTITY_FAILURE_CODE",
      frozen.identityFailureCode,
      live.identityFailureCode,
    ],
  ];
  for (const [name, a, b] of checks) {
    if (a !== b) return name;
  }
  return "NONE";
}

async function main(): Promise<void> {
  loadEnvFile("apps/api/.env");
  loadEnvFile(".env");

  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  if (url) {
    try {
      const ref = new URL(url).host.split(".")[0] || "";
      if (ref && ref !== STAGING_REF) fail("NOT_STAGING_TARGET");
    } catch {
      /* ignore */
    }
  }

  const app = await NestFactory.createApplicationContext(DiagnosticModule, {
    logger: false,
  });

  let hubCalls = 0;
  try {
    const config = app.get(ConfigService);
    if (!isBuildingHubConfigured(config)) fail("BUILDING_HUB_NOT_CONFIGURED");
    const serviceKey = getBuildingHubServiceKey(config);
    if (!serviceKey) fail("BUILDING_HUB_KEY_MISSING");

    const fx = TRACK_A_PIPELINE_FIXTURES.R01;
    const parcelFx = TRACK_A_KAKAO_PARCEL_FIXTURES[ROAD_KEY].expectedParcel;
    const parcel = {
      sigunguCd: parcelFx.sigunguCd,
      bjdongCd: parcelFx.bjdongCd,
      platGbCd: parcelFx.platGbCd,
      bun: parcelFx.bun,
      ji: parcelFx.ji,
      provenance: "FROZEN_TRACK_A_PARCEL" as const,
    };

    console.log(`PHASE_2C_5G_LIVE_HUB_PATH_DIAGNOSTIC =`);
    console.log(`PRODUCTION_FETCH_ALL_PATH_USED = YES`);
    console.log(`DIRECT_RAW_EXTRACT_BYPASS_USED = NO`);

    // --- A. frozen control through SAME production path (NETWORK=0) ---
    const frozenBody = fx.buildingHubPages[1] as Record<string, unknown>;
    const frozen = await runProductionHubIdentityPath({
      fetchPage: async () => ({ httpStatus: 200, body: frozenBody }),
      dong: fx.dong,
      complexNameHint: fx.complexNameHint,
      maxPages: 1,
    });
    printOutcome("FROZEN", frozen);
    console.log(
      `FROZEN_CONTROL_RESULT = ${frozen.identityVerified ? "IDENTITY_VERIFIED" : "IDENTITY_FAILED"}`,
    );

    // --- B. one live BuildingHUB call through SAME production path ---
    const liveFetchPage = createBuildingHubFetchPage(serviceKey);
    const live = await runProductionHubIdentityPath({
      fetchPage: async (pageNo) => {
        hubCalls += 1;
        if (hubCalls > 1) fail("BUILDING_HUB_CALL_LIMIT");
        if (pageNo !== 1) fail("UNEXPECTED_PAGE_REQUEST");
        const res = await liveFetchPage(parcel, pageNo);
        return {
          httpStatus: res.httpStatus,
          body: (res.body ?? {}) as Record<string, unknown>,
        };
      },
      dong: fx.dong,
      complexNameHint: fx.complexNameHint,
      maxPages: 1,
    });

    if (hubCalls !== 1) fail(`UNEXPECTED_HUB_CALLS_${hubCalls}`);

    console.log(`BUILDING_HUB_CALLS = ${hubCalls}`);
    console.log(`KAKAO_CALLS = 0`);
    console.log(`VWORLD_CALLS = 0`);
    console.log(`NAVER_CALLS = 0`);

    printOutcome("LIVE", live);
    console.log(
      `LIVE_RESULT = ${live.identityVerified ? "IDENTITY_VERIFIED" : "IDENTITY_FAILED"}`,
    );
    console.log(
      `ADDITIONAL_PAGE_REQUIRED = ${yn(live.additionalPageRequired)}`,
    );

    const divergence = firstDivergence(frozen, live);
    console.log(`FIRST_PROVEN_DIVERGENCE = ${divergence}`);

    // Shape fingerprint for offline fixture (booleans/counts only — no names).
    console.log(
      `LIVE_SHAPE_FINGERPRINT = class=${live.pageClassification};items=${live.extractedItemCount};matched=${live.matchedCandidateCount};dong=${live.dongMatch};complex=${live.complexNameMatch};verified=${yn(live.identityVerified)};budget=${yn(live.budgetExceeded)};morePages=${yn(live.additionalPageRequired)};total=${live.totalCount ?? "null"};hasDong=${yn(live.candidateHasDongName)};hasBld=${yn(live.candidateHasBuildingName)}`,
    );

    console.log(`STAGING_DB_CHANGED = NO`);
    console.log(`PRODUCTION_DB_CHANGED = NO`);
    console.log(`PRODUCTION_BEHAVIOR_CHANGED = NO`);
    console.log(`TRACK_A_RULES_CHANGED = NO`);
    console.log(`MODEL_B_CHANGED = NO`);
    console.log(`PII_LOGGED = NO`);
    console.log(`CREDENTIALS_LOGGED = NO`);
    console.log(`GIT_COMMIT_PUSH = NO`);
    console.log(`SAFE_TO_RERUN_PROVIDER_SMOKE = NO`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(`DIAG_FAILED = ${err instanceof Error ? err.name : "error"}`);
  process.exit(1);
});
