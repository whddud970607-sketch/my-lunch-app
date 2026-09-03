import { InMemoryResolutionWorkerRepository } from "./resolution-worker.repository.memory";
import { SupabaseResolutionWorkerRepository } from "./resolution-worker.repository.supabase";
import { RESOLUTION_WORKER_RPC } from "./resolution-worker.rpc";
import type { ResolutionPersistPayload } from "./resolution-worker.types";

const DB_NOW = new Date("2026-09-03T12:00:00.000Z");
const APP_NOW = new Date("2099-01-01T00:00:00.000Z");
const DRIVER_A = "11111111-1111-4111-8111-111111111111";
const DRIVER_B = "22222222-2222-4222-8222-222222222222";

type RpcResponse = { data: unknown; error: { code: string } | null };

/**
 * SQL-semantic simulator — NOT a PostgreSQL SKIP LOCKED proof.
 * Uses the in-memory repository with a controllable DB clock that the
 * Supabase adapter never overrides (adapter does not send p_now).
 */
class SqlSemanticRpc {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  role: "service_role" | "authenticated" | "anon" | "public" = "service_role";
  dbNow = new Date(DB_NOW);
  readonly inner = new InMemoryResolutionWorkerRepository();
  logs: string[] = [];

  async rpc(name: string, args: Record<string, unknown>): Promise<RpcResponse> {
    this.calls.push({ name, args });
    if (this.role !== "service_role") {
      return { data: { ok: false, code: "forbidden" }, error: null };
    }
    try {
      return { data: await this.dispatch(name, args), error: null };
    } catch {
      return { data: null, error: { code: "XX000" } };
    }
  }

  private async dispatch(name: string, args: Record<string, unknown>) {
    const now = this.dbNow;
    switch (name) {
      case RESOLUTION_WORKER_RPC.listEligibleDrivers:
        return {
          ok: true,
          driverIds: await this.inner.listEligibleDriverIds(now),
        };
      case RESOLUTION_WORKER_RPC.claimBatch: {
        const plan = Array.isArray(args.p_plan)
          ? (args.p_plan as Array<{ driverId: string; limit: number }>)
          : [];
        const claims = await this.inner.claimBatch({
          plan,
          workerId: String(args.p_worker_id),
          leaseDurationMs: Number(args.p_lease_ms),
          now,
        });
        return { ok: true, claims };
      }
      case RESOLUTION_WORKER_RPC.fetchPii: {
        const ids = (args.p_point_ids as string[]) ?? [];
        return { ok: true, rows: await this.inner.fetchPii(ids) };
      }
      case RESOLUTION_WORKER_RPC.executionStart: {
        const claim = await this.claimFromArgs(args);
        if (!claim) return { ok: true, started: false };
        return {
          ok: true,
          started: await this.inner.executionStartCas(claim, now),
        };
      }
      case RESOLUTION_WORKER_RPC.heartbeat: {
        const claim = await this.claimFromArgs(args);
        if (!claim) return { ok: true, extended: false };
        return {
          ok: true,
          extended: await this.inner.heartbeat(claim, {
            leaseDurationMs: Number(args.p_lease_ms),
            maxHeartbeats: Number(args.p_max_heartbeats),
            now,
          }),
        };
      }
      case RESOLUTION_WORKER_RPC.persist: {
        const claim = await this.claimFromArgs(args);
        if (!claim) return { ok: true, persisted: false };
        const delayMs =
          args.p_retry_delay_ms == null ? null : Number(args.p_retry_delay_ms);
        const payload: ResolutionPersistPayload = {
          resolutionStatus: args.p_resolution_status as never,
          resolutionStage: args.p_resolution_stage as never,
          pinAccuracy: args.p_pin_accuracy as never,
          location:
            args.p_latitude != null && args.p_longitude != null
              ? {
                  latitude: Number(args.p_latitude),
                  longitude: Number(args.p_longitude),
                }
              : null,
          identityProvenance: (args.p_identity_provenance as string) ?? null,
          geometryProvenance: (args.p_geometry_provenance as string) ?? null,
          complexCorroboration: (args.p_complex_corroboration as string) ?? null,
          resolvedAt:
            args.p_resolution_status === "resolved" ||
            args.p_resolution_status === "lower_quality"
              ? now
              : null,
          resolutionFailureCode: (args.p_failure_code as never) ?? null,
          resolutionNextAttemptAt:
            delayMs == null ? null : new Date(now.getTime() + delayMs),
          resolutionRetryExhausted: args.p_retry_exhausted === true,
          normalizedAddress: (args.p_normalized_address as string) ?? null,
        };
        return {
          ok: true,
          persisted: await this.inner.persistResult(claim, payload, now),
        };
      }
      case RESOLUTION_WORKER_RPC.releaseClaim: {
        const claim = await this.claimFromArgs(args);
        if (claim) await this.inner.releaseClaim(claim, now);
        return { ok: true, released: true };
      }
      case RESOLUTION_WORKER_RPC.manualRequeue:
        return {
          ok: true,
          requeued: await this.inner.manualRequeue(String(args.p_point_id), now),
        };
      case RESOLUTION_WORKER_RPC.getPoint: {
        const point = await this.inner.getPoint(String(args.p_point_id));
        if (!point) return { ok: true, point: null };
        return {
          ok: true,
          point: {
            ...point,
            latitude: point.location?.latitude ?? null,
            longitude: point.location?.longitude ?? null,
          },
        };
      }
      default:
        return { ok: false, code: "unknown_rpc" };
    }
  }

  private async claimFromArgs(args: Record<string, unknown>) {
    const pointId = String(args.p_point_id ?? "");
    const point = await this.inner.getPoint(pointId);
    if (!point) return null;
    return {
      pointId,
      driverId: point.driverId,
      claimToken: String(args.p_claim_token),
      claimedBy: String(args.p_claimed_by),
      claimedAt: this.dbNow,
      leaseExpiresAt: point.resolutionLeaseExpiresAt ?? this.dbNow,
      resolutionVersion: Number(args.p_resolution_version),
      resolutionAttemptCount: point.resolutionAttemptCount,
    };
  }
}

function repoWith(rpc: SqlSemanticRpc) {
  const loggerWarns: string[] = [];
  const supabase = {
    getOrNull: () => rpc,
    getRequired: () => rpc,
  };
  const repo = new SupabaseResolutionWorkerRepository(supabase as never);
  const logger = (
    repo as unknown as { logger: { warn: (m: string) => void } }
  ).logger;
  logger.warn = (m: string) => {
    loggerWarns.push(m);
    rpc.logs.push(m);
  };
  return { repo, loggerWarns };
}

function seedPending(rpc: SqlSemanticRpc, id: string, driverId = DRIVER_A) {
  rpc.inner.seedPoint(
    { id, driverId, resolutionStatus: "pending", location: null },
    { rawAddress: "road-only", detailAddress: "101" },
  );
}

const buildingPayload: ResolutionPersistPayload = {
  resolutionStatus: "resolved",
  resolutionStage: "building_center",
  pinAccuracy: "building",
  location: { latitude: 37.4, longitude: 126.7 },
  identityProvenance: "BUILDING_HUB_VERIFIED",
  geometryProvenance: "VWORLD_EXACT_PNU_DONG_FEATURE",
  complexCorroboration: "MATCHING",
  resolvedAt: APP_NOW,
  resolutionFailureCode: null,
  resolutionNextAttemptAt: null,
  resolutionRetryExhausted: false,
  normalizedAddress: "normalized-road",
};

describe("SupabaseResolutionWorkerRepository (adapter unit / SQL-semantic simulator)", () => {
  it("does not send application now or absolute lease timestamps to worker RPCs", async () => {
    const rpc = new SqlSemanticRpc();
    seedPending(rpc, "p1");
    const { repo } = repoWith(rpc);
    await repo.listEligibleDriverIds(APP_NOW);
    const claims = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "worker-a",
      leaseDurationMs: 60_000,
      now: APP_NOW,
    });
    const claim = claims[0]!;
    await repo.executionStartCas(claim, APP_NOW);
    await repo.heartbeat(claim, {
      leaseDurationMs: 60_000,
      maxHeartbeats: 3,
      now: APP_NOW,
    });
    await repo.persistResult(claim, buildingPayload, APP_NOW);

    for (const call of rpc.calls) {
      const keys = Object.keys(call.args);
      expect(keys).not.toContain("p_now");
      expect(keys).not.toContain("now");
      expect(keys).not.toContain("p_lease_expires_at");
      expect(keys).not.toContain("p_resolved_at");
      expect(keys).not.toContain("p_next_attempt_at");
    }
  });

  it("application clock cannot bypass an expired DB lease", async () => {
    const rpc = new SqlSemanticRpc();
    seedPending(rpc, "p-exp");
    const { repo } = repoWith(rpc);
    const [claim] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 1_000,
      now: APP_NOW,
    });
    rpc.dbNow = new Date(DB_NOW.getTime() + 5_000);
    expect(await repo.executionStartCas(claim!, APP_NOW)).toBe(false);
    expect(
      await repo.heartbeat(claim!, {
        leaseDurationMs: 60_000,
        maxHeartbeats: 3,
        now: APP_NOW,
      }),
    ).toBe(false);
    expect(await repo.persistResult(claim!, buildingPayload, APP_NOW)).toBe(
      false,
    );
  });

  it("execution-start CAS with valid DB lease increments attempt_count", async () => {
    const rpc = new SqlSemanticRpc();
    seedPending(rpc, "p-cas");
    const { repo } = repoWith(rpc);
    const [claim] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 60_000,
      now: APP_NOW,
    });
    expect(await repo.executionStartCas(claim!, APP_NOW)).toBe(true);
    expect((await repo.getPoint("p-cas"))?.resolutionAttemptCount).toBe(1);
  });

  it("heartbeat valid / expired / max via DB clock", async () => {
    const rpc = new SqlSemanticRpc();
    seedPending(rpc, "p-hb");
    const { repo } = repoWith(rpc);
    const [claim] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 5_000,
      now: APP_NOW,
    });
    expect(
      await repo.heartbeat(claim!, {
        leaseDurationMs: 5_000,
        maxHeartbeats: 1,
        now: APP_NOW,
      }),
    ).toBe(true);
    expect(
      await repo.heartbeat(claim!, {
        leaseDurationMs: 5_000,
        maxHeartbeats: 1,
        now: APP_NOW,
      }),
    ).toBe(false);
  });

  it("persists BUILDING_CENTER using DB now for resolved_at, not app resolvedAt", async () => {
    const rpc = new SqlSemanticRpc();
    seedPending(rpc, "p-bc");
    const { repo } = repoWith(rpc);
    const [claim] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 60_000,
      now: APP_NOW,
    });
    expect(await repo.persistResult(claim!, buildingPayload, APP_NOW)).toBe(
      true,
    );
    const inspect = await rpc.inner.inspectPoint("p-bc");
    expect(inspect?.resolutionStatus).toBe("resolved");
    expect(inspect?.resolvedAt).toEqual(DB_NOW);
    expect(inspect?.resolvedAt).not.toEqual(APP_NOW);
  });

  it("applies bounded retry delay as DB now + delay, not absolute app timestamp", async () => {
    const rpc = new SqlSemanticRpc();
    seedPending(rpc, "p-bo");
    const { repo } = repoWith(rpc);
    const [claim] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 60_000,
      now: APP_NOW,
    });
    const persisted = await repo.persistResult(
      claim!,
      {
        resolutionStatus: "provider_error",
        resolutionStage: "failed",
        pinAccuracy: "address",
        location: null,
        identityProvenance: null,
        geometryProvenance: null,
        complexCorroboration: null,
        resolvedAt: null,
        resolutionFailureCode: "PROVIDER_TIMEOUT",
        resolutionNextAttemptAt: APP_NOW,
        resolutionRetryExhausted: false,
        retryDelayMs: 30_000,
      },
      APP_NOW,
    );
    expect(persisted).toBe(true);
    const persistCall = rpc.calls.find(
      (c) => c.name === RESOLUTION_WORKER_RPC.persist,
    );
    expect(persistCall?.args.p_retry_delay_ms).toBe(30_000);
    expect(persistCall?.args).not.toHaveProperty("p_next_attempt_at");
    const point = await rpc.inner.inspectPoint("p-bo");
    expect(point?.resolutionNextAttemptAt).toEqual(
      new Date(DB_NOW.getTime() + 30_000),
    );
  });

  it("strips PII fetch to address fields and does not log PII", async () => {
    const rpc = new SqlSemanticRpc();
    seedPending(rpc, "p-pii");
    const { repo, loggerWarns } = repoWith(rpc);
    const rows = await repo.fetchPii(["p-pii"]);
    expect(rows[0]?.rawAddress).toBe("road-only");
    expect(JSON.stringify(rows[0])).not.toContain("customer_name");
    expect(loggerWarns.join("\n")).not.toContain("road-only");
  });

  it("authenticated / anon / PUBLIC simulator roles cannot invoke mutation RPCs", async () => {
    const rpc = new SqlSemanticRpc();
    seedPending(rpc, "p-priv");
    const { repo } = repoWith(rpc);
    rpc.role = "authenticated";
    expect(
      await repo.claimBatch({
        plan: [{ driverId: DRIVER_A, limit: 1 }],
        workerId: "w",
        leaseDurationMs: 60_000,
        now: APP_NOW,
      }),
    ).toEqual([]);
    rpc.role = "anon";
    expect(
      await repo.claimBatch({
        plan: [{ driverId: DRIVER_A, limit: 1 }],
        workerId: "w",
        leaseDurationMs: 60_000,
        now: APP_NOW,
      }),
    ).toEqual([]);
    rpc.role = "public";
    expect(
      await repo.claimBatch({
        plan: [{ driverId: DRIVER_A, limit: 1 }],
        workerId: "w",
        leaseDurationMs: 60_000,
        now: APP_NOW,
      }),
    ).toEqual([]);
  });

  it("two workers / two drivers: simulator preserves per-driver caps (not PG proof)", async () => {
    const rpc = new SqlSemanticRpc();
    for (let i = 0; i < 10; i += 1) seedPending(rpc, `a-${i}`, DRIVER_A);
    for (let i = 0; i < 10; i += 1) seedPending(rpc, `b-${i}`, DRIVER_B);
    const { repo } = repoWith(rpc);
    const plan = [
      { driverId: DRIVER_A, limit: 4 },
      { driverId: DRIVER_B, limit: 4 },
    ];
    const w1 = await repo.claimBatch({
      plan,
      workerId: "w1",
      leaseDurationMs: 60_000,
      now: APP_NOW,
    });
    const w2 = await repo.claimBatch({
      plan,
      workerId: "w2",
      leaseDurationMs: 60_000,
      now: APP_NOW,
    });
    expect(w1).toHaveLength(8);
    expect(w2).toHaveLength(8);
    expect(w1.filter((c) => c.driverId === DRIVER_A)).toHaveLength(4);
    const ids = [...w1, ...w2].map((c) => c.pointId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * These require a live Postgres with migration 025 applied.
 * They are intentionally skipped in Jest so they are not mistaken for concurrency proof.
 *
 * Real staging Postgres concurrency/privilege proof:
 *   node apps/api/scripts/staging-resolution-worker-025-gate.cjs
 * (two independent service-role clients; report JSON written beside the script)
 */
describe.skip("STAGING_REQUIRED Postgres repository tests", () => {
  it("atomic claim race with FOR UPDATE SKIP LOCKED", () => undefined);
  it("two worker IDs on real Postgres", () => undefined);
  it("new token on reclaim with DB now()", () => undefined);
  it("DB-time lease expiration semantics", () => undefined);
  it("application clock cannot bypass expired DB lease on Postgres", () => undefined);
  it("execution-start CAS with valid lease", () => undefined);
  it("execution-start CAS after lease expiry", () => undefined);
  it("heartbeat valid lease", () => undefined);
  it("heartbeat expired lease", () => undefined);
  it("heartbeat max reached", () => undefined);
  it("stale token persist", () => undefined);
  it("wrong worker persist", () => undefined);
  it("version changed persist", () => undefined);
  it("driver_verified persist race", () => undefined);
  it("location changed persist race", () => undefined);
  it("resolved BUILDING_CENTER atomic persist", () => undefined);
  it("lower_quality atomic persist", () => undefined);
  it("provider_error retry persist", () => undefined);
  it("retry exhausted persist", () => undefined);
  it("ambiguous/unresolved persist", () => undefined);
  it("bounded backoff", () => undefined);
  it("minimal PII fetch", () => undefined);
  it("no PII in errors/logs", () => undefined);
  it("worker RPC privileges on Postgres", () => undefined);
  it("authenticated client cannot invoke worker mutation RPC", () => undefined);
  it("PUBLIC/anon cannot invoke worker RPC", () => undefined);
  it("fairness with multiple drivers", () => undefined);
  it("fairness with two workers", () => undefined);
  it("no duplicate resolution ownership", () => undefined);
  it("no duplicate delivery objects created", () => undefined);
});
