import { Test } from "@nestjs/testing";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DeliveriesRepository } from "../deliveries/deliveries.repository";
import { AccessSecretsRepository } from "./access-secrets.repository";
import { AccessSecretsService } from "./access-secrets.service";

describe("AccessSecretsService", () => {
  const driverA = "11111111-1111-1111-1111-111111111111";
  const driverB = "22222222-2222-2222-2222-222222222222";
  const pointOpen = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const pointCompleted = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  let service: AccessSecretsService;
  let repo: jest.Mocked<AccessSecretsRepository>;
  let deliveries: jest.Mocked<DeliveriesRepository>;

  beforeEach(async () => {
    repo = {
      listPointIdsWithAccessInfo: jest.fn(async () => new Set([pointOpen])),
      findSecretForPoint: jest.fn(async () => ({
        point_id: pointOpen,
        job_id: "job-1",
        driver_id: driverA,
        access_info_ciphertext: "cipher",
        access_info_nonce: "nonce",
        access_info_key_version: 1,
        access_info_expires_at: null,
        access_info_purged_at: null,
      })),
      insertReadAccessAudit: jest.fn(async () => true),
    } as unknown as jest.Mocked<AccessSecretsRepository>;

    deliveries = {
      findPointForDriver: jest.fn(async (_c, driverId, pointId) => {
        if (driverId !== driverA) return null;
        if (pointId === pointCompleted) {
          return {
            id: pointId,
            job_id: "job-1",
            driver_id: driverA,
            status: "completed",
            pii_masked_at: "2026-08-30T00:00:00Z",
          } as never;
        }
        if (pointId === pointOpen) {
          return {
            id: pointId,
            job_id: "job-1",
            driver_id: driverA,
            status: "pending",
            pii_masked_at: null,
          } as never;
        }
        return null;
      }),
      listPointsForDriverByIds: jest.fn(async (_c, driverId, ids: string[]) => {
        if (driverId !== driverA) return [];
        return ids
          .filter((id: string) => id === pointOpen)
          .map((id: string) => ({
            id,
            job_id: "job-1",
            driver_id: driverA,
            status: "pending",
            pii_masked_at: null,
          })) as never[];
      }),
    } as unknown as jest.Mocked<DeliveriesRepository>;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AccessSecretsService,
        { provide: AccessSecretsRepository, useValue: repo },
        { provide: DeliveriesRepository, useValue: deliveries },
      ],
    }).compile();

    service = moduleRef.get(AccessSecretsService);
  });

  it("listPointIdsWithAccessInfo scopes to eligible driver-owned points", async () => {
    const out = await service.listPointIdsWithAccessInfo(
      {} as SupabaseClient,
      driverA,
      [pointOpen, pointCompleted],
    );
    expect(out.has(pointOpen)).toBe(true);
    expect(repo.listPointIdsWithAccessInfo).toHaveBeenCalledWith(
      [pointOpen],
      driverA,
    );
  });

  it("listPointIdsWithAccessInfo returns empty for cross-driver", async () => {
    const out = await service.listPointIdsWithAccessInfo(
      {} as SupabaseClient,
      driverB,
      [pointOpen],
    );
    expect(out.size).toBe(0);
    expect(repo.listPointIdsWithAccessInfo).not.toHaveBeenCalled();
  });

  it("findSecretForAssignedPoint denies completed point", async () => {
    const secret = await service.findSecretForAssignedPoint(
      {} as SupabaseClient,
      driverA,
      pointCompleted,
    );
    expect(secret).toBeNull();
    expect(repo.findSecretForPoint).not.toHaveBeenCalled();
  });

  it("findSecretForAssignedPoint denies cross-driver", async () => {
    const secret = await service.findSecretForAssignedPoint(
      {} as SupabaseClient,
      driverB,
      pointOpen,
    );
    expect(secret).toBeNull();
    expect(repo.findSecretForPoint).not.toHaveBeenCalled();
  });

  it("findSecretForAssignedPoint returns secret for eligible point", async () => {
    const secret = await service.findSecretForAssignedPoint(
      {} as SupabaseClient,
      driverA,
      pointOpen,
    );
    expect(secret?.point_id).toBe(pointOpen);
    expect(repo.findSecretForPoint).toHaveBeenCalledWith(pointOpen, driverA);
  });

  it("findSecretForAssignedPoint denies stale secret driver_id vs point", async () => {
    repo.findSecretForPoint.mockResolvedValue({
      point_id: pointOpen,
      job_id: "job-1",
      driver_id: driverB,
      access_info_ciphertext: "cipher",
      access_info_nonce: "nonce",
      access_info_key_version: 1,
      access_info_expires_at: null,
      access_info_purged_at: null,
    });
    const secret = await service.findSecretForAssignedPoint(
      {} as SupabaseClient,
      driverA,
      pointOpen,
    );
    expect(secret).toBeNull();
  });
});
