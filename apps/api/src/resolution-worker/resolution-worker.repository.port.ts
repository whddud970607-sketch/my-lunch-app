import type {
  ResolutionClaim,
  ResolutionPersistPayload,
  ResolutionPiiFetch,
  ResolutionQueuePoint,
} from "./resolution-worker.types";

export const RESOLUTION_WORKER_REPOSITORY = Symbol(
  "RESOLUTION_WORKER_REPOSITORY",
);

export type ClaimBatchArgs = {
  plan: Array<{ driverId: string; limit: number }>;
  workerId: string;
  leaseDurationMs: number;
  now: Date;
};

export interface ResolutionWorkerRepository {
  listEligibleDriverIds(now: Date): Promise<string[]>;

  claimBatch(args: ClaimBatchArgs): Promise<ResolutionClaim[]>;

  fetchPii(pointIds: string[]): Promise<ResolutionPiiFetch[]>;

  executionStartCas(
    claim: ResolutionClaim,
    now: Date,
  ): Promise<boolean>;

  heartbeat(
    claim: ResolutionClaim,
    args: { leaseDurationMs: number; maxHeartbeats: number; now: Date },
  ): Promise<boolean>;

  persistResult(
    claim: ResolutionClaim,
    payload: ResolutionPersistPayload,
    now: Date,
  ): Promise<boolean>;

  releaseClaim(claim: ResolutionClaim, now: Date): Promise<void>;

  /** Operator/manual requeue — bumps version and resets retry state. */
  manualRequeue(pointId: string, now: Date): Promise<boolean>;

  /** Test/diagnostic introspection. */
  getPoint(pointId: string): Promise<ResolutionQueuePoint | null>;
}
