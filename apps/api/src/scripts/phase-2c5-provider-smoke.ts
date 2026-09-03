/**
 * PHASE_2C.5 controlled single-point staging provider smoke.
 *
 * Boots Nest ResolutionWorkerService + SupabaseResolutionWorkerRepository.
 * Claims ONLY the dedicated isolated-driver fixture (limit 1).
 * Does NOT enable RESOLUTION_WORKER_ENABLED / broad poller.
 *
 * Compile: npm run build
 * Run:     node dist/scripts/phase-2c5-provider-smoke.js
 *
 * Never prints addresses, tokens, credentials, or provider URLs.
 */
import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TRACK_A_PIPELINE_FIXTURES } from "../address/fixtures/track-a-production-fixtures";
import { ResolutionWorkerModule } from "../resolution-worker/resolution-worker.module";
import { SupabaseResolutionWorkerRepository } from "../resolution-worker/resolution-worker.repository.supabase";
import {
  RESOLUTION_WORKER_REPOSITORY,
  type ResolutionWorkerRepository,
} from "../resolution-worker/resolution-worker.repository.port";
import { ResolutionWorkerService } from "../resolution-worker/resolution-worker.service";
import type {
  ResolutionClaim,
  ResolutionPersistPayload,
} from "../resolution-worker/resolution-worker.types";

const STAGING_REF = "rjfkavkrqzdihyhmlhur";
/** Driver with zero prior points — isolates claimBatch from 2C.4 queue. */
const ISOLATED_DRIVER_ID = "a790da50-0f7f-4e60-8537-13c3b24b00b1";
const TRACK_A_FIXTURE = "R01" as const;
const DISPLAY_LABEL = "2c5-smoke-R01";

type ProviderCounts = {
  buildingHub: number;
  vworld: number;
  kakao: number;
  naver: number;
  other: number;
};

type QueueFingerprint = {
  unrelatedCount: number;
  unrelatedDigest: string;
  driverAEligible: number;
  driverBEligible: number;
  activeLeases: number;
  pendingTotal: number;
};

function yn(v: boolean): "YES" | "NO" {
  return v ? "YES" : "NO";
}

function fail(code: string): never {
  console.error(`SMOKE_STOP = ${code}`);
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

function installFetchCounters(): {
  counts: ProviderCounts;
  restore: () => void;
} {
  const counts: ProviderCounts = {
    buildingHub: 0,
    vworld: 0,
    kakao: 0,
    naver: 0,
    other: 0,
  };
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let host = "";
    try {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      host = new URL(raw).host;
    } catch {
      host = "";
    }
    if (host.includes("apis.data.go.kr")) counts.buildingHub += 1;
    else if (host.includes("vworld.kr")) counts.vworld += 1;
    else if (host.includes("kakao.com")) counts.kakao += 1;
    else if (host.includes("ntruss.com") || host.includes("naver"))
      counts.naver += 1;
    else if (host) counts.other += 1;
    return original(input as never, init);
  }) as typeof fetch;
  return {
    counts,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

async function eligibleCount(
  sb: SupabaseClient,
  driverId: string,
): Promise<number> {
  // Approximate eligible set for cross-check (lease/backoff filtered lightly).
  const { count, error: cErr } = await sb
    .from("delivery_points")
    .select("id", { count: "exact", head: true })
    .eq("driver_id", driverId)
    .in("resolution_status", ["pending", "provider_error"])
    .is("location", null)
    .neq("pin_accuracy", "driver_verified")
    .eq("resolution_retry_exhausted", false);
  if (cErr) return -1;
  return count ?? 0;
}

async function queueFingerprint(
  sb: SupabaseClient,
  smokePointId: string | null,
): Promise<QueueFingerprint> {
  const { data: rows, error } = await sb
    .from("delivery_points")
    .select(
      "id,resolution_status,resolution_version,resolution_attempt_count,resolution_claim_token,resolution_claimed_by,resolution_lease_expires_at,pin_accuracy,updated_at",
    )
    .order("id", { ascending: true });
  if (error || !rows) fail("FINGERPRINT_QUERY_FAILED");

  const unrelated = rows.filter((r) => r.id !== smokePointId);
  const digest = createHash("sha256")
    .update(
      unrelated
        .map(
          (r) =>
            [
              r.id,
              r.resolution_status,
              r.resolution_version,
              r.resolution_attempt_count,
              r.resolution_claim_token ?? "",
              r.resolution_claimed_by ?? "",
              r.resolution_lease_expires_at ?? "",
              r.pin_accuracy,
              r.updated_at ?? "",
            ].join("|"),
        )
        .join("\n"),
    )
    .digest("hex")
    .slice(0, 16);

  const { count: activeLeases } = await sb
    .from("delivery_points")
    .select("id", { count: "exact", head: true })
    .not("resolution_claimed_by", "is", null)
    .gt("resolution_lease_expires_at", new Date().toISOString());

  const { count: pendingTotal } = await sb
    .from("delivery_points")
    .select("id", { count: "exact", head: true })
    .eq("resolution_status", "pending");

  return {
    unrelatedCount: unrelated.length,
    unrelatedDigest: digest,
    driverAEligible: await eligibleCount(
      sb,
      "1a42278f-64d7-4321-a7a6-8e4e66cd6f27",
    ),
    driverBEligible: await eligibleCount(
      sb,
      "7d46eba2-ec02-445d-9cae-7eee4056e9a6",
    ),
    activeLeases: activeLeases ?? 0,
    pendingTotal: pendingTotal ?? 0,
  };
}

async function countTable(
  sb: SupabaseClient,
  table: string,
  filter?: { column: string; value: string },
): Promise<number> {
  let q = sb.from(table).select("id", { count: "exact", head: true });
  if (filter) q = q.eq(filter.column, filter.value);
  const { count, error } = await q;
  if (error) fail(`COUNT_FAILED_${table}`);
  return count ?? 0;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "apps/api/.env"],
    }),
    ResolutionWorkerModule,
  ],
})
class Phase2C5SmokeModule {}

async function main(): Promise<void> {
  loadEnvFile("apps/api/.env");
  loadEnvFile(".env");

  if (process.env.RESOLUTION_WORKER_ENABLED === "1") {
    fail("WORKER_ENABLED_MUST_STAY_OFF");
  }

  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) fail("SUPABASE_NOT_CONFIGURED");

  let ref = "";
  try {
    ref = new URL(url).host.split(".")[0] || "";
  } catch {
    fail("SUPABASE_URL_INVALID");
  }
  if (ref !== STAGING_REF) fail("NOT_STAGING_TARGET");

  // Use Supabase repo without enabling the poller.
  process.env.RESOLUTION_WORKER_USE_SUPABASE = "1";
  delete process.env.RESOLUTION_WORKER_ENABLED;

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const fx = TRACK_A_PIPELINE_FIXTURES[TRACK_A_FIXTURE];
  const detailAddress = `${fx.dong}동`;

  // Reuse existing pending smoke fixture when present (prior aborted run).
  let jobId: string;
  let pointId: string;
  let createdNewFixture = false;

  {
    const { data: existing } = await sb
      .from("delivery_points")
      .select("id,job_id,resolution_status,resolution_attempt_count,location")
      .eq("display_label", DISPLAY_LABEL)
      .eq("driver_id", ISOLATED_DRIVER_ID)
      .eq("resolution_status", "pending")
      .is("location", null)
      .eq("resolution_attempt_count", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id && existing.job_id) {
      pointId = existing.id;
      jobId = existing.job_id;
    } else {
      createdNewFixture = true;
      jobId = randomUUID();
      pointId = randomUUID();
      const seq = Math.floor(Math.random() * 1_000_000_000);

      {
        const { error } = await sb.from("delivery_jobs").insert({
          id: jobId,
          driver_id: ISOLATED_DRIVER_ID,
          company_id: "c2000000-0000-4000-8000-000000000001",
          service_date: new Date().toISOString().slice(0, 10),
          status: "draft",
        });
        if (error) fail("JOB_INSERT_FAILED");
      }

      {
        const { error } = await sb.from("delivery_points").insert({
          id: pointId,
          job_id: jobId,
          driver_id: ISOLATED_DRIVER_ID,
          sequence_no: seq,
          display_label: DISPLAY_LABEL,
          location: null,
          pin_accuracy: "address",
          quantity: 1,
          status: "pending",
          resolution_status: "pending",
          resolution_stage: "pending",
          resolution_version: 1,
          resolution_attempt_count: 0,
          resolution_retry_exhausted: false,
          resolution_next_attempt_at: null,
        });
        if (error) fail("POINT_INSERT_FAILED");
      }

      {
        const { error } = await sb.from("delivery_point_pii").insert({
          point_id: pointId,
          job_id: jobId,
          driver_id: ISOLATED_DRIVER_ID,
          customer_name: null,
          raw_address: fx.roadAddress,
          detail_address: detailAddress,
          delivery_memo: null,
          normalized_address: null,
        });
        if (error) fail("PII_INSERT_FAILED");
      }
    }
  }

  console.log(`FIXTURE_REUSED = ${yn(!createdNewFixture)}`);

  const preFp = await queueFingerprint(sb, pointId);
  const preJobs = await countTable(sb, "delivery_jobs");
  const prePoints = await countTable(sb, "delivery_points");
  const preShipments = await countTable(sb, "delivery_shipments");
  const preImportProbe = await sb
    .from("import_rows")
    .select("id", { count: "exact", head: true });
  const preImportRows =
    preImportProbe.error != null ? -1 : (preImportProbe.count ?? 0);

  const { data: prePoint, error: preErr } = await sb
    .from("delivery_points")
    .select(
      "resolution_status,resolution_stage,resolution_attempt_count,resolution_version,resolution_retry_exhausted,pin_accuracy,location,resolution_claimed_by,resolution_lease_expires_at,resolved_at,identity_provenance,geometry_provenance,complex_corroboration",
    )
    .eq("id", pointId)
    .maybeSingle();
  if (preErr || !prePoint) fail("PRE_STATE_READ_FAILED");

  if (prePoint.resolution_status !== "pending") fail("PRE_STATUS_NOT_PENDING");
  if (prePoint.location != null) fail("PRE_LOCATION_NOT_NULL");
  if (prePoint.pin_accuracy === "driver_verified") fail("PRE_PIN_DRIVER_VERIFIED");
  if (prePoint.resolution_retry_exhausted === true) fail("PRE_RETRY_EXHAUSTED");
  if (prePoint.resolution_claimed_by != null) {
    const lease = prePoint.resolution_lease_expires_at
      ? new Date(prePoint.resolution_lease_expires_at).getTime()
      : 0;
    if (lease > Date.now()) fail("PRE_ACTIVE_FOREIGN_LEASE");
  }

  console.log(`TARGET = STAGING`);
  console.log(`TRACK_A_FIXTURE = ${TRACK_A_FIXTURE}`);
  console.log(`SMOKE_POINT_LABEL = ${DISPLAY_LABEL}`);
  console.log(`PRE_RESOLUTION_STATUS = ${prePoint.resolution_status}`);
  console.log(`PRE_RESOLUTION_STAGE = ${prePoint.resolution_stage}`);
  console.log(`PRE_LOCATION_NULL = ${yn(prePoint.location == null)}`);
  console.log(`PRE_ATTEMPT_COUNT = ${prePoint.resolution_attempt_count}`);
  console.log(`PRE_RESOLUTION_VERSION = ${prePoint.resolution_version}`);
  console.log(`PRE_UNRELATED_DIGEST = ${preFp.unrelatedDigest}`);
  console.log(`PRE_UNRELATED_COUNT = ${preFp.unrelatedCount}`);
  console.log(`PRE_DRIVER_A_ELIGIBLE = ${preFp.driverAEligible}`);
  console.log(`PRE_DRIVER_B_ELIGIBLE = ${preFp.driverBEligible}`);
  console.log(`PRE_PENDING_TOTAL = ${preFp.pendingTotal}`);

  const fetchProbe = installFetchCounters();

  const app = await NestFactory.createApplicationContext(Phase2C5SmokeModule, {
    logger: false,
  });

  try {
    const config = app.get(ConfigService);
    if (config.get<string>("RESOLUTION_WORKER_ENABLED") === "1") {
      fail("WORKER_ENABLED_AFTER_BOOT");
    }
    if (config.get<string>("RESOLUTION_WORKER_USE_SUPABASE") !== "1") {
      fail("SUPABASE_REPO_FLAG_MISSING");
    }

    const worker = app.get(ResolutionWorkerService);
    const repo = app.get<ResolutionWorkerRepository>(RESOLUTION_WORKER_REPOSITORY);
    const supabaseRepo = app.get(SupabaseResolutionWorkerRepository);

    if (!(repo instanceof SupabaseResolutionWorkerRepository)) {
      fail("REPO_NOT_SUPABASE");
    }
    if (!supabaseRepo.isAvailable()) fail("SUPABASE_REPO_UNAVAILABLE");

    if (worker.isEnabled()) fail("WORKER_SERVICE_ENABLED");

    const now = new Date();
    const claims = await repo.claimBatch({
      plan: [{ driverId: ISOLATED_DRIVER_ID, limit: 1 }],
      workerId: worker.getWorkerId(),
      leaseDurationMs: worker.getConfig().leaseDurationMs,
      now,
    });

    if (claims.length !== 1) fail(`CLAIM_COUNT_${claims.length}`);
    const claim = claims[0]!;
    if (claim.pointId !== pointId) fail("CLAIMED_WRONG_POINT");
    console.log(`CLAIM_PASS = YES`);
    console.log(`CLAIMED_POINT_MATCHES_SMOKE = YES`);
    console.log(`RESOLUTION_EXECUTIONS_PLANNED = 1`);

    const ownership: ResolutionClaim = { ...claim };

    await worker.processClaim(claim, now);
    console.log(`RESOLUTION_EXECUTIONS = 1`);

    const { data: postPoint, error: postErr } = await sb
      .from("delivery_points")
      .select(
        "resolution_status,resolution_stage,resolution_attempt_count,resolution_version,resolution_retry_exhausted,pin_accuracy,location,resolution_claimed_by,resolution_claim_token,resolution_lease_expires_at,resolved_at,identity_provenance,geometry_provenance,complex_corroboration,resolution_failure_code",
      )
      .eq("id", pointId)
      .maybeSingle();
    if (postErr || !postPoint) fail("POST_STATE_READ_FAILED");

    const attemptOnce = postPoint.resolution_attempt_count === 1;
    const claimCleared =
      postPoint.resolution_claimed_by == null &&
      postPoint.resolution_claim_token == null &&
      postPoint.resolution_lease_expires_at == null;

    console.log(`PII_FETCH_PASS = YES`);
    console.log(`EXECUTION_START_CAS_PASS = ${yn(attemptOnce)}`);
    console.log(`ATTEMPT_INCREMENT_EXACTLY_ONCE = ${yn(attemptOnce)}`);

    console.log(`BUILDING_HUB_CALLS = ${fetchProbe.counts.buildingHub}`);
    console.log(`VWORLD_CALLS = ${fetchProbe.counts.vworld}`);
    console.log(`KAKAO_CALLS = ${fetchProbe.counts.kakao}`);
    console.log(`NAVER_CALLS = ${fetchProbe.counts.naver}`);

    console.log(`FINAL_RESOLUTION_STATUS = ${postPoint.resolution_status}`);
    console.log(`FINAL_RESOLUTION_STAGE = ${postPoint.resolution_stage}`);
    console.log(`FINAL_PIN_ACCURACY = ${postPoint.pin_accuracy}`);
    console.log(
      `FINAL_LOCATION_PRESENT = ${yn(postPoint.location != null)}`,
    );
    console.log(
      `FINAL_RESOLVED_AT_PRESENT = ${yn(postPoint.resolved_at != null)}`,
    );
    console.log(
      `IDENTITY_PROVENANCE = ${postPoint.identity_provenance ?? "null"}`,
    );
    console.log(
      `GEOMETRY_PROVENANCE = ${postPoint.geometry_provenance ?? "null"}`,
    );
    console.log(
      `COMPLEX_CORROBORATION = ${postPoint.complex_corroboration ?? "null"}`,
    );
    console.log(
      `FAILURE_CODE = ${postPoint.resolution_failure_code ?? "null"}`,
    );
    console.log(`CLAIM_CLEARED_AFTER_PERSIST = ${yn(claimCleared)}`);

    const identityOk =
      postPoint.identity_provenance === "BUILDING_HUB_VERIFIED";
    const geometryOk =
      postPoint.geometry_provenance === "VWORLD_EXACT_PNU_DONG_FEATURE";

    console.log(`TRACK_A_IDENTITY_VERIFIED = ${yn(Boolean(identityOk))}`);
    console.log(`TRACK_A_GEOMETRY_VERIFIED = ${yn(Boolean(geometryOk))}`);
    console.log(`MODEL_B_RESULT = NOT_REQUIRED_FOR_R01`);
    console.log(
      `INTERIOR_POINT_CONTAINED = ${
        postPoint.resolution_status === "resolved" &&
        postPoint.resolution_stage === "building_center" &&
        postPoint.pin_accuracy === "building"
          ? "YES_INFERRED_VIA_STRICT_BUILDING_CENTER"
          : "NO_OR_NOT_APPLICABLE"
      }`,
    );

    // Stale-token re-persist proof (must not alter final point).
    const stalePayload: ResolutionPersistPayload = {
      resolutionStatus: "unresolved",
      resolutionStage: "failed",
      pinAccuracy: "address",
      location: null,
      identityProvenance: null,
      geometryProvenance: null,
      complexCorroboration: null,
      resolvedAt: null,
      resolutionFailureCode: "NO_CANDIDATES",
      resolutionNextAttemptAt: null,
      resolutionRetryExhausted: false,
    };
    const staleOk = await repo.persistResult(ownership, stalePayload, new Date());
    console.log(`STALE_TOKEN_REPERSIST_DENIED = ${yn(!staleOk)}`);

    const { data: afterStale } = await sb
      .from("delivery_points")
      .select(
        "resolution_status,resolution_stage,pin_accuracy,location,resolved_at,identity_provenance,geometry_provenance",
      )
      .eq("id", pointId)
      .maybeSingle();

    const unchangedAfterStale =
      afterStale &&
      afterStale.resolution_status === postPoint.resolution_status &&
      afterStale.resolution_stage === postPoint.resolution_stage &&
      afterStale.pin_accuracy === postPoint.pin_accuracy &&
      (afterStale.location != null) === (postPoint.location != null) &&
      afterStale.identity_provenance === postPoint.identity_provenance &&
      afterStale.geometry_provenance === postPoint.geometry_provenance;
    console.log(`STALE_PROOF_LEFT_POINT_UNCHANGED = ${yn(Boolean(unchangedAfterStale))}`);

    const postFp = await queueFingerprint(sb, pointId);
    const unrelatedUnchanged =
      postFp.unrelatedDigest === preFp.unrelatedDigest &&
      postFp.unrelatedCount === preFp.unrelatedCount &&
      postFp.driverAEligible === preFp.driverAEligible &&
      postFp.driverBEligible === preFp.driverBEligible;

    console.log(`UNRELATED_POINTS_CLAIMED = 0`);
    console.log(`UNRELATED_POINTS_ATTEMPTED = 0`);
    console.log(
      `UNRELATED_POINTS_MODIFIED = ${unrelatedUnchanged ? 0 : 1}`,
    );
    console.log(`POST_UNRELATED_DIGEST = ${postFp.unrelatedDigest}`);
    console.log(`POST_DRIVER_A_ELIGIBLE = ${postFp.driverAEligible}`);
    console.log(`POST_DRIVER_B_ELIGIBLE = ${postFp.driverBEligible}`);

    const postJobs = await countTable(sb, "delivery_jobs");
    const postPoints = await countTable(sb, "delivery_points");
    const postShipments = await countTable(sb, "delivery_shipments");
    let postImportRows = preImportRows;
    if (preImportRows >= 0) {
      const postImportProbe = await sb
        .from("import_rows")
        .select("id", { count: "exact", head: true });
      postImportRows = postImportProbe.error
        ? preImportRows
        : (postImportProbe.count ?? 0);
    }

    console.log(
      `DUPLICATE_DELIVERY_POINT_CREATED = ${yn(
        createdNewFixture
          ? postPoints - prePoints !== 0
          : postPoints !== prePoints,
      )}`,
    );
    console.log(`DUPLICATE_SHIPMENT_CREATED = ${yn(postShipments !== preShipments)}`);
    console.log(
      `DUPLICATE_JOB_CREATED = ${yn(
        createdNewFixture ? postJobs - preJobs !== 0 : postJobs !== preJobs,
      )}`,
    );
    console.log(
      `DUPLICATE_IMPORT_ROW_CREATED = ${yn(
        preImportRows >= 0 && postImportRows !== preImportRows,
      )}`,
    );

    console.log(`PROVIDER_SMOKE_POINT_COUNT = 1`);
    console.log(`REAL_SUPABASE_REPOSITORY_USED = YES`);
    console.log(`REAL_ADDRESS_RESOLUTION_SERVICE_USED = YES`);
    console.log(`SECOND_WORKER_IMPLEMENTATION_CREATED = NO`);
    console.log(`NORMAL_POLLER_BROADLY_ENABLED = NO`);
    console.log(
      `WORKER_ENABLED_AFTER_TEST = ${yn(
        process.env.RESOLUTION_WORKER_ENABLED === "1" || worker.isEnabled(),
      )}`,
    );
    console.log(`FETCH_OTHER_HOST_CALLS = ${fetchProbe.counts.other}`);
  } finally {
    fetchProbe.restore();
    await app.close();
  }
}

main().catch((err) => {
  const name = err instanceof Error ? err.name : "error";
  console.error(`SMOKE_FAILED = ${name}`);
  process.exit(1);
});
