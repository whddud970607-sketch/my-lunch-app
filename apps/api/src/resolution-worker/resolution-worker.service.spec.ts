import type { AddressResolutionResult } from "../address/address.types";
import { AddressResolutionService } from "../address/address-resolution.service";
import { assertNoSensitiveLeak } from "../address/building/diagnostic-redaction";
import { DEFAULT_RESOLUTION_WORKER_CONFIG } from "./resolution-worker.config";
import { InMemoryResolutionWorkerRepository } from "./resolution-worker.repository.memory";
import { RESOLUTION_WORKER_REPOSITORY } from "./resolution-worker.repository.port";
import { ResolutionWorkerService } from "./resolution-worker.service";
import { ResolutionProviderCallError } from "./resolution-worker.types";
import { formatSafeWorkerLog } from "./resolution-worker.metrics";

const NOW = new Date("2026-09-02T12:00:00.000Z");
const DRIVER_A = "11111111-1111-4111-8111-111111111111";
const DRIVER_B = "22222222-2222-4222-8222-222222222222";

function verifiedResult(): AddressResolutionResult {
  return {
    parsed: {
      originalAddress: "인천광역시 남동구 테스트로 1",
      roadAddress: "인천광역시 남동구 테스트로 1",
      lotAddress: null,
      complexName: null,
      buildingName: null,
      dong: "101",
      ho: "503",
      postalCode: null,
      normalizedAddress: "인천광역시 남동구 테스트로 1",
      detailAddress: "101동 503호",
    },
    decision: {
      candidate: {
        latitude: 37.4,
        longitude: 126.7,
        provider: "public_building",
        sourceType: "building_hub",
        coordinateType: "BUILDING_CENTER",
        confidence: 0.95,
        evidence: [
          "building_hub_identity_verified",
          "vworld_exact_pnu_dong_geometry",
          "complex_corroboration=MATCHING",
        ],
        createdAt: NOW.toISOString(),
      },
      pinQuality: "VERIFIED",
      pinAccuracy: "building",
      unresolvedReason: null,
      failureMessage: null,
      allCandidates: [],
      requiresDong: false,
    },
  };
}

function setupWorker(args?: {
  resolve?: jest.Mock;
  config?: Partial<typeof DEFAULT_RESOLUTION_WORKER_CONFIG>;
  workerId?: string;
}) {
  const repo = new InMemoryResolutionWorkerRepository();
  const resolve =
    args?.resolve ?? jest.fn().mockResolvedValue(verifiedResult());
  const resolver = { resolve } as unknown as AddressResolutionService;
  const service = new ResolutionWorkerService(resolver, repo);
  const cfg = { ...DEFAULT_RESOLUTION_WORKER_CONFIG, ...args?.config };
  (service as unknown as { config: typeof cfg }).config = cfg;
  if (args?.workerId) {
    (service as unknown as { workerId: string }).workerId = args.workerId;
  }
  return { service, repo, resolve };
}

function seedPending(
  repo: InMemoryResolutionWorkerRepository,
  id: string,
  driverId: string,
  overrides: Record<string, unknown> = {},
) {
  repo.seedPoint(
    {
      id,
      driverId,
      resolutionStatus: "pending",
      resolutionStage: "pending",
      resolutionVersion: 1,
      resolutionAttemptCount: 0,
      pinAccuracy: "address",
      location: null,
      ...overrides,
    },
    {
      rawAddress: "인천광역시 남동구 테스트로 1",
      detailAddress: "101동 503호",
    },
  );
}

describe("ResolutionWorkerService", () => {
  it("two workers race for the same point — only one claims", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    const resolve = jest.fn().mockResolvedValue(verifiedResult());
    const resolver = { resolve } as unknown as AddressResolutionService;
    const workerA = new ResolutionWorkerService(resolver, repo);
    const workerB = new ResolutionWorkerService(resolver, repo);
    (workerA as unknown as { workerId: string }).workerId = "worker-a";
    (workerB as unknown as { workerId: string }).workerId = "worker-b";
    seedPending(repo, "point-1", DRIVER_A);

    const [claimsA, claimsB] = await Promise.all([
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

    expect(claimsA.length + claimsB.length).toBe(1);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("reclaims point after lease expiry", async () => {
    const { repo } = setupWorker({
      config: { leaseDurationMs: 1_000 },
    });
    seedPending(repo, "point-lease", DRIVER_A);
    const first = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "worker-reclaim",
      leaseDurationMs: 1_000,
      now: NOW,
    });
    expect(first).toHaveLength(1);

    const later = new Date(NOW.getTime() + 5_000);
    const second = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "worker-reclaim-2",
      leaseDurationMs: 60_000,
      now: later,
    });
    expect(second).toHaveLength(1);
    expect(second[0]?.claimedBy).toBe("worker-reclaim-2");
  });

  it("supports bounded heartbeat extensions", async () => {
    const { service, repo } = setupWorker({
      config: { leaseDurationMs: 5_000, maxHeartbeats: 3 },
    });
    seedPending(repo, "point-hb", DRIVER_A);
    const claims = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: service.getWorkerId(),
      leaseDurationMs: 5_000,
      now: NOW,
    });
    const claim = claims[0]!;

    expect(await service.heartbeatLease(claim, NOW)).toBe(true);
    expect(await service.heartbeatLease(claim, NOW)).toBe(true);
    expect(await service.heartbeatLease(claim, NOW)).toBe(true);
    expect(await service.heartbeatLease(claim, NOW)).toBe(false);
  });

  it("rejects heartbeat after lease expiry", async () => {
    const { service, repo } = setupWorker({ config: { leaseDurationMs: 1_000 } });
    seedPending(repo, "point-hb-exp", DRIVER_A);
    const claims = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: service.getWorkerId(),
      leaseDurationMs: 1_000,
      now: NOW,
    });
    const claim = claims[0]!;
    const expired = new Date(NOW.getTime() + 2_000);
    expect(await service.heartbeatLease(claim, expired)).toBe(false);
  });

  it("rejects persist with stale token after reclaim", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    seedPending(repo, "point-stale", DRIVER_A);
    const first = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "worker-old",
      leaseDurationMs: 1,
      now: NOW,
    });
    const staleClaim = first[0]!;
    await new Promise((r) => setTimeout(r, 5));
    const second = await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "worker-new",
      leaseDurationMs: 60_000,
      now: new Date(NOW.getTime() + 10),
    });
    expect(second).toHaveLength(1);

    const persisted = await repo.persistResult(
      staleClaim,
      {
        resolutionStatus: "resolved",
        resolutionStage: "building_center",
        pinAccuracy: "building",
        location: { latitude: 1, longitude: 2 },
        identityProvenance: null,
        geometryProvenance: null,
        complexCorroboration: null,
        resolvedAt: NOW,
        resolutionFailureCode: null,
        resolutionNextAttemptAt: null,
        resolutionRetryExhausted: false,
      },
      new Date(NOW.getTime() + 10),
    );
    expect(persisted).toBe(false);
    const point = await repo.getPoint("point-stale");
    expect(point?.resolutionClaimedBy).toBe("worker-new");
  });

  it("prevents persist when driver_verified is set during provider call", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    seedPending(repo, "point-dv", DRIVER_A);
    const resolve = jest.fn().mockImplementation(async () => {
      const p = await repo.inspectPoint("point-dv");
      if (p) {
        repo.seedPoint({ ...p, pinAccuracy: "driver_verified" });
      }
      return verifiedResult();
    });
    const { service } = setupWorker({ resolve });
    (service as unknown as { repository: InMemoryResolutionWorkerRepository }).repository =
      repo;

    await service.pollOnce(NOW);
    const point = await repo.inspectPoint("point-dv");
    expect(point?.pinAccuracy).toBe("driver_verified");
    expect(point?.resolutionStatus).toBe("pending");
    expect(point?.location).toBeNull();
  });

  it("prevents persist when resolution_version bumps during provider call", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    seedPending(repo, "point-ver", DRIVER_A);
    const resolve = jest.fn().mockImplementation(async () => {
      const p = await repo.inspectPoint("point-ver");
      if (p) {
        p.resolutionVersion += 1;
        repo.seedPoint(p);
      }
      return verifiedResult();
    });
    const { service } = setupWorker({ resolve });
    (service as unknown as { repository: InMemoryResolutionWorkerRepository }).repository =
      repo;

    await service.pollOnce(NOW);
    const point = await repo.inspectPoint("point-ver");
    expect(point?.resolutionStatus).toBe("pending");
    expect(point?.location).toBeNull();
  });

  it("prevents persist when location is set during provider call", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    seedPending(repo, "point-loc", DRIVER_A);
    const resolve = jest.fn().mockImplementation(async () => {
      const p = await repo.inspectPoint("point-loc");
      if (p) {
        repo.seedPoint({ ...p, location: { latitude: 9, longitude: 9 } });
      }
      return verifiedResult();
    });
    const { service } = setupWorker({ resolve });
    (service as unknown as { repository: InMemoryResolutionWorkerRepository }).repository =
      repo;

    await service.pollOnce(NOW);
    const point = await repo.inspectPoint("point-loc");
    expect(point?.location).toEqual({ latitude: 9, longitude: 9 });
    expect(point?.resolutionStatus).toBe("pending");
  });

  it("claim without execution start does not consume attempt_count", async () => {
    const { repo } = setupWorker();
    seedPending(repo, "point-no-exec", DRIVER_A);
    await repo.claimBatch({
      plan: [{ driverId: DRIVER_A, limit: 1 }],
      workerId: "worker-x",
      leaseDurationMs: 60_000,
      now: NOW,
    });
    const point = await repo.getPoint("point-no-exec");
    expect(point?.resolutionAttemptCount).toBe(0);
  });

  it("execution start increments attempt_count exactly once", async () => {
    const { service, repo } = setupWorker();
    seedPending(repo, "point-attempt", DRIVER_A);
    await service.pollOnce(NOW);
    const point = await repo.getPoint("point-attempt");
    expect(point?.resolutionAttemptCount).toBe(1);
  });

  it("does not call AddressResolutionService when execution start CAS fails", async () => {
    const { service, repo, resolve } = setupWorker();
    seedPending(repo, "point-cas", DRIVER_A);
    const casSpy = jest
      .spyOn(repo, "executionStartCas")
      .mockResolvedValue(false);

    await service.pollOnce(NOW);
    expect(resolve).not.toHaveBeenCalled();
    casSpy.mockRestore();
  });

  it("records provider timeout retry as provider_error", async () => {
    const resolve = jest
      .fn()
      .mockRejectedValue(new ResolutionProviderCallError("timeout"));
    const { service, repo } = setupWorker({ resolve, config: { maxAttempts: 8 } });
    seedPending(repo, "point-timeout", DRIVER_A);
    await service.pollOnce(NOW);
    const point = await repo.inspectPoint("point-timeout");
    expect(point?.resolutionStatus).toBe("provider_error");
    expect(point?.resolutionFailureCode).toBe("PROVIDER_TIMEOUT");
    expect(point?.resolutionNextAttemptAt).not.toBeNull();
  });

  it("manual requeue resets retry state and bumps version", async () => {
    const { service, repo } = setupWorker();
    seedPending(repo, "point-req", DRIVER_A, {
      resolutionStatus: "provider_error",
      resolutionRetryExhausted: true,
      resolutionAttemptCount: 8,
      resolutionFailureCode: "PROVIDER_TIMEOUT",
    });
    const ok = await service.manualRequeue("point-req", NOW);
    expect(ok).toBe(true);
    const point = await repo.getPoint("point-req");
    expect(point?.resolutionStatus).toBe("pending");
    expect(point?.resolutionRetryExhausted).toBe(false);
    expect(point?.resolutionAttemptCount).toBe(0);
    expect(point?.resolutionVersion).toBe(2);
  });

  it("does not persist after stale claim ownership is lost", async () => {
    const repo = new InMemoryResolutionWorkerRepository();
    const resolve = jest.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 15));
      return verifiedResult();
    });
    const { service } = setupWorker({
      resolve,
      config: { leaseDurationMs: 5 },
    });
    (service as unknown as { repository: InMemoryResolutionWorkerRepository }).repository =
      repo;
    seedPending(repo, "point-stale-persist", DRIVER_A);
    await service.pollOnce(NOW);
    const point = await repo.getPoint("point-stale-persist");
    expect(point?.resolutionStatus).toBe("pending");
    expect(service.metrics.getSnapshot().staleWritePreventedTotal).toBeGreaterThan(0);
  });

  it("fairness: heavy driver does not consume entire batch", async () => {
    const { service, repo } = setupWorker({
      config: { batchSize: 32, perDriverCap: 4 },
    });
    for (let i = 0; i < 2000; i += 1) {
      seedPending(repo, `heavy-${i}`, DRIVER_A);
    }
    for (let i = 0; i < 10; i += 1) {
      seedPending(repo, `light-${i}`, DRIVER_B);
    }
    const claimed = await service.pollOnce(NOW);
    expect(claimed).toBe(8);
    const heavyResolved = (
      await Promise.all(
        Array.from({ length: 2000 }, (_, i) => repo.getPoint(`heavy-${i}`)),
      )
    ).filter((p) => p?.resolutionStatus === "resolved").length;
    const lightResolved = (
      await Promise.all(
        Array.from({ length: 10 }, (_, i) => repo.getPoint(`light-${i}`)),
      )
    ).filter((p) => p?.resolutionStatus === "resolved").length;
    expect(heavyResolved).toBeLessThanOrEqual(4);
    expect(lightResolved).toBeLessThanOrEqual(4);
    expect(heavyResolved + lightResolved).toBe(8);
  });

  it("redacts PII from worker logs", () => {
    const line = formatSafeWorkerLog({
      pointId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      result: "resolved",
      attemptCount: 1,
      rawAddress: "인천광역시 남동구 비밀주소 1",
      customerName: "홍길동",
      phone: "010-1234-5678",
    });
    expect(line).not.toContain("인천");
    expect(line).not.toContain("홍길동");
    expect(line).not.toContain("010");
    expect(assertNoSensitiveLeak(line)).toBe(true);
  });

  it("poll does not create duplicate delivery objects", async () => {
    const { service, repo } = setupWorker();
    seedPending(repo, "only-point", DRIVER_A);
    const before = (repo as unknown as { points: Map<string, unknown> }).points
      .size;
    await service.pollOnce(NOW);
    const after = (repo as unknown as { points: Map<string, unknown> }).points
      .size;
    expect(after).toBe(before);
  });

  it("default worker feature flag is off", () => {
    const { service } = setupWorker();
    expect(service.isEnabled()).toBe(false);
  });

  it("maps verified building center through full worker flow", async () => {
    const { service, repo } = setupWorker();
    seedPending(repo, "point-bc", DRIVER_A);
    await service.pollOnce(NOW);
    const point = await repo.getPoint("point-bc");
    expect(point?.resolutionStatus).toBe("resolved");
    expect(point?.pinAccuracy).toBe("building");
  });

  it("repository token is injectable", () => {
    expect(RESOLUTION_WORKER_REPOSITORY).toBeDefined();
  });
});
