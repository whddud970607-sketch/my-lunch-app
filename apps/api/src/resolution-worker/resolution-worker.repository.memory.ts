import { randomUUID } from "node:crypto";
import type { ClaimBatchArgs, ResolutionWorkerRepository } from "./resolution-worker.repository.port";
import type {
  PinAccuracyDb,
  ResolutionClaim,
  ResolutionPersistPayload,
  ResolutionPiiFetch,
  ResolutionQueuePoint,
  ResolutionStageDb,
  ResolutionStatusDb,
} from "./resolution-worker.types";

type PointRecord = ResolutionQueuePoint & {
  resolutionStage: ResolutionStageDb;
  identityProvenance: string | null;
  geometryProvenance: string | null;
  complexCorroboration: string | null;
  resolvedAt: Date | null;
  resolutionFailureCode: string | null;
  resolutionClaimedAt: Date | null;
  resolutionLeaseHeartbeatCount: number;
};

type PiiRecord = {
  rawAddress: string | null;
  detailAddress: string | null;
  normalizedAddress: string | null;
};

export class InMemoryResolutionWorkerRepository
  implements ResolutionWorkerRepository
{
  private readonly points = new Map<string, PointRecord>();
  private readonly pii = new Map<string, PiiRecord>();
  private readonly locks = new Map<string, Promise<void>>();

  seedPoint(
    point: Partial<PointRecord> & { id: string; driverId: string },
    pii?: Partial<PiiRecord>,
  ): void {
    this.points.set(point.id, {
      id: point.id,
      driverId: point.driverId,
      resolutionStatus: point.resolutionStatus ?? "pending",
      resolutionStage: point.resolutionStage ?? "pending",
      resolutionVersion: point.resolutionVersion ?? 1,
      resolutionAttemptCount: point.resolutionAttemptCount ?? 0,
      pinAccuracy: point.pinAccuracy ?? "address",
      resolutionNextAttemptAt: point.resolutionNextAttemptAt ?? null,
      resolutionRetryExhausted: point.resolutionRetryExhausted ?? false,
      location: point.location ?? null,
      resolutionClaimedBy: point.resolutionClaimedBy ?? null,
      resolutionClaimToken: point.resolutionClaimToken ?? null,
      resolutionLeaseExpiresAt: point.resolutionLeaseExpiresAt ?? null,
      resolutionClaimedAt: point.resolutionClaimedAt ?? null,
      resolutionLeaseHeartbeatCount: point.resolutionLeaseHeartbeatCount ?? 0,
      identityProvenance: point.identityProvenance ?? null,
      geometryProvenance: point.geometryProvenance ?? null,
      complexCorroboration: point.complexCorroboration ?? null,
      resolvedAt: point.resolvedAt ?? null,
      resolutionFailureCode: point.resolutionFailureCode ?? null,
    });
    if (pii) {
      this.pii.set(point.id, {
        rawAddress: pii.rawAddress ?? null,
        detailAddress: pii.detailAddress ?? null,
        normalizedAddress: pii.normalizedAddress ?? null,
      });
    }
  }

  async listEligibleDriverIds(now: Date): Promise<string[]> {
    const drivers = new Set<string>();
    for (const p of this.points.values()) {
      if (this.isEligible(p, now)) drivers.add(p.driverId);
    }
    return [...drivers].sort();
  }

  async claimBatch(args: ClaimBatchArgs): Promise<ResolutionClaim[]> {
    const claims: ResolutionClaim[] = [];
    for (const { driverId, limit } of args.plan) {
      const candidates = [...this.points.values()]
        .filter((p) => p.driverId === driverId && this.isEligible(p, args.now))
        .sort((a, b) => {
          const an = a.resolutionNextAttemptAt?.getTime() ?? 0;
          const bn = b.resolutionNextAttemptAt?.getTime() ?? 0;
          if (an !== bn) return an - bn;
          return a.id.localeCompare(b.id);
        });

      let claimed = 0;
      for (const point of candidates) {
        if (claimed >= limit) break;
        const claim = await this.withPointLock(point.id, () =>
          this.tryClaimPoint(point.id, args),
        );
        if (claim) {
          claims.push(claim);
          claimed += 1;
        }
      }
    }
    return claims;
  }

  async fetchPii(pointIds: string[]): Promise<ResolutionPiiFetch[]> {
    return pointIds.map((pointId) => {
      const row = this.pii.get(pointId);
      return {
        pointId,
        rawAddress: row?.rawAddress ?? null,
        detailAddress: row?.detailAddress ?? null,
        normalizedAddress: row?.normalizedAddress ?? null,
      };
    });
  }

  async executionStartCas(
    claim: ResolutionClaim,
    now: Date,
  ): Promise<boolean> {
    return this.withPointLock(claim.pointId, () => {
      const p = this.points.get(claim.pointId);
      if (!p || !this.claimMatches(p, claim, now)) return false;
      if (!this.isEligibleExceptLease(p, now)) return false;
      p.resolutionAttemptCount += 1;
      return true;
    });
  }

  async heartbeat(
    claim: ResolutionClaim,
    args: { leaseDurationMs: number; maxHeartbeats: number; now: Date },
  ): Promise<boolean> {
    return this.withPointLock(claim.pointId, () => {
      const p = this.points.get(claim.pointId);
      if (!p || !this.claimMatches(p, claim, args.now)) return false;
      if (p.pinAccuracy === "driver_verified") return false;
      if (p.location != null) return false;
      if (p.resolutionLeaseHeartbeatCount >= args.maxHeartbeats) return false;
      if (!p.resolutionLeaseExpiresAt || p.resolutionLeaseExpiresAt <= args.now) {
        return false;
      }
      p.resolutionLeaseHeartbeatCount += 1;
      p.resolutionLeaseExpiresAt = new Date(
        args.now.getTime() + args.leaseDurationMs,
      );
      return true;
    });
  }

  async persistResult(
    claim: ResolutionClaim,
    payload: ResolutionPersistPayload,
    now: Date,
  ): Promise<boolean> {
    return this.withPointLock(claim.pointId, () => {
      const p = this.points.get(claim.pointId);
      if (!p) return false;
      if (p.location != null) return false;
      if (p.pinAccuracy === "driver_verified") return false;
      if (p.resolutionVersion !== claim.resolutionVersion) return false;
      if (p.resolutionClaimedBy !== claim.claimedBy) return false;
      if (p.resolutionClaimToken !== claim.claimToken) return false;
      if (!p.resolutionLeaseExpiresAt || p.resolutionLeaseExpiresAt <= now) {
        return false;
      }
      if (
        p.resolutionStatus !== "pending" &&
        p.resolutionStatus !== "provider_error"
      ) {
        return false;
      }

      p.resolutionStatus = payload.resolutionStatus;
      p.resolutionStage = payload.resolutionStage;
      p.pinAccuracy = payload.pinAccuracy;
      p.location = payload.location;
      p.identityProvenance = payload.identityProvenance;
      p.geometryProvenance = payload.geometryProvenance;
      p.complexCorroboration = payload.complexCorroboration;
      p.resolvedAt = payload.resolvedAt;
      p.resolutionFailureCode = payload.resolutionFailureCode;
      p.resolutionNextAttemptAt = payload.resolutionNextAttemptAt;
      p.resolutionRetryExhausted = payload.resolutionRetryExhausted;
      this.clearClaim(p);

      if (payload.normalizedAddress !== undefined) {
        const row = this.pii.get(claim.pointId) ?? {
          rawAddress: null,
          detailAddress: null,
          normalizedAddress: null,
        };
        row.normalizedAddress = payload.normalizedAddress;
        this.pii.set(claim.pointId, row);
      }
      return true;
    });
  }

  async releaseClaim(claim: ResolutionClaim, _now: Date): Promise<void> {
    await this.withPointLock(claim.pointId, () => {
      const p = this.points.get(claim.pointId);
      if (!p) return;
      if (p.resolutionClaimToken === claim.claimToken) {
        this.clearClaim(p);
      }
    });
  }

  async manualRequeue(pointId: string, now: Date): Promise<boolean> {
    return this.withPointLock(pointId, () => {
      const p = this.points.get(pointId);
      if (!p) return false;
      p.resolutionVersion += 1;
      p.resolutionStatus = "pending";
      p.resolutionStage = "pending";
      p.resolutionAttemptCount = 0;
      p.resolutionRetryExhausted = false;
      p.resolutionNextAttemptAt = now;
      p.resolutionFailureCode = null;
      this.clearClaim(p);
      return true;
    });
  }

  async getPoint(pointId: string): Promise<ResolutionQueuePoint | null> {
    const p = this.points.get(pointId);
    return p ? { ...p } : null;
  }

  /** Test helper — full row including failure code. */
  async inspectPoint(pointId: string): Promise<PointRecord | null> {
    const p = this.points.get(pointId);
    return p ? { ...p } : null;
  }

  private tryClaimPoint(
    pointId: string,
    args: ClaimBatchArgs,
  ): ResolutionClaim | null {
    const p = this.points.get(pointId);
    if (!p || !this.isEligible(p, args.now)) return null;

    const claimToken = randomUUID();
    const leaseExpiresAt = new Date(args.now.getTime() + args.leaseDurationMs);
    p.resolutionClaimedAt = args.now;
    p.resolutionClaimedBy = args.workerId;
    p.resolutionClaimToken = claimToken;
    p.resolutionLeaseExpiresAt = leaseExpiresAt;
    p.resolutionLeaseHeartbeatCount = 0;

    return {
      pointId: p.id,
      driverId: p.driverId,
      claimToken,
      claimedBy: args.workerId,
      claimedAt: args.now,
      leaseExpiresAt,
      resolutionVersion: p.resolutionVersion,
      resolutionAttemptCount: p.resolutionAttemptCount,
    };
  }

  private clearClaim(p: PointRecord): void {
    p.resolutionClaimedAt = null;
    p.resolutionClaimedBy = null;
    p.resolutionClaimToken = null;
    p.resolutionLeaseExpiresAt = null;
    p.resolutionLeaseHeartbeatCount = 0;
  }

  private isEligible(p: PointRecord, now: Date): boolean {
    if (!this.isEligibleExceptLease(p, now)) return false;
    if (p.resolutionClaimedBy && p.resolutionLeaseExpiresAt) {
      if (p.resolutionLeaseExpiresAt > now) return false;
    }
    return true;
  }

  private isEligibleExceptLease(p: PointRecord, now: Date): boolean {
    if (p.resolutionStatus !== "pending" && p.resolutionStatus !== "provider_error") {
      return false;
    }
    if (p.location != null) return false;
    if (p.pinAccuracy === "driver_verified") return false;
    if (p.resolutionRetryExhausted) return false;
    if (p.resolutionNextAttemptAt && p.resolutionNextAttemptAt > now) {
      return false;
    }
    return true;
  }

  private claimMatches(
    p: PointRecord,
    claim: ResolutionClaim,
    now: Date,
  ): boolean {
    return (
      p.resolutionClaimToken === claim.claimToken &&
      p.resolutionClaimedBy === claim.claimedBy &&
      p.resolutionVersion === claim.resolutionVersion &&
      Boolean(p.resolutionLeaseExpiresAt && p.resolutionLeaseExpiresAt > now)
    );
  }

  private async withPointLock<T>(
    pointId: string,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    const prev = this.locks.get(pointId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(
      pointId,
      prev.then(() => gate),
    );
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
