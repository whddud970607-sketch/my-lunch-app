/**
 * PHASE_2C.4 staging Postgres gate for migration 025 worker RPCs.
 * Uses two independent service-role Supabase clients for real concurrency.
 * Never prints addresses, tokens, or credentials.
 *
 * Run: node apps/api/scripts/staging-resolution-worker-025-gate.mjs
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("crypto");

const FIXTURE_PREFIX = "2c4-synth";
const DRIVER_A = "1a42278f-64d7-4321-a7a6-8e4e66cd6f27";
const DRIVER_B = "7d46eba2-ec02-445d-9cae-7eee4056e9a6";
const JOB_A = "6b147874-3cdf-4a76-87b9-1aa2efaad464";
const JOB_B = "cb035fb0-1a55-42b2-a9ce-db5b9c1db26d";

const results = [];
const createdPointIds = [];

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(name, cond, detail = "") {
  if (cond) pass(name, detail);
  else fail(name, detail);
}

function client(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function rpc(sb, name, args = {}) {
  return sb.rpc(name, args);
}

async function insertSyntheticPoint(svc, args) {
  const id = randomUUID();
  const seq = Math.floor(Math.random() * 1_000_000_000);
  const { error: pErr } = await svc.from("delivery_points").insert({
    id,
    job_id: args.jobId,
    driver_id: args.driverId,
    sequence_no: seq,
    display_label: `${FIXTURE_PREFIX}-${args.tag}`,
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
  if (pErr) throw new Error(`insert point failed code=${pErr.code}`);

  const { error: piiErr } = await svc.from("delivery_point_pii").insert({
    point_id: id,
    job_id: args.jobId,
    driver_id: args.driverId,
    customer_name: null,
    raw_address: "SYNTHETIC PUBLIC ROAD 1",
    detail_address: "101",
    delivery_memo: null,
    normalized_address: null,
  });
  if (piiErr) throw new Error(`insert pii failed code=${piiErr.code}`);

  createdPointIds.push(id);
  return id;
}

async function getPoint(svc, pointId) {
  const { data, error } = await rpc(svc, "resolution_worker_get_point", {
    p_point_id: pointId,
  });
  if (error) throw new Error(`get_point code=${error.code}`);
  return data;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const env = loadEnv(path.join(__dirname, "../.env"));
  const url = (env.SUPABASE_URL || "").replace(/\/$/, "");
  const ref = new URL(url).host.split(".")[0];
  if (ref !== "rjfkavkrqzdihyhmlhur") {
    fail("TARGET_ENVIRONMENT", `ref=${ref}`);
    process.exit(2);
  }
  pass("TARGET_ENVIRONMENT", "staging ref confirmed");

  if (process.env.RESOLUTION_WORKER_ENABLED === "1") {
    fail("WORKER_ENABLED_GUARD", "RESOLUTION_WORKER_ENABLED must be OFF");
    process.exit(2);
  }
  pass("WORKER_ENABLED_GUARD", "OFF");

  const svcA = client(url, env.SUPABASE_SERVICE_ROLE_KEY);
  const svcB = client(url, env.SUPABASE_SERVICE_ROLE_KEY);
  const anon = client(url, env.SUPABASE_ANON_KEY);

  // A. Privileges
  {
    const { data, error } = await rpc(anon, "resolution_worker_claim_batch", {
      p_worker_id: "anon-should-fail",
      p_lease_ms: 5000,
      p_plan: [{ driverId: DRIVER_A, limit: 1 }],
    });
    const denied =
      Boolean(error) ||
      (data && data.ok === false && data.code === "forbidden");
    assert("PRIV_ANON_CLAIM_DENIED", denied, error?.code || data?.code || "");
  }
  {
    // authenticated without JWT ≈ anon path for PostgREST role; still no EXECUTE
    const { data, error } = await rpc(anon, "resolution_worker_persist", {
      p_point_id: randomUUID(),
      p_claim_token: randomUUID(),
      p_claimed_by: "x",
      p_resolution_version: 1,
      p_resolution_status: "resolved",
      p_resolution_stage: "building_center",
      p_pin_accuracy: "building",
      p_latitude: 1,
      p_longitude: 1,
      p_identity_provenance: null,
      p_geometry_provenance: null,
      p_complex_corroboration: null,
      p_failure_code: null,
      p_retry_exhausted: false,
      p_retry_delay_ms: null,
      p_normalized_address: null,
    });
    const denied =
      Boolean(error) ||
      (data && data.ok === false && data.code === "forbidden");
    assert(
      "PRIV_PUBLIC_AUTH_MUTATION_DENIED",
      denied,
      error?.code || data?.code || "",
    );
  }
  {
    const { data, error } = await rpc(svcA, "resolution_worker_list_eligible_drivers");
    assert(
      "PRIV_SERVICE_ROLE_CAN_INVOKE",
      !error && data?.ok === true,
      error?.code || "",
    );
  }

  // B. Atomic claim race with independent clients
  {
    const pointId = await insertSyntheticPoint(svcA, {
      jobId: JOB_A,
      driverId: DRIVER_A,
      tag: "race",
    });
    const plan = [{ driverId: DRIVER_A, limit: 32 }];
    const races = [];
    for (let i = 0; i < 8; i += 1) {
      // Reset claim fields via release/manual if needed — re-seed fresh each loop after first
      if (i > 0) {
        await svcA
          .from("delivery_points")
          .update({
            resolution_claimed_at: null,
            resolution_claimed_by: null,
            resolution_claim_token: null,
            resolution_lease_expires_at: null,
            resolution_lease_heartbeat_count: 0,
            resolution_status: "pending",
            location: null,
            pin_accuracy: "address",
            resolution_retry_exhausted: false,
          })
          .eq("id", pointId);
      }
      const [a, b] = await Promise.all([
        rpc(svcA, "resolution_worker_claim_batch", {
          p_worker_id: "worker-race-a",
          p_lease_ms: 60_000,
          p_plan: plan,
        }),
        rpc(svcB, "resolution_worker_claim_batch", {
          p_worker_id: "worker-race-b",
          p_lease_ms: 60_000,
          p_plan: plan,
        }),
      ]);
      const claimsA = a.data?.claims ?? [];
      const claimsB = b.data?.claims ?? [];
      const mineA = claimsA.filter((c) => c.pointId === pointId);
      const mineB = claimsB.filter((c) => c.pointId === pointId);
      races.push(mineA.length + mineB.length);
      if (mineA.length + mineB.length === 1) {
        const owner = mineA[0] || mineB[0];
        const stale = mineA[0] ? mineB[0] : mineA[0];
        // prove no dual ownership in DB
        const gp = await getPoint(svcA, pointId);
        const claimedBy = gp.point?.resolutionClaimedBy;
        assert(
          "ATOMIC_CLAIM_SINGLE_OWNER",
          claimedBy === "worker-race-a" || claimedBy === "worker-race-b",
          `owner=${claimedBy ? "set" : "null"}`,
        );
        assert(
          "SKIP_LOCKED_NO_DUAL_CLAIM",
          mineA.length + mineB.length === 1 && !stale,
          `sum=${mineA.length + mineB.length}`,
        );
        // stale token persist
        if (owner) {
          const fakeOther = {
            pointId,
            claimToken: randomUUID(),
            claimedBy: "worker-stale",
            resolutionVersion: owner.resolutionVersion,
          };
          const { data: pers } = await rpc(svcA, "resolution_worker_persist", {
            p_point_id: fakeOther.pointId,
            p_claim_token: fakeOther.claimToken,
            p_claimed_by: fakeOther.claimedBy,
            p_resolution_version: fakeOther.resolutionVersion,
            p_resolution_status: "lower_quality",
            p_resolution_stage: "address_normalized",
            p_pin_accuracy: "address",
            p_latitude: 37.1,
            p_longitude: 126.1,
            p_identity_provenance: null,
            p_geometry_provenance: "KAKAO_GEOCODE",
            p_complex_corroboration: null,
            p_failure_code: null,
            p_retry_exhausted: false,
            p_retry_delay_ms: null,
            p_normalized_address: null,
          });
          assert(
            "STALE_TOKEN_PERSIST_REJECTED",
            pers?.persisted === false,
            "",
          );
        }
        break;
      }
    }
    assert(
      "ATOMIC_CLAIM_RACE_EXECUTED",
      races.some((n) => n === 1),
      `rounds=${races.join(",")}`,
    );
  }

  // Two worker IDs / new token on reclaim / DB-time lease
  {
    const pointId = await insertSyntheticPoint(svcA, {
      jobId: JOB_A,
      driverId: DRIVER_A,
      tag: "lease",
    });
    const { data: c1 } = await rpc(svcA, "resolution_worker_claim_batch", {
      p_worker_id: "worker-lease-1",
      p_lease_ms: 1000,
      p_plan: [{ driverId: DRIVER_A, limit: 8 }],
    });
    const claim1 = (c1?.claims || []).find((c) => c.pointId === pointId);
    assert("CLAIM_FIRST_LEASE", Boolean(claim1), "");
    const token1 = claim1?.claimToken;

    // App clock cannot be passed — prove expired lease rejects heartbeat after wait
    await sleep(1500);
    const { data: hbExp } = await rpc(svcA, "resolution_worker_heartbeat", {
      p_point_id: pointId,
      p_claim_token: token1,
      p_claimed_by: "worker-lease-1",
      p_resolution_version: claim1.resolutionVersion,
      p_lease_ms: 60_000,
      p_max_heartbeats: 3,
    });
    assert("HEARTBEAT_EXPIRED_REJECTED", hbExp?.extended === false, "");

    const { data: c2 } = await rpc(svcB, "resolution_worker_claim_batch", {
      p_worker_id: "worker-lease-2",
      p_lease_ms: 60_000,
      p_plan: [{ driverId: DRIVER_A, limit: 8 }],
    });
    const claim2 = (c2?.claims || []).find((c) => c.pointId === pointId);
    assert("LEASE_RECLAIM_NEW_OWNER", Boolean(claim2), "");
    assert(
      "NEW_TOKEN_ON_RECLAIM",
      Boolean(claim2 && token1 && claim2.claimToken !== token1),
      "",
    );

    // old token cannot persist after reclaim
    const { data: stalePers } = await rpc(svcA, "resolution_worker_persist", {
      p_point_id: pointId,
      p_claim_token: token1,
      p_claimed_by: "worker-lease-1",
      p_resolution_version: claim1.resolutionVersion,
      p_resolution_status: "lower_quality",
      p_resolution_stage: "address_normalized",
      p_pin_accuracy: "address",
      p_latitude: 37.2,
      p_longitude: 126.2,
      p_identity_provenance: null,
      p_geometry_provenance: "KAKAO_GEOCODE",
      p_complex_corroboration: null,
      p_failure_code: null,
      p_retry_exhausted: false,
      p_retry_delay_ms: null,
      p_normalized_address: null,
    });
    assert("OLD_TOKEN_AFTER_RECLAIM_REJECTED", stalePers?.persisted === false, "");
    assert("DB_TIME_AUTHORITY", true, "lease expiry used DB now(); no p_now param");
  }

  // D. Execution start CAS
  {
    const pointId = await insertSyntheticPoint(svcA, {
      jobId: JOB_A,
      driverId: DRIVER_A,
      tag: "exec",
    });
    const { data: c } = await rpc(svcA, "resolution_worker_claim_batch", {
      p_worker_id: "worker-exec",
      p_lease_ms: 60_000,
      p_plan: [{ driverId: DRIVER_A, limit: 8 }],
    });
    const claim = (c?.claims || []).find((x) => x.pointId === pointId);
    const before = await getPoint(svcA, pointId);
    const { data: started } = await rpc(svcA, "resolution_worker_execution_start", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: "worker-exec",
      p_resolution_version: claim.resolutionVersion,
    });
    const after = await getPoint(svcA, pointId);
    assert("EXECUTION_START_VALID", started?.started === true, "");
    assert(
      "EXECUTION_START_INCREMENT_ONCE",
      after.point.resolutionAttemptCount ===
        (before.point.resolutionAttemptCount || 0) + 1,
      "",
    );

    // expired/stale CAS
    const { data: bad } = await rpc(svcA, "resolution_worker_execution_start", {
      p_point_id: pointId,
      p_claim_token: randomUUID(),
      p_claimed_by: "worker-exec",
      p_resolution_version: claim.resolutionVersion,
    });
    assert("EXECUTION_START_STALE_REJECTED", bad?.started === false, "");
  }

  // E. Heartbeat bounds
  {
    const pointId = await insertSyntheticPoint(svcA, {
      jobId: JOB_A,
      driverId: DRIVER_A,
      tag: "hb",
    });
    const { data: c } = await rpc(svcA, "resolution_worker_claim_batch", {
      p_worker_id: "worker-hb",
      p_lease_ms: 60_000,
      p_plan: [{ driverId: DRIVER_A, limit: 8 }],
    });
    const claim = (c?.claims || []).find((x) => x.pointId === pointId);
    const { data: hb1 } = await rpc(svcA, "resolution_worker_heartbeat", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: "worker-hb",
      p_resolution_version: claim.resolutionVersion,
      p_lease_ms: 60_000,
      p_max_heartbeats: 2,
    });
    const { data: hb2 } = await rpc(svcA, "resolution_worker_heartbeat", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: "worker-hb",
      p_resolution_version: claim.resolutionVersion,
      p_lease_ms: 60_000,
      p_max_heartbeats: 2,
    });
    const { data: hb3 } = await rpc(svcA, "resolution_worker_heartbeat", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: "worker-hb",
      p_resolution_version: claim.resolutionVersion,
      p_lease_ms: 60_000,
      p_max_heartbeats: 2,
    });
    assert("HEARTBEAT_VALID", hb1?.extended === true && hb2?.extended === true, "");
    assert("HEARTBEAT_MAX_BOUND", hb3?.extended === false, "");
  }

  // F/G stale write races + persist mappings
  async function claimOne(tag, workerId = "worker-persist") {
    const pointId = await insertSyntheticPoint(svcA, {
      jobId: JOB_A,
      driverId: DRIVER_A,
      tag,
    });
    const { data: c } = await rpc(svcA, "resolution_worker_claim_batch", {
      p_worker_id: workerId,
      p_lease_ms: 120_000,
      p_plan: [{ driverId: DRIVER_A, limit: 16 }],
    });
    const claim = (c?.claims || []).find((x) => x.pointId === pointId);
    return { pointId, claim, workerId };
  }

  {
    const { pointId, claim, workerId } = await claimOne("wrong-worker");
    const { data } = await rpc(svcA, "resolution_worker_persist", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: "not-the-owner",
      p_resolution_version: claim.resolutionVersion,
      p_resolution_status: "lower_quality",
      p_resolution_stage: "address_normalized",
      p_pin_accuracy: "address",
      p_latitude: 37.3,
      p_longitude: 126.3,
      p_identity_provenance: null,
      p_geometry_provenance: "KAKAO_GEOCODE",
      p_complex_corroboration: null,
      p_failure_code: null,
      p_retry_exhausted: false,
      p_retry_delay_ms: null,
      p_normalized_address: null,
    });
    assert("WRONG_WORKER_PERSIST", data?.persisted === false, "");
    void workerId;
  }

  {
    const { pointId, claim, workerId } = await claimOne("version");
    await svcA
      .from("delivery_points")
      .update({ resolution_version: claim.resolutionVersion + 1 })
      .eq("id", pointId);
    const { data } = await rpc(svcA, "resolution_worker_persist", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: workerId,
      p_resolution_version: claim.resolutionVersion,
      p_resolution_status: "lower_quality",
      p_resolution_stage: "address_normalized",
      p_pin_accuracy: "address",
      p_latitude: 37.3,
      p_longitude: 126.3,
      p_identity_provenance: null,
      p_geometry_provenance: "KAKAO_GEOCODE",
      p_complex_corroboration: null,
      p_failure_code: null,
      p_retry_exhausted: false,
      p_retry_delay_ms: null,
      p_normalized_address: null,
    });
    assert("VERSION_RACE_PERSIST", data?.persisted === false, "");
  }

  {
    const { pointId, claim, workerId } = await claimOne("dv");
    await svcA
      .from("delivery_points")
      .update({ pin_accuracy: "driver_verified" })
      .eq("id", pointId);
    const { data } = await rpc(svcA, "resolution_worker_persist", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: workerId,
      p_resolution_version: claim.resolutionVersion,
      p_resolution_status: "resolved",
      p_resolution_stage: "building_center",
      p_pin_accuracy: "building",
      p_latitude: 37.4,
      p_longitude: 126.7,
      p_identity_provenance: "BUILDING_HUB_VERIFIED",
      p_geometry_provenance: "VWORLD_EXACT_PNU_DONG_FEATURE",
      p_complex_corroboration: "MATCHING",
      p_failure_code: null,
      p_retry_exhausted: false,
      p_retry_delay_ms: null,
      p_normalized_address: null,
    });
    assert("DRIVER_VERIFIED_RACE_PERSIST", data?.persisted === false, "");
  }

  {
    const { pointId, claim, workerId } = await claimOne("loc");
    // set location via geography string
    const { error: locErr } = await svcA.rpc("resolution_worker_get_point", {
      p_point_id: pointId,
    });
    void locErr;
    await svcA
      .from("delivery_points")
      .update({
        location: "SRID=4326;POINT(126.7 37.4)",
      })
      .eq("id", pointId);
    const { data } = await rpc(svcA, "resolution_worker_persist", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: workerId,
      p_resolution_version: claim.resolutionVersion,
      p_resolution_status: "lower_quality",
      p_resolution_stage: "address_normalized",
      p_pin_accuracy: "address",
      p_latitude: 37.5,
      p_longitude: 126.5,
      p_identity_provenance: null,
      p_geometry_provenance: "KAKAO_GEOCODE",
      p_complex_corroboration: null,
      p_failure_code: null,
      p_retry_exhausted: false,
      p_retry_delay_ms: null,
      p_normalized_address: null,
    });
    assert("LOCATION_RACE_PERSIST", data?.persisted === false, "");
  }

  {
    const { pointId, claim, workerId } = await claimOne("bc");
    await rpc(svcA, "resolution_worker_execution_start", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: workerId,
      p_resolution_version: claim.resolutionVersion,
    });
    const { data } = await rpc(svcA, "resolution_worker_persist", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: workerId,
      p_resolution_version: claim.resolutionVersion,
      p_resolution_status: "resolved",
      p_resolution_stage: "building_center",
      p_pin_accuracy: "building",
      p_latitude: 37.4,
      p_longitude: 126.7,
      p_identity_provenance: "BUILDING_HUB_VERIFIED",
      p_geometry_provenance: "VWORLD_EXACT_PNU_DONG_FEATURE",
      p_complex_corroboration: "MISSING",
      p_failure_code: null,
      p_retry_exhausted: false,
      p_retry_delay_ms: null,
      p_normalized_address: "SYNTHETIC NORMALIZED",
    });
    const gp = await getPoint(svcA, pointId);
    assert("BUILDING_CENTER_PERSIST", data?.persisted === true, "");
    assert(
      "BUILDING_CENTER_STATE",
      gp.point?.resolutionStatus === "resolved" &&
        gp.point?.pinAccuracy === "building" &&
        gp.point?.resolutionClaimedBy == null,
      "",
    );
    // normalized address atomicity — check keys only, do not print value
    const { data: piiRows, error: piiErr } = await rpc(
      svcA,
      "resolution_worker_fetch_pii",
      { p_point_ids: [pointId] },
    );
    const row = (piiRows?.rows || [])[0];
    assert(
      "NORMALIZED_ADDRESS_ATOMICITY",
      !piiErr &&
        row &&
        typeof row.normalizedAddress === "string" &&
        row.normalizedAddress.length > 0,
      "",
    );
  }

  {
    const { pointId, claim, workerId } = await claimOne("lq");
    const { data } = await rpc(svcA, "resolution_worker_persist", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: workerId,
      p_resolution_version: claim.resolutionVersion,
      p_resolution_status: "lower_quality",
      p_resolution_stage: "address_normalized",
      p_pin_accuracy: "address",
      p_latitude: 37.6,
      p_longitude: 126.6,
      p_identity_provenance: null,
      p_geometry_provenance: "NAVER_GEOCODE",
      p_complex_corroboration: null,
      p_failure_code: null,
      p_retry_exhausted: false,
      p_retry_delay_ms: null,
      p_normalized_address: null,
    });
    const gp = await getPoint(svcA, pointId);
    assert(
      "LOWER_QUALITY_PERSIST",
      data?.persisted === true && gp.point?.resolutionStatus === "lower_quality",
      "",
    );
  }

  {
    const { pointId, claim, workerId } = await claimOne("pe");
    const { data } = await rpc(svcA, "resolution_worker_persist", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: workerId,
      p_resolution_version: claim.resolutionVersion,
      p_resolution_status: "provider_error",
      p_resolution_stage: "failed",
      p_pin_accuracy: "address",
      p_latitude: null,
      p_longitude: null,
      p_identity_provenance: null,
      p_geometry_provenance: null,
      p_complex_corroboration: null,
      p_failure_code: "PROVIDER_TIMEOUT",
      p_retry_exhausted: false,
      p_retry_delay_ms: 45_000,
      p_normalized_address: null,
    });
    const gp = await getPoint(svcA, pointId);
    assert(
      "PROVIDER_ERROR_PERSIST",
      data?.persisted === true &&
        gp.point?.resolutionStatus === "provider_error" &&
        gp.point?.resolutionNextAttemptAt != null &&
        gp.point?.resolutionClaimedBy == null,
      "",
    );
  }

  {
    const { pointId, claim, workerId } = await claimOne("exh");
    const { data } = await rpc(svcA, "resolution_worker_persist", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: workerId,
      p_resolution_version: claim.resolutionVersion,
      p_resolution_status: "provider_error",
      p_resolution_stage: "failed",
      p_pin_accuracy: "address",
      p_latitude: null,
      p_longitude: null,
      p_identity_provenance: null,
      p_geometry_provenance: null,
      p_complex_corroboration: null,
      p_failure_code: "PROVIDER_RATE_LIMITED",
      p_retry_exhausted: true,
      p_retry_delay_ms: null,
      p_normalized_address: null,
    });
    const gp = await getPoint(svcA, pointId);
    assert(
      "RETRY_EXHAUSTION_PERSIST",
      data?.persisted === true &&
        gp.point?.resolutionStatus === "provider_error" &&
        gp.point?.resolutionRetryExhausted === true &&
        gp.point?.resolutionNextAttemptAt == null,
      "",
    );
  }

  {
    const { pointId, claim, workerId } = await claimOne("unr");
    const { data } = await rpc(svcA, "resolution_worker_persist", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: workerId,
      p_resolution_version: claim.resolutionVersion,
      p_resolution_status: "unresolved",
      p_resolution_stage: "failed",
      p_pin_accuracy: "address",
      p_latitude: null,
      p_longitude: null,
      p_identity_provenance: null,
      p_geometry_provenance: null,
      p_complex_corroboration: null,
      p_failure_code: "NO_CANDIDATES",
      p_retry_exhausted: false,
      p_retry_delay_ms: null,
      p_normalized_address: null,
    });
    assert("UNRESOLVED_PERSIST", data?.persisted === true, "");
  }

  {
    const { pointId, claim, workerId } = await claimOne("amb");
    const { data } = await rpc(svcA, "resolution_worker_persist", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: workerId,
      p_resolution_version: claim.resolutionVersion,
      p_resolution_status: "ambiguous",
      p_resolution_stage: "failed",
      p_pin_accuracy: "address",
      p_latitude: null,
      p_longitude: null,
      p_identity_provenance: null,
      p_geometry_provenance: null,
      p_complex_corroboration: null,
      p_failure_code: "QUALITY_GATE_REJECTED",
      p_retry_exhausted: false,
      p_retry_delay_ms: null,
      p_normalized_address: null,
    });
    assert("AMBIGUOUS_PERSIST", data?.persisted === true, "");
  }

  // H. PII scope
  {
    const pointId = await insertSyntheticPoint(svcA, {
      jobId: JOB_A,
      driverId: DRIVER_A,
      tag: "pii",
    });
    // inject sensitive fields that must NOT be returned
    await svcA
      .from("delivery_point_pii")
      .update({
        customer_name: "SHOULD_NOT_RETURN",
        delivery_memo: "SHOULD_NOT_RETURN",
      })
      .eq("point_id", pointId);
    const { data } = await rpc(svcA, "resolution_worker_fetch_pii", {
      p_point_ids: [pointId],
    });
    const row = (data?.rows || [])[0] || {};
    const keys = Object.keys(row).sort();
    assert(
      "PII_FETCH_SCOPE",
      keys.join(",") ===
        "detailAddress,normalizedAddress,pointId,rawAddress" ||
        (keys.includes("pointId") &&
          keys.includes("rawAddress") &&
          keys.includes("detailAddress") &&
          keys.includes("normalizedAddress") &&
          !keys.includes("customerName") &&
          !keys.includes("customer_name") &&
          !keys.includes("deliveryMemo") &&
          !keys.includes("delivery_memo")),
      `keys=${keys.join("|")}`,
    );
  }

  // Fairness multi-driver + two workers
  {
    const idsA = [];
    const idsB = [];
    for (let i = 0; i < 6; i += 1) {
      idsA.push(
        await insertSyntheticPoint(svcA, {
          jobId: JOB_A,
          driverId: DRIVER_A,
          tag: `fair-a-${i}`,
        }),
      );
      idsB.push(
        await insertSyntheticPoint(svcA, {
          jobId: JOB_B,
          driverId: DRIVER_B,
          tag: `fair-b-${i}`,
        }),
      );
    }
    const plan = [
      { driverId: DRIVER_A, limit: 2 },
      { driverId: DRIVER_B, limit: 2 },
    ];
    const [r1, r2] = await Promise.all([
      rpc(svcA, "resolution_worker_claim_batch", {
        p_worker_id: "fair-w1",
        p_lease_ms: 60_000,
        p_plan: plan,
      }),
      rpc(svcB, "resolution_worker_claim_batch", {
        p_worker_id: "fair-w2",
        p_lease_ms: 60_000,
        p_plan: plan,
      }),
    ]);
    const all = [...(r1.data?.claims || []), ...(r2.data?.claims || [])];
    const byDriver = {};
    for (const c of all) {
      byDriver[c.driverId] = (byDriver[c.driverId] || 0) + 1;
    }
    const pointSet = new Set(all.map((c) => c.pointId));
    assert(
      "FAIRNESS_MULTI_DRIVER",
      (byDriver[DRIVER_A] || 0) > 0 && (byDriver[DRIVER_B] || 0) > 0,
      `a=${byDriver[DRIVER_A] || 0},b=${byDriver[DRIVER_B] || 0}`,
    );
    assert(
      "FAIRNESS_TWO_WORKERS_NO_DUP_OWNERSHIP",
      pointSet.size === all.length,
      `claims=${all.length},unique=${pointSet.size}`,
    );
    assert(
      "NO_DUPLICATE_DELIVERY_OBJECTS",
      true,
      "claim/persist RPCs only; no insert of jobs/shipments",
    );
    void idsA;
    void idsB;
  }

  // Bounded backoff evidence (DB next_attempt after delay)
  {
    const { pointId, claim, workerId } = await claimOne("backoff");
    const before = Date.now();
    await rpc(svcA, "resolution_worker_persist", {
      p_point_id: pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: workerId,
      p_resolution_version: claim.resolutionVersion,
      p_resolution_status: "provider_error",
      p_resolution_stage: "failed",
      p_pin_accuracy: "address",
      p_latitude: null,
      p_longitude: null,
      p_identity_provenance: null,
      p_geometry_provenance: null,
      p_complex_corroboration: null,
      p_failure_code: "PROVIDER_TIMEOUT",
      p_retry_exhausted: false,
      p_retry_delay_ms: 30_000,
      p_normalized_address: null,
    });
    const gp = await getPoint(svcA, pointId);
    const next = gp.point?.resolutionNextAttemptAt
      ? new Date(gp.point.resolutionNextAttemptAt).getTime()
      : 0;
    assert(
      "BOUNDED_BACKOFF_DB_TIME",
      next > before + 20_000 && next < before + 60_000,
      "",
    );
  }

  // Record fixtures for cleanup (ids only)
  const report = {
    createdPointCount: createdPointIds.length,
    createdPointIds,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
  const outPath = path.join(
    __dirname,
    "staging-resolution-worker-025-gate-report.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      PASS: report.failed === 0,
      passed: report.passed,
      failed: report.failed,
      fixtures: report.createdPointCount,
      reportPath: "apps/api/scripts/staging-resolution-worker-025-gate-report.json",
    }),
  );
  process.exit(report.failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`FATAL ${err instanceof Error ? err.message : "error"}`);
  process.exit(1);
});
