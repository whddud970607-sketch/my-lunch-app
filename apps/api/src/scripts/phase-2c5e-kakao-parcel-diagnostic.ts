/**
 * PHASE_2C.5E — one Kakao address.json parcel diagnostic for R01.
 *
 * KAKAO_ADDRESS_JSON_CALL_LIMIT = 1
 * No BuildingHUB / VWorld / Naver / keyword / worker / DB writes.
 * Prints equality flags only — never addresses, payloads, or credentials.
 *
 * Compile: npm run build
 * Run:     node dist/scripts/phase-2c5e-kakao-parcel-diagnostic.js
 */
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import {
  createLiveKakaoParcelResolver,
  isKakaoParcelConfigured,
} from "../address/adapters/kakao-parcel.adapter";
import { TRACK_A_KAKAO_PARCEL_FIXTURES } from "../address/fixtures/kakao-parcel-track-a-fixtures";
import { TRACK_A_PIPELINE_FIXTURES } from "../address/fixtures/track-a-production-fixtures";
import { buildPnu } from "../address/building/pnu-builder";
import { ParcelResolverStatus } from "../address/building/parcel-resolver.port";

const STAGING_REF = "rjfkavkrqzdihyhmlhur";
const R01_ROAD = "인천광역시 남동구 서창남순환로 55" as const;

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

  const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  if (supabaseUrl) {
    try {
      const ref = new URL(supabaseUrl).host.split(".")[0] || "";
      if (ref && ref !== STAGING_REF) fail("NOT_STAGING_TARGET");
    } catch {
      /* ignore */
    }
  }

  const app = await NestFactory.createApplicationContext(DiagnosticModule, {
    logger: false,
  });

  let kakaoCalls = 0;
  try {
    const config = app.get(ConfigService);
    if (!isKakaoParcelConfigured(config)) fail("KAKAO_NOT_CONFIGURED");
    const apiKey = config.get<string>("KAKAO_REST_API_KEY")!.trim();

    const frozen = TRACK_A_KAKAO_PARCEL_FIXTURES[R01_ROAD].expectedParcel;
    const frozenPnu = buildPnu(frozen);

    let documentCount: number | null = null;

    const countingFetch: typeof fetch = async (input, init) => {
      kakaoCalls += 1;
      if (kakaoCalls > 1) fail("KAKAO_ADDRESS_JSON_CALL_LIMIT");
      // Never log URL (query may contain road address) or Authorization.
      const res = await fetch(input, init);
      const clone = res.clone();
      try {
        const body = (await clone.json()) as { documents?: unknown } | null;
        documentCount = Array.isArray(body?.documents) ? body.documents.length : 0;
      } catch {
        documentCount = null;
      }
      return res;
    };

    const resolver = createLiveKakaoParcelResolver(apiKey, countingFetch);
    console.log(`PHASE_2C_5E_KAKAO_PARCEL_DIAGNOSTIC =`);
    console.log(`PRODUCTION_PARCEL_PATH_USED = YES`);
    console.log(`SECOND_PARCEL_PARSER_CREATED = NO`);

    const road = TRACK_A_PIPELINE_FIXTURES.R01.roadAddress;
    const result = await resolver.resolve(road);

    if (kakaoCalls !== 1) fail(`UNEXPECTED_KAKAO_CALLS_${kakaoCalls}`);

    console.log(`KAKAO_ADDRESS_JSON_CALLS = ${kakaoCalls}`);
    console.log(`BUILDING_HUB_CALLS = 0`);
    console.log(`VWORLD_CALLS = 0`);
    console.log(`NAVER_CALLS = 0`);

    console.log(
      `KAKAO_DOCUMENT_COUNT = ${documentCount == null ? "UNKNOWN" : String(documentCount)}`,
    );
    console.log(`PARCEL_RESOLUTION_STATUS = ${result.status}`);

    if (result.status !== ParcelResolverStatus.RESOLVED || !result.parcel) {
      console.log(`SIGUNGU_CD_MATCH = N/A`);
      console.log(`BJDONG_CD_MATCH = N/A`);
      console.log(`PLAT_GB_CD_MATCH = N/A`);
      console.log(`BUN_MATCH = N/A`);
      console.log(`JI_MATCH = N/A`);
      console.log(`PNU_MATCH = N/A`);
      console.log(`PARCEL_DIVERGENCE_PROVEN = N/A`);
      console.log(`DIFFERING_FIELD_CATEGORIES = NONE`);
      console.log(`ROOT_CAUSE_CLASSIFICATION = OTHER`);
      console.log(`EXACT_ROOT_CAUSE_PROVEN = NO`);
      console.log(`STAGING_DB_CHANGED = NO`);
      console.log(`PRODUCTION_DB_CHANGED = NO`);
      console.log(`TRACK_A_RULES_CHANGED = NO`);
      console.log(`PARCEL_SELECTION_CHANGED = NO`);
      console.log(`BUILDING_HUB_MATCHER_CHANGED = NO`);
      console.log(`MODEL_B_CHANGED = NO`);
      console.log(`PII_LOGGED = NO`);
      console.log(`CREDENTIALS_LOGGED = NO`);
      console.log(`GIT_COMMIT_PUSH = NO`);
      console.log(`SAFE_TO_FIX_ROOT_CAUSE = NO`);
      console.log(`SAFE_TO_RERUN_PROVIDER_SMOKE = NO`);
      fail("PARCEL_NOT_RESOLVED");
    }

    const live = result.parcel;
    const sigungu = live.sigunguCd === frozen.sigunguCd;
    const bjdong = live.bjdongCd === frozen.bjdongCd;
    const plat = live.platGbCd === frozen.platGbCd;
    const bun = live.bun === frozen.bun;
    const ji = live.ji === frozen.ji;

    const livePnu = buildPnu(live);
    const pnuMatch =
      frozenPnu.ok && livePnu.ok && frozenPnu.pnu === livePnu.pnu;

    console.log(`SIGUNGU_CD_MATCH = ${yn(sigungu)}`);
    console.log(`BJDONG_CD_MATCH = ${yn(bjdong)}`);
    console.log(`PLAT_GB_CD_MATCH = ${yn(plat)}`);
    console.log(`BUN_MATCH = ${yn(bun)}`);
    console.log(`JI_MATCH = ${yn(ji)}`);
    console.log(`PNU_MATCH = ${yn(Boolean(pnuMatch))}`);

    const differing: string[] = [];
    if (!sigungu) differing.push("sigunguCd");
    if (!bjdong) differing.push("bjdongCd");
    if (!plat) differing.push("platGbCd");
    if (!bun) differing.push("bun");
    if (!ji) differing.push("ji");
    if (!pnuMatch) differing.push("pnu");

    const divergence = differing.length > 0;
    console.log(`PARCEL_DIVERGENCE_PROVEN = ${yn(divergence)}`);
    console.log(
      `DIFFERING_FIELD_CATEGORIES = ${
        differing.length ? differing.join(",") : "NONE"
      }`,
    );

    // Production mapper + single document → live parcel. Divergence means
    // Kakao structured identity ≠ frozen Track A, not a second parser.
    // Exact authority (provider vs design gap) is not proven without values.
    let classification: string;
    let exactProven: boolean;
    if (!divergence) {
      classification = "OTHER";
      exactProven = true; // hypothesis LIVE!=FROZEN disproven
    } else if (documentCount === 1) {
      classification = "KAKAO_PROVIDER_DATA_DIVERGENCE";
      exactProven = false;
    } else {
      classification = "OTHER";
      exactProven = false;
    }

    console.log(`ROOT_CAUSE_CLASSIFICATION = ${classification}`);
    console.log(`EXACT_ROOT_CAUSE_PROVEN = ${yn(exactProven)}`);
    console.log(`STAGING_DB_CHANGED = NO`);
    console.log(`PRODUCTION_DB_CHANGED = NO`);
    console.log(`TRACK_A_RULES_CHANGED = NO`);
    console.log(`PARCEL_SELECTION_CHANGED = NO`);
    console.log(`BUILDING_HUB_MATCHER_CHANGED = NO`);
    console.log(`MODEL_B_CHANGED = NO`);
    console.log(`PII_LOGGED = NO`);
    console.log(`CREDENTIALS_LOGGED = NO`);
    console.log(`GIT_COMMIT_PUSH = NO`);
    // Divergence proven ⇒ next step is design a fix; do not implement here.
    console.log(`SAFE_TO_FIX_ROOT_CAUSE = ${divergence ? "YES" : "NO"}`);
    console.log(`SAFE_TO_RERUN_PROVIDER_SMOKE = NO`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(`DIAG_FAILED = ${err instanceof Error ? err.name : "error"}`);
  process.exit(1);
});
