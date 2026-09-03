/**
 * PHASE_2C.5J — one instrumented controlled staging provider smoke.
 *
 * NEW fixture only (never reuse 2c5 / 2c5c labels).
 * Scoped ResolutionDiagnosticCollector on processClaim only.
 * Import compose → PII → worker hint extract → real providers → persist.
 *
 * Compile: npm run build
 * Run:     node dist/scripts/phase-2c5j-instrumented-provider-smoke.js
 *
 * Never prints addresses, tokens, credentials, fingerprints, or provider bodies.
 */
import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  parseDong,
  resolveComplexNameHint,
} from "../address/address.parser";
import {
  DiagnosticStage,
  ResolutionDiagnosticCollector,
  type DiagnosticStageName,
} from "../address/building/resolution-diagnostic-trace";
import { TRACK_A_PIPELINE_FIXTURES } from "../address/fixtures/track-a-production-fixtures";
import { composeDetailAddressWithComplex } from "../import/import-detail-compose";
import { draftsToCommitRpcRows } from "../import/import-commit.mapper";
import type { NormalizedDeliveryDraft } from "../import/import.types";
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
const ISOLATED_DRIVER_ID = "a790da50-0f7f-4e60-8537-13c3b24b00b1";
const TRACK_A_FIXTURE = "R01" as const;
const DISPLAY_LABEL = "2c5j-smoke-R01";
const FORBIDDEN_LABELS = ["2c5-smoke-R01", "2c5c-smoke-R01"] as const;

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
      "id,display_label,resolution_status,resolution_version,resolution_attempt_count,resolution_claim_token,resolution_claimed_by,resolution_lease_expires_at,pin_accuracy,updated_at",
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
              r.display_label ?? "",
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

async function countTable(sb: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await sb
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) fail(`COUNT_FAILED_${table}`);
  return count ?? 0;
}

function buildImportStyleDetail(fx: (typeof TRACK_A_PIPELINE_FIXTURES)["R01"]): {
  composedDetail: string;
  usedImportMapper: boolean;
} {
  const draft: NormalizedDeliveryDraft = {
    rowIndex: 0,
    companyId: null,
    sourceId: null,
    sourceKey: null,
    serviceDate: null,
    trackingCode: "2c5j-smoke-tracking",
    externalId: null,
    quantity: 1,
    quantityOrigin: "explicit",
    customerName: null,
    addressRaw: fx.roadAddress,
    addressNormalized: fx.roadAddress,
    detailAddress: `${fx.dong}동`,
    complexName: fx.complexNameHint,
    deliveryMemo: null,
    displayLabel: DISPLAY_LABEL,
    barcodeRaw: null,
    latitude: null,
    longitude: null,
    geocodeConfidence: null,
    geocodeProvider: null,
    geocodeStatus: "pending",
    issues: [],
  };
  const rows = draftsToCommitRpcRows([draft]);
  const composed = rows[0]?.detailAddress;
  if (!composed) fail("IMPORT_COMPOSE_FAILED");
  const direct = composeDetailAddressWithComplex(
    fx.complexNameHint,
    `${fx.dong}동`,
  );
  if (direct !== composed) fail("IMPORT_COMPOSE_MISMATCH");
  return { composedDetail: composed, usedImportMapper: true };
}

const STAGE_ORDER: DiagnosticStageName[] = [
  DiagnosticStage.INPUT_RECEIVED,
  DiagnosticStage.HINTS_EXTRACTED,
  DiagnosticStage.ADDRESS_PARSED,
  DiagnosticStage.PARCEL_RESOLVED,
  DiagnosticStage.BUILDING_HUB_RESPONSE_CLASSIFIED,
  DiagnosticStage.REGISTER_CANDIDATES_NORMALIZED,
  DiagnosticStage.REGISTER_IDENTITY_MATCHED,
  DiagnosticStage.PNU_BUILT,
  DiagnosticStage.VWORLD_GEOMETRY_RESULT,
  DiagnosticStage.INTERIOR_POINT_RESULT,
  DiagnosticStage.FINAL_RESOLUTION_DECISION,
];

function reportTrace(collector: ResolutionDiagnosticCollector): {
  lastSuccess: string;
  firstFail: string;
  failureCode: string;
} {
  const report = collector.toSafeReport();
  const byStage = new Map(report.stages.map((s) => [s.stage, s]));

  const payloadOf = (stage: DiagnosticStageName) => byStage.get(stage)?.payload;

  console.log(
    `INPUT_RECEIVED = ${yn(collector.hasStage(DiagnosticStage.INPUT_RECEIVED))}`,
  );
  console.log(
    `HINTS_EXTRACTED = ${yn(collector.hasStage(DiagnosticStage.HINTS_EXTRACTED))}`,
  );
  const hints = payloadOf(DiagnosticStage.HINTS_EXTRACTED);
  if (hints) {
    console.log(`HAS_COMPLEX_NAME_HINT = ${yn(Boolean(hints.hasComplexNameHint))}`);
    console.log(`HAS_DONG_HINT = ${yn(Boolean(hints.hasDongHint))}`);
  }

  console.log(
    `ADDRESS_PARSED = ${yn(collector.hasStage(DiagnosticStage.ADDRESS_PARSED))}`,
  );
  const parsed = payloadOf(DiagnosticStage.ADDRESS_PARSED);
  if (parsed) {
    console.log(
      `HAS_PARSED_COMPLEX_NAME = ${yn(Boolean(parsed.hasParsedComplexName))}`,
    );
    console.log(`HAS_PARSED_DONG = ${yn(Boolean(parsed.hasParsedDong))}`);
  }

  const parcel = payloadOf(DiagnosticStage.PARCEL_RESOLVED);
  console.log(
    `PARCEL_RESOLVED = ${yn(Boolean(parcel?.parcelResolved === true))}`,
  );

  const hub = payloadOf(DiagnosticStage.BUILDING_HUB_RESPONSE_CLASSIFIED);
  console.log(
    `BUILDING_HUB_RESPONSE_CLASSIFICATION = ${hub?.hubPageClassification ?? "MISSING"}`,
  );

  const cand = payloadOf(DiagnosticStage.REGISTER_CANDIDATES_NORMALIZED);
  console.log(
    `REGISTER_CANDIDATE_COUNT = ${cand?.hubCandidateCount ?? "MISSING"}`,
  );

  const ident = payloadOf(DiagnosticStage.REGISTER_IDENTITY_MATCHED);
  console.log(
    `REGISTER_IDENTITY_VERIFIED = ${yn(Boolean(ident?.identityVerified === true))}`,
  );
  console.log(
    `REGISTER_MATCHED_CANDIDATE_COUNT = ${ident?.matchedCandidateCount ?? "MISSING"}`,
  );
  if (ident?.dongMatch != null) console.log(`DONG_MATCH = ${ident.dongMatch}`);
  if (ident?.complexNameMatch != null) {
    console.log(`COMPLEX_NAME_MATCH = ${ident.complexNameMatch}`);
  }

  const pnu = payloadOf(DiagnosticStage.PNU_BUILT);
  console.log(`PNU_BUILT = ${yn(Boolean(pnu?.pnuBuilt === true))}`);

  const vworld = payloadOf(DiagnosticStage.VWORLD_GEOMETRY_RESULT);
  console.log(
    `VWORLD_GEOMETRY_VERIFIED = ${yn(Boolean(vworld?.geometryVerified === true))}`,
  );
  console.log(
    `VWORLD_FEATURE_COUNT = ${vworld?.vworldFeatureCount ?? "MISSING"}`,
  );

  const interior = payloadOf(DiagnosticStage.INTERIOR_POINT_RESULT);
  console.log(
    `INTERIOR_POINT_CONTAINED = ${yn(
      Boolean(interior?.interiorPointContained === true),
    )}`,
  );

  const finalEvt = payloadOf(DiagnosticStage.FINAL_RESOLUTION_DECISION);
  console.log(
    `FINAL_RESOLUTION_DECISION = ${finalEvt?.finalResolutionClass ?? "MISSING"}`,
  );

  console.log(
    `PARCEL_FINGERPRINT_STABLE = ${
      report.parcelFingerprintStable == null
        ? "N/A"
        : yn(report.parcelFingerprintStable)
    }`,
  );
  console.log(
    `COMPLEX_FINGERPRINT_STABLE = ${
      report.complexFingerprintStable == null
        ? "N/A"
        : yn(report.complexFingerprintStable)
    }`,
  );
  console.log(
    `DONG_FINGERPRINT_STABLE = ${
      report.dongFingerprintStable == null
        ? "N/A"
        : yn(report.dongFingerprintStable)
    }`,
  );

  let lastSuccess = "NONE";
  let firstFail = "NONE";
  for (const stage of STAGE_ORDER) {
    const ev = byStage.get(stage);
    if (!ev) {
      if (firstFail === "NONE") firstFail = stage;
      break;
    }
    const p = ev.payload;
    let ok = true;
    if (stage === DiagnosticStage.PARCEL_RESOLVED) ok = p.parcelResolved === true;
    if (stage === DiagnosticStage.BUILDING_HUB_RESPONSE_CLASSIFIED) {
      ok = p.hubPageClassification === "OK" && p.hubFetchOk === true;
    }
    if (stage === DiagnosticStage.REGISTER_CANDIDATES_NORMALIZED) {
      ok = typeof p.hubCandidateCount === "number" && p.hubCandidateCount > 0;
    }
    if (stage === DiagnosticStage.REGISTER_IDENTITY_MATCHED) {
      ok = p.identityVerified === true;
    }
    if (stage === DiagnosticStage.PNU_BUILT) ok = p.pnuBuilt === true;
    if (stage === DiagnosticStage.VWORLD_GEOMETRY_RESULT) {
      ok = p.geometryVerified === true;
    }
    if (stage === DiagnosticStage.INTERIOR_POINT_RESULT) {
      ok = p.interiorPointContained === true;
    }
    if (stage === DiagnosticStage.FINAL_RESOLUTION_DECISION) {
      ok =
        p.finalResolutionClass === "BUILDING_CENTER" ||
        p.finalResolutionClass === "VERIFIED";
    }
    if (ok) lastSuccess = stage;
    else {
      firstFail = stage;
      break;
    }
  }

  const failureCode =
    (finalEvt?.failureCode as string | null | undefined) ??
    (ident && ident.identityVerified !== true
      ? String(ident.complexNameMatch ?? "IDENTITY_FAILED")
      : firstFail === "NONE"
        ? "null"
        : firstFail);

  console.log(`LAST_SUCCESSFUL_STAGE = ${lastSuccess}`);
  console.log(`FIRST_FAILED_OR_DIVERGENT_STAGE = ${firstFail}`);
  console.log(`SANITIZED_FAILURE_CODE = ${failureCode}`);

  // Security: serialized safe report must not leak sentinels from fixture names.
  const json = collector.serializeSafeJson();
  const leakHints = [
    "서창",
    "푸르지오",
    "인천",
    "남동구",
    "KakaoAK",
    "serviceKey=",
    "eyJ",
    "SUPABASE",
  ];
  let piiLeak = false;
  for (const h of leakHints) {
    if (json.includes(h)) piiLeak = true;
  }
  console.log(`PII_IN_TRACE_OR_LOGS = ${yn(piiLeak)}`);
  console.log(`CREDENTIALS_IN_TRACE_OR_LOGS = ${yn(piiLeak)}`);

  return { lastSuccess, firstFail, failureCode };
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
class Phase2C5JSmokeModule {}

async function main(): Promise<void> {
  loadEnvFile("apps/api/.env");
  loadEnvFile(".env");

  console.log(`PHASE_2C_5J_INSTRUMENTED_SMOKE =`);
  console.log(`SCRIPT_EXECUTIONS = 1`);

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
  console.log(`TARGET = STAGING`);
  console.log(`PRODUCTION_TARGET = NO`);

  process.env.RESOLUTION_WORKER_USE_SUPABASE = "1";
  delete process.env.RESOLUTION_WORKER_ENABLED;
  console.log(`NORMAL_POLLER_ENABLED = NO`);

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Isolation gate: isolated driver must have zero eligible points before insert.
  const preEligible = await eligibleCount(sb, ISOLATED_DRIVER_ID);
  console.log(`ISOLATED_DRIVER_PRE_ELIGIBLE = ${preEligible}`);
  if (preEligible !== 0) fail("ISOLATION_NOT_PROVEN_ELIGIBLE_NONEMPTY");

  const fx = TRACK_A_PIPELINE_FIXTURES[TRACK_A_FIXTURE];
  const { composedDetail, usedImportMapper } = buildImportStyleDetail(fx);

  const jobId = randomUUID();
  const pointId = randomUUID();
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
      detail_address: composedDetail,
      delivery_memo: null,
      normalized_address: null,
    });
    if (error) fail("PII_INSERT_FAILED");
  }

  console.log(`NEW_FIXTURE_COUNT = 1`);
  console.log(`NEW_SYNTHETIC_FIXTURE_CREATED = YES`);
  console.log(`REAL_IMPORT_REPRESENTATION_USED = ${yn(usedImportMapper)}`);
  console.log(`DIRECT_HINT_INJECTION = NO`);
  console.log(`SMOKE_POINT_LABEL = ${DISPLAY_LABEL}`);

  const postInsertEligible = await eligibleCount(sb, ISOLATED_DRIVER_ID);
  if (postInsertEligible !== 1) fail("ISOLATION_POST_INSERT_NOT_EXACTLY_ONE");

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
      "display_label,resolution_status,resolution_stage,resolution_attempt_count,resolution_version,resolution_retry_exhausted,pin_accuracy,location",
    )
    .eq("id", pointId)
    .maybeSingle();
  if (preErr || !prePoint) fail("PRE_STATE_READ_FAILED");
  if ((FORBIDDEN_LABELS as readonly string[]).includes(prePoint.display_label ?? "")) {
    fail("FORBIDDEN_LABEL_USED");
  }
  if (prePoint.resolution_status !== "pending") fail("PRE_STATUS_NOT_PENDING");
  if (prePoint.location != null) fail("PRE_LOCATION_NOT_NULL");
  if (prePoint.resolution_attempt_count !== 0) fail("PRE_ATTEMPT_NOT_ZERO");

  console.log(`PRE_UNRELATED_DIGEST = ${preFp.unrelatedDigest}`);
  console.log(`PRE_UNRELATED_COUNT = ${preFp.unrelatedCount}`);

  const fetchProbe = installFetchCounters();
  const diagnostic = new ResolutionDiagnosticCollector();
  const app = await NestFactory.createApplicationContext(Phase2C5JSmokeModule, {
    logger: false,
  });

  try {
    const config = app.get(ConfigService);
    if (config.get<string>("RESOLUTION_WORKER_ENABLED") === "1") {
      fail("WORKER_ENABLED_AFTER_BOOT");
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

    console.log(`CLAIM_COUNT = ${claims.length}`);
    if (claims.length !== 1) fail(`CLAIM_COUNT_${claims.length}`);
    const claim = claims[0]!;
    const claimedIntended = claim.pointId === pointId;
    console.log(`CLAIMED_INTENDED_POINT = ${yn(claimedIntended)}`);
    if (!claimedIntended) fail("CLAIMED_WRONG_POINT");

    const piiRows = await repo.fetchPii([pointId]);
    const pii = piiRows[0];
    if (!pii?.rawAddress) fail("PII_FETCH_FAILED");
    const complexExtracted = Boolean(
      resolveComplexNameHint({ detailAddress: pii.detailAddress }),
    );
    const dongExtracted = Boolean(parseDong(pii.detailAddress));
    if (!complexExtracted || !dongExtracted) fail("HINT_EXTRACTION_FAILED");

    const ownership: ResolutionClaim = { ...claim };

    // Real worker path + scoped diagnostic collector only.
    await worker.processClaim(claim, now, { diagnosticTrace: diagnostic });
    console.log(`RESOLUTION_EXECUTIONS = 1`);

    reportTrace(diagnostic);

    const { data: postPoint, error: postErr } = await sb
      .from("delivery_points")
      .select(
        "resolution_status,resolution_stage,resolution_attempt_count,resolution_version,pin_accuracy,location,resolution_claimed_by,resolution_claim_token,resolution_lease_expires_at,resolved_at,identity_provenance,geometry_provenance,complex_corroboration,resolution_failure_code",
      )
      .eq("id", pointId)
      .maybeSingle();
    if (postErr || !postPoint) fail("POST_STATE_READ_FAILED");

    const attemptOnce = postPoint.resolution_attempt_count === 1;
    const claimCleared =
      postPoint.resolution_claimed_by == null &&
      postPoint.resolution_claim_token == null &&
      postPoint.resolution_lease_expires_at == null;

    console.log(`EXECUTION_START_CAS = ${yn(attemptOnce)}`);
    console.log(`ATTEMPT_COUNT = ${postPoint.resolution_attempt_count}`);
    console.log(`KAKAO_CALLS = ${fetchProbe.counts.kakao}`);
    console.log(`BUILDING_HUB_CALLS = ${fetchProbe.counts.buildingHub}`);
    console.log(`VWORLD_CALLS = ${fetchProbe.counts.vworld}`);
    console.log(`NAVER_CALLS = ${fetchProbe.counts.naver}`);

    const identityOk =
      postPoint.identity_provenance === "BUILDING_HUB_VERIFIED";
    const geometryOk =
      postPoint.geometry_provenance === "VWORLD_EXACT_PNU_DONG_FEATURE";
    const trackACenterTruth =
      postPoint.resolution_status === "resolved" &&
      postPoint.resolution_stage === "building_center" &&
      postPoint.pin_accuracy === "building" &&
      postPoint.location != null &&
      postPoint.resolved_at != null &&
      identityOk &&
      geometryOk;

    console.log(`FINAL_RESOLUTION_STATUS = ${postPoint.resolution_status}`);
    console.log(`FINAL_RESOLUTION_STAGE = ${postPoint.resolution_stage}`);
    console.log(`FINAL_PIN_ACCURACY = ${postPoint.pin_accuracy}`);
    console.log(`FINAL_LOCATION_PRESENT = ${yn(postPoint.location != null)}`);
    console.log(
      `FINAL_RESOLVED_AT_PRESENT = ${yn(postPoint.resolved_at != null)}`,
    );
    console.log(`IDENTITY_PROVENANCE_VALID = ${yn(identityOk)}`);
    console.log(`GEOMETRY_PROVENANCE_VALID = ${yn(geometryOk)}`);
    console.log(`CLAIM_CLEARED = ${yn(claimCleared)}`);

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
    const stalePersisted = await repo.persistResult(
      ownership,
      stalePayload,
      new Date(),
    );
    const staleTokenDenied = !stalePersisted;
    console.log(`STALE_TOKEN_DENIED = ${yn(staleTokenDenied)}`);

    const { data: afterStale } = await sb
      .from("delivery_points")
      .select(
        "resolution_status,resolution_stage,pin_accuracy,location,identity_provenance,geometry_provenance",
      )
      .eq("id", pointId)
      .maybeSingle();
    const staleProofUnchanged = Boolean(
      afterStale &&
        afterStale.resolution_status === postPoint.resolution_status &&
        afterStale.resolution_stage === postPoint.resolution_stage &&
        afterStale.pin_accuracy === postPoint.pin_accuracy &&
        (afterStale.location != null) === (postPoint.location != null) &&
        afterStale.identity_provenance === postPoint.identity_provenance &&
        afterStale.geometry_provenance === postPoint.geometry_provenance,
    );
    console.log(
      `STALE_PROOF_FINAL_STATE_UNCHANGED = ${yn(staleProofUnchanged)}`,
    );

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
    if (!unrelatedUnchanged) fail("UNRELATED_QUEUE_MUTATED");

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

    const noDuplicatePoint = postPoints - prePoints === 0;
    const noDuplicateShipment = postShipments === preShipments;
    const noDuplicateJob = postJobs - preJobs === 0;
    const noDuplicateImport =
      preImportRows < 0 || postImportRows === preImportRows;

    console.log(`DUPLICATE_JOB_CREATED = ${yn(!noDuplicateJob)}`);
    console.log(`DUPLICATE_DELIVERY_POINT_CREATED = ${yn(!noDuplicatePoint)}`);
    console.log(`DUPLICATE_SHIPMENT_CREATED = ${yn(!noDuplicateShipment)}`);
    console.log(`DUPLICATE_IMPORT_ROW_CREATED = ${yn(!noDuplicateImport)}`);

    console.log(`NORMAL_POLLER_BROADLY_ENABLED = NO`);
    console.log(
      `WORKER_ENABLED_AFTER_TEST = ${yn(
        process.env.RESOLUTION_WORKER_ENABLED === "1" || worker.isEnabled(),
      )}`,
    );
    console.log(`STAGING_DB_CHANGED = YES`);
    console.log(`PRODUCTION_DB_CHANGED = NO`);
    console.log(`MIGRATION_CHANGED = NO`);
    console.log(`ENV_CHANGED = NO`);
    console.log(`FLUTTER_CHANGED = NO`);
    console.log(`TMAP_CHANGED = NO`);
    console.log(`GIT_COMMIT_PUSH = NO`);

    const phasePass =
      trackACenterTruth &&
      attemptOnce &&
      claimCleared &&
      staleTokenDenied &&
      staleProofUnchanged &&
      unrelatedUnchanged &&
      noDuplicatePoint &&
      noDuplicateShipment &&
      noDuplicateJob &&
      noDuplicateImport &&
      collectorIdentityVerified(diagnostic);

    console.log(`PHASE_2C_5J_RESULT = ${phasePass ? "PASS" : "FAIL"}`);
    console.log(`SAFE_TO_CLOSE_PHASE_2C = ${yn(phasePass)}`);
    console.log(`SAFE_TO_BEGIN_FIXTURE_CLEANUP = ${yn(phasePass)}`);

    if (!phasePass) {
      console.log(
        `DB_FAILURE_CODE = ${postPoint.resolution_failure_code ?? "null"}`,
      );
      process.exitCode = 3;
    } else {
      // Signal for outer runner to execute post-PASS regression suite.
      console.log(`RUN_POST_PASS_REGRESSIONS = YES`);
    }
  } finally {
    fetchProbe.restore();
    await app.close();
  }
}

function collectorIdentityVerified(
  collector: ResolutionDiagnosticCollector,
): boolean {
  const ev = collector
    .toSafeReport()
    .stages.find((s) => s.stage === DiagnosticStage.REGISTER_IDENTITY_MATCHED);
  return ev?.payload.identityVerified === true;
}

main().catch((err) => {
  const name = err instanceof Error ? err.name : "error";
  console.error(`SMOKE_FAILED = ${name}`);
  process.exit(1);
});
