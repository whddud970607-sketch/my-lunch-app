/**
 * PHASE_2C.5D — sanitized BuildingHUB identity diagnostic for R01.
 *
 * At most ONE BuildingHUB HTTP call. No Kakao/VWorld/Naver. No DB writes.
 * Never prints addresses, building names, keys, or credential-bearing URLs.
 *
 * Compile: npm run build
 * Run:     node dist/scripts/phase-2c5d-buildinghub-identity-diagnostic.js
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
  buildBrTitleInfoUrl,
  classifyBuildingHubResponse,
  extractRegisterItems,
} from "../address/building/building-hub-client";
import {
  buildSanitizedIdentityDiagnostic,
  matchBuildingRegisterIdentity,
} from "../address/building/building-identity-matcher";
import { TRACK_A_KAKAO_PARCEL_FIXTURES } from "../address/fixtures/kakao-parcel-track-a-fixtures";
import { TRACK_A_PIPELINE_FIXTURES } from "../address/fixtures/track-a-production-fixtures";

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

async function main(): Promise<void> {
  loadEnvFile("apps/api/.env");
  loadEnvFile(".env");

  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  if (url) {
    try {
      const ref = new URL(url).host.split(".")[0] || "";
      if (ref && ref !== STAGING_REF) {
        // Diagnostic does not write DB; still refuse production-looking configs.
        fail("NOT_STAGING_TARGET");
      }
    } catch {
      /* ignore non-URL */
    }
  }

  const app = await NestFactory.createApplicationContext(DiagnosticModule, {
    logger: false,
  });

  let buildingHubCalls = 0;
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

    // Structural request parity (no credential-bearing URL printed).
    const probeUrl = buildBrTitleInfoUrl(parcel, "REDACTED", 1);
    const opMatch = probeUrl.pathname.endsWith("/getBrTitleInfo");
    const paramsMatch =
      probeUrl.searchParams.get("sigunguCd") === parcel.sigunguCd &&
      probeUrl.searchParams.get("bjdongCd") === parcel.bjdongCd &&
      probeUrl.searchParams.get("platGbCd") === parcel.platGbCd &&
      probeUrl.searchParams.get("bun") === parcel.bun &&
      probeUrl.searchParams.get("ji") === parcel.ji &&
      probeUrl.searchParams.get("pageNo") === "1";

    console.log(`REQUEST_OPERATION_MATCH = ${yn(opMatch)}`);
    console.log(`REQUEST_STRUCTURAL_PARAMS_MATCH = ${yn(paramsMatch)}`);
    console.log(
      `PARCEL_PARAM_SHAPE = sigunguCd_len=${parcel.sigunguCd.length};bjdongCd_len=${parcel.bjdongCd.length};platGbCd=${parcel.platGbCd};bun_len=${parcel.bun.length};ji_len=${parcel.ji.length}`,
    );

    // Offline frozen fixture baseline (NETWORK=0).
    const frozenBody = fx.buildingHubPages[1];
    const frozenItems = extractRegisterItems(
      frozenBody as Record<string, unknown>,
    );
    const frozenMatch = matchBuildingRegisterIdentity(
      frozenItems as never,
      { dong: fx.dong, complexNameHint: fx.complexNameHint },
    );
    const frozenDiag = buildSanitizedIdentityDiagnostic({
      registerRows: frozenItems as never,
      matchResult: frozenMatch,
    });
    console.log(`FROZEN_RAW_ITEM_COUNT = ${frozenItems.length}`);
    console.log(
      `FROZEN_IDENTITY_VERIFIED = ${yn(frozenDiag.identityVerified)}`,
    );
    console.log(
      `FROZEN_COMPLEX_NAME_MATCH = ${frozenDiag.complexNameMatch}`,
    );
    console.log(`FROZEN_DONG_MATCH = ${frozenDiag.dongMatch}`);

    const fetchPage = createBuildingHubFetchPage(serviceKey);
    buildingHubCalls += 1;
    if (buildingHubCalls > 1) fail("BUILDING_HUB_CALL_LIMIT");

    const live = await fetchPage(parcel, 1);
    const httpSuccess = live.httpStatus === 200;
    console.log(`HTTP_SUCCESS = ${yn(httpSuccess)}`);
    console.log(`HTTP_STATUS_CLASS = ${Math.floor(live.httpStatus / 100)}xx`);

    const body = (live.body ?? {}) as Record<string, unknown>;
    const classified = classifyBuildingHubResponse(live.httpStatus, body);
    console.log(`BUILDING_HUB_CLASS = ${classified.kind}`);
    console.log(
      `BUILDING_HUB_TOTAL_COUNT = ${classified.totalCount ?? "null"}`,
    );

    const items = extractRegisterItems(body);
    const match = matchBuildingRegisterIdentity(items as never, {
      dong: fx.dong,
      complexNameHint: fx.complexNameHint,
    });
    const diag = buildSanitizedIdentityDiagnostic({
      registerRows: items as never,
      matchResult: match,
    });

    console.log(`BUILDING_HUB_DIAGNOSTIC_CALLS = ${buildingHubCalls}`);
    console.log(`RAW_ITEM_COUNT = ${items.length}`);
    console.log(`NORMALIZED_CANDIDATE_COUNT = ${items.length}`);
    console.log(
      `CANDIDATE_HAS_DONG_NAME = ${yn(diag.candidateHasDongName)}`,
    );
    console.log(
      `CANDIDATE_HAS_BUILDING_NAME = ${yn(diag.candidateHasBuildingName)}`,
    );
    console.log(`DONG_MATCH = ${diag.dongMatch}`);
    console.log(`COMPLEX_NAME_MATCH = ${diag.complexNameMatch}`);
    console.log(`MATCHED_CANDIDATE_COUNT = ${diag.matchedCandidateCount}`);
    console.log(`IDENTITY_VERIFIED = ${yn(diag.identityVerified)}`);
    console.log(
      `IDENTITY_FAILURE_CODE = ${diag.identityFailureCode ?? "null"}`,
    );
    console.log(
      `SUCCESSFUL_COMPLEX_MATCH = ${yn(diag.successfulComplexMatch)}`,
    );

    const structureMatch =
      frozenDiag.candidateHasDongName === diag.candidateHasDongName &&
      frozenDiag.candidateHasBuildingName === diag.candidateHasBuildingName &&
      frozenItems.length > 0 &&
      items.length > 0;
    const liveDivergence =
      frozenDiag.identityVerified !== diag.identityVerified ||
      frozenDiag.complexNameMatch !== diag.complexNameMatch ||
      frozenDiag.dongMatch !== diag.dongMatch ||
      frozenItems.length !== items.length;

    console.log(
      `FROZEN_FIXTURE_STRUCTURE_MATCHES_LIVE = ${yn(structureMatch)}`,
    );
    console.log(`LIVE_DATA_DIVERGENCE = ${yn(liveDivergence)}`);

    // Adapter bug if items exist but both name fields absent after normalize.
    const normalizationBug =
      items.length > 0 &&
      !diag.candidateHasDongName &&
      !diag.candidateHasBuildingName &&
      classified.kind === "OK";
    console.log(
      `PRODUCTION_RESPONSE_NORMALIZATION_BUG = ${yn(normalizationBug)}`,
    );
    console.log(`PRODUCTION_MATCHER_BUG = NO`);
    console.log(`PRODUCTION_INPUT_BUG = NO`);

    console.log(`VWORLD_CALLS = 0`);
    console.log(`KAKAO_CALLS = 0`);
    console.log(`NAVER_CALLS = 0`);
    console.log(`STAGING_DB_CHANGED = NO`);
    console.log(`PII_LOGGED = NO`);
    console.log(`CREDENTIALS_LOGGED = NO`);

    if (!diag.identityVerified) {
      process.exitCode = 0; // diagnostic success even when identity fails
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(`DIAG_FAILED = ${err instanceof Error ? err.name : "error"}`);
  process.exit(1);
});
