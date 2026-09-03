import { InMemoryResolutionWorkerRepository } from "./resolution-worker.repository.memory";
import type { ResolutionClaim, ResolutionPersistPayload } from "./resolution-worker.types";

const NOW = new Date("2026-09-03T00:00:00.000Z");
const DRIVER_A = "11111111-1111-4111-8111-111111111111";
const DRIVER_B = "22222222-2222-4222-8222-222222222222";

function pending(
  repo: InMemoryResolutionWorkerRepository,
  id: string,
  driverId = DRIVER_A,
) {
  repo.seedPoint(
    {
      id,
      driverId,
      resolutionStatus: "pending",
      pinAccuracy: "address",
      location: null,
    },
    {
      rawAddress: "road-only",
      detailAddress: "101",
      normalizedAddress: null,
    },
  );
}

function resolvedPayload(): ResolutionPersistPayload {
  return {
    resolutionStatus: "resolved",
    resolutionStage: "building_center",
    pinAccuracy: "building",
    location: { latitude: 37.4, longitude: 126.7 },
    identityProvenance: "BUILDING_HUB_VERIFIED",
    geometryProvenance: "VWORLD_EXACT_PNU_DONG_FEATURE",
    complexCorroboration: "MATCHING",
    resolvedAt: NOW,
    resolutionFailureCode: null,
    resolutionNextAttemptAt: null,
    resolutionRetryExhausted: false,
    normalizedAddress: "normalized",
  };
}

describe("InMemoryResolutionWorkerRepository (unit)", () => {
  it("atomic claim race: two worker IDs, one owner", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    pending(repo, "p1");
    const [a, b] = await Promise.all([
      repo.claimBatch({
        plan: [{ driverId: DRIVER_A, limit: 1 }],
        workerId: "worker-a",
        leaseDurationMs: 60_000,
        now: NOW,
      }),
      repo.claimBatch({
        plan: [{ driverId: DRIVER_A, limit: 1 }],
        workerId: "worker-b",
        leaseDurationMs: 60_000,
        now: NOW,
      }),
    ]);
    expect(a.length + b.length).toBe(1);
  });

  it("issues a new token on reclaim after lease expiry", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    pending(repo, "p-reclaim");
    const first = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w1",
      leaseDurationMs: 1_000,
      now: NOW,
    });
    const second = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w2",
      leaseDurationMs: 1_000,
      now: new Date(NOW.getTime() + 2_000),
    });
    expect(second).toHaveLength(1);
    expect(second[0]?.claimToken).not.toBe(first[0]?.claimToken);
    expect(second[0]?.claimedBy).toBe("w2");
  });

  it("execution-start CAS succeeds with a valid lease and fails after expiry", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    pending(repo, "p-cas");
    const [claim] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 1_000,
      now: NOW,
    });
    expect(await repo.executionStartCas(claim!, NOW)).toBe(true);
    expect(await repo.executionStartCas(claim!, new Date(NOW.getTime() + 5_000))).toBe(
      false,
    );
  });

  it("heartbeat: valid, expired, and max reached", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    pending(repo, "p-hb");
    const [claim] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 5_000,
      now: NOW,
    });
    const args = { leaseDurationMs: 5_000, maxHeartbeats: 1, now: NOW };
    expect(await repo.heartbeat(claim!, args)).toBe(true);
    expect(await repo.heartbeat(claim!, args)).toBe(false);
    pending(repo, "p-hb-exp");
    const [expiredClaim] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 1_000,
      now: NOW,
    });
    expect(
      await repo.heartbeat(expiredClaim!, {
        leaseDurationMs: 1_000,
        maxHeartbeats: 3,
        now: new Date(NOW.getTime() + 2_000),
      }),
    ).toBe(false);
  });

  it("rejects persist for stale token, wrong worker, and version change", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    pending(repo, "p-stale");
    const [oldClaim] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "old",
      leaseDurationMs: 1,
      now: NOW,
    });
    const [fresh] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "new",
      leaseDurationMs: 60_000,
      now: new Date(NOW.getTime() + 10),
    });
    expect(
      await repo.persistResult(oldClaim!, resolvedPayload(), new Date(NOW.getTime() + 10)),
    ).toBe(false);

    const wrongWorker: ResolutionClaim = { ...fresh!, claimedBy: "intruder" };
    expect(await repo.persistResult(wrongWorker, resolvedPayload(), NOW)).toBe(false);

    const wrongVersion: ResolutionClaim = {
      ...fresh!,
      resolutionVersion: fresh!.resolutionVersion + 1,
    };
    expect(await repo.persistResult(wrongVersion, resolvedPayload(), NOW)).toBe(false);
  });

  it("rejects persist when driver_verified or location changed", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    pending(repo, "p-dv");
    const [claim] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 60_000,
      now: NOW,
    });
    const row = await repo.inspectPoint("p-dv");
    repo.seedPoint({ ...row!, pinAccuracy: "driver_verified" });
    expect(await repo.persistResult(claim!, resolvedPayload(), NOW)).toBe(false);

    pending(repo, "p-loc");
    const [claim2] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 60_000,
      now: NOW,
    });
    const row2 = await repo.inspectPoint("p-loc");
    repo.seedPoint({ ...row2!, location: { latitude: 1, longitude: 1 } });
    expect(await repo.persistResult(claim2!, resolvedPayload(), NOW)).toBe(false);
  });

  it("persists BUILDING_CENTER, lower_quality, provider_error, exhausted, and terminal", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    pending(repo, "p-bc");
    const [bc] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 60_000,
      now: NOW,
    });
    expect(await repo.persistResult(bc!, resolvedPayload(), NOW)).toBe(true);
    expect((await repo.getPoint("p-bc"))?.resolutionStatus).toBe("resolved");

    pending(repo, "p-lq");
    const [lq] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 60_000,
      now: NOW,
    });
    expect(
      await repo.persistResult(
        lq!,
        {
          ...resolvedPayload(),
          resolutionStatus: "lower_quality",
          resolutionStage: "address_normalized",
          pinAccuracy: "address",
          identityProvenance: null,
          geometryProvenance: "KAKAO_GEOCODE",
        },
        NOW,
      ),
    ).toBe(true);

    pending(repo, "p-pe");
    const [pe] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 60_000,
      now: NOW,
    });
    const next = new Date(NOW.getTime() + 30_000);
    expect(
      await repo.persistResult(
        pe!,
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
          resolutionNextAttemptAt: next,
          resolutionRetryExhausted: false,
          retryDelayMs: 30_000,
        },
        NOW,
      ),
    ).toBe(true);
    expect((await repo.getPoint("p-pe"))?.resolutionNextAttemptAt).toEqual(next);

    pending(repo, "p-ex");
    const [ex] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 60_000,
      now: NOW,
    });
    expect(
      await repo.persistResult(
        ex!,
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
          resolutionNextAttemptAt: null,
          resolutionRetryExhausted: true,
        },
        NOW,
      ),
    ).toBe(true);
    const exhausted = await repo.inspectPoint("p-ex");
    expect(exhausted?.resolutionRetryExhausted).toBe(true);
    expect(exhausted?.resolutionFailureCode).toBe("PROVIDER_TIMEOUT");

    pending(repo, "p-amb");
    const [amb] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 60_000,
      now: NOW,
    });
    expect(
      await repo.persistResult(
        amb!,
        {
          resolutionStatus: "ambiguous",
          resolutionStage: "failed",
          pinAccuracy: "address",
          location: null,
          identityProvenance: null,
          geometryProvenance: null,
          complexCorroboration: null,
          resolvedAt: null,
          resolutionFailureCode: "QUALITY_GATE_REJECTED",
          resolutionNextAttemptAt: null,
          resolutionRetryExhausted: false,
        },
        NOW,
      ),
    ).toBe(true);
    expect((await repo.inspectPoint("p-amb"))?.resolvedAt).toBeNull();
  });

  it("fetches only address PII fields", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    pending(repo, "p-pii");
    const rows = await repo.fetchPii(["p-pii"]);
    expect(rows[0]).toEqual({
      pointId: "p-pii",
      rawAddress: "road-only",
      detailAddress: "101",
      normalizedAddress: null,
    });
    expect(JSON.stringify(rows)).not.toContain("customer");
    expect(JSON.stringify(rows)).not.toContain("phone");
  });

  it("fairness: per-driver cap holds for multiple drivers and two workers", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    for (let i = 0; i < 10; i += 1) pending(repo, `a-${i}`, DRIVER_A);
    for (let i = 0; i < 10; i += 1) pending(repo, `b-${i}`, DRIVER_B);
    const plan = [
      { driverId: DRIVER_A, limit: 4 },
      { driverId: DRIVER_B, limit: 4 },
    ];
    const w1 = await repo.claimBatch({
      plan,
      workerId: "w1",
      leaseDurationMs: 60_000,
      now: NOW,
    });
    const w2 = await repo.claimBatch({
      plan,
      workerId: "w2",
      leaseDurationMs: 60_000,
      now: NOW,
    });
    const byDriver = (claims: typeof w1) => {
      const counts = new Map<string, number>();
      for (const c of claims) {
        counts.set(c.driverId, (counts.get(c.driverId) ?? 0) + 1);
      }
      return counts;
    };
    expect(w1).toHaveLength(8);
    expect(byDriver(w1).get(DRIVER_A)).toBe(4);
    expect(byDriver(w1).get(DRIVER_B)).toBe(4);
    expect(w2).toHaveLength(8);
    expect([...w1, ...w2].map((c) => c.pointId).sort()).toEqual(
      [...new Set([...w1, ...w2].map((c) => c.pointId))].sort(),
    );
  });

  it("does not create duplicate delivery objects", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    pending(repo, "only");
    const before = (repo as unknown as { points: Map<string, unknown> }).points.size;
    const [claim] = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "w",
      leaseDurationMs: 60_000,
      now: NOW,
    });
    await repo.persistResult(claim!, resolvedPayload(), NOW);
    const after = (repo as unknown as { points: Map<string, unknown> }).points.size;
    expect(after).toBe(before);
  });
});
