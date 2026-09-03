import { Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseServiceClient } from "../supabase/supabase-service.client";
import {
  clampLeaseDurationMs,
  clampRetryDelayMs,
} from "./resolution-backoff";
import type { ClaimBatchArgs, ResolutionWorkerRepository } from "./resolution-worker.repository.port";
import { RESOLUTION_WORKER_RPC } from "./resolution-worker.rpc";
import type {
  PinAccuracyDb,
  ResolutionClaim,
  ResolutionPersistPayload,
  ResolutionPiiFetch,
  ResolutionQueuePoint,
  ResolutionStatusDb,
} from "./resolution-worker.types";

type RpcResult = Record<string, unknown> | null;

/**
 * Service-role repository targeting migration 025 worker RPCs.
 * Lease ownership uses PostgreSQL now() inside those RPCs — application
 * `now` is never sent as lease/expiry/resolved_at authority.
 *
 * Not wired as RESOLUTION_WORKER_REPOSITORY until 025 is applied.
 */
@Injectable()
export class SupabaseResolutionWorkerRepository
  implements ResolutionWorkerRepository
{
  private readonly logger = new Logger(SupabaseResolutionWorkerRepository.name);

  constructor(private readonly supabase: SupabaseServiceClient) {}

  isAvailable(): boolean {
    return this.supabase.getOrNull() != null;
  }

  async listEligibleDriverIds(_now: Date): Promise<string[]> {
    const data = await this.rpc(RESOLUTION_WORKER_RPC.listEligibleDrivers, {});
    if (!data || data.ok !== true) return [];
    const ids = data.driverIds;
    if (!Array.isArray(ids)) return [];
    return ids.map((id) => String(id));
  }

  async claimBatch(args: ClaimBatchArgs): Promise<ResolutionClaim[]> {
    const data = await this.rpc(RESOLUTION_WORKER_RPC.claimBatch, {
      p_worker_id: args.workerId,
      p_lease_ms: clampLeaseDurationMs(args.leaseDurationMs),
      p_plan: args.plan.map((row) => ({
        driverId: row.driverId,
        limit: row.limit,
      })),
    });
    if (!data || data.ok !== true || !Array.isArray(data.claims)) return [];
    return data.claims
      .map((raw) => this.parseClaim(raw))
      .filter((claim): claim is ResolutionClaim => claim != null);
  }

  async fetchPii(pointIds: string[]): Promise<ResolutionPiiFetch[]> {
    if (!pointIds.length) return [];
    const data = await this.rpc(RESOLUTION_WORKER_RPC.fetchPii, {
      p_point_ids: pointIds,
    });
    const found = new Map<string, ResolutionPiiFetch>();
    if (data?.ok === true && Array.isArray(data.rows)) {
      for (const raw of data.rows) {
        const row = this.parsePii(raw);
        if (row) found.set(row.pointId, row);
      }
    }
    return pointIds.map((pointId) => {
      const row = found.get(pointId);
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
    _now: Date,
  ): Promise<boolean> {
    const data = await this.rpc(RESOLUTION_WORKER_RPC.executionStart, {
      p_point_id: claim.pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: claim.claimedBy,
      p_resolution_version: claim.resolutionVersion,
    });
    return data?.ok === true && data.started === true;
  }

  async heartbeat(
    claim: ResolutionClaim,
    args: { leaseDurationMs: number; maxHeartbeats: number; now: Date },
  ): Promise<boolean> {
    const data = await this.rpc(RESOLUTION_WORKER_RPC.heartbeat, {
      p_point_id: claim.pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: claim.claimedBy,
      p_resolution_version: claim.resolutionVersion,
      p_lease_ms: clampLeaseDurationMs(args.leaseDurationMs),
      p_max_heartbeats: args.maxHeartbeats,
    });
    return data?.ok === true && data.extended === true;
  }

  async persistResult(
    claim: ResolutionClaim,
    payload: ResolutionPersistPayload,
    now: Date,
  ): Promise<boolean> {
    const delayMs = this.retryDelayMs(payload, now);
    const data = await this.rpc(RESOLUTION_WORKER_RPC.persist, {
      p_point_id: claim.pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: claim.claimedBy,
      p_resolution_version: claim.resolutionVersion,
      p_resolution_status: payload.resolutionStatus,
      p_resolution_stage: payload.resolutionStage,
      p_pin_accuracy: payload.pinAccuracy,
      p_latitude: payload.location?.latitude ?? null,
      p_longitude: payload.location?.longitude ?? null,
      p_identity_provenance: payload.identityProvenance,
      p_geometry_provenance: payload.geometryProvenance,
      p_complex_corroboration: payload.complexCorroboration,
      p_failure_code: payload.resolutionFailureCode,
      p_retry_exhausted: payload.resolutionRetryExhausted,
      p_retry_delay_ms: delayMs,
      p_normalized_address: payload.normalizedAddress ?? null,
    });
    return data?.ok === true && data.persisted === true;
  }

  async releaseClaim(claim: ResolutionClaim, _now: Date): Promise<void> {
    await this.rpc(RESOLUTION_WORKER_RPC.releaseClaim, {
      p_point_id: claim.pointId,
      p_claim_token: claim.claimToken,
      p_claimed_by: claim.claimedBy,
    });
  }

  async manualRequeue(pointId: string, _now: Date): Promise<boolean> {
    const data = await this.rpc(RESOLUTION_WORKER_RPC.manualRequeue, {
      p_point_id: pointId,
    });
    return data?.ok === true && data.requeued === true;
  }

  async getPoint(pointId: string): Promise<ResolutionQueuePoint | null> {
    const data = await this.rpc(RESOLUTION_WORKER_RPC.getPoint, {
      p_point_id: pointId,
    });
    if (!data || data.ok !== true || data.point == null) return null;
    return this.parseQueuePoint(data.point);
  }

  /**
   * Delay duration only — never an absolute app timestamp for lease or next_attempt.
   * Postgres persist applies now() + delay.
   */
  retryDelayMs(payload: ResolutionPersistPayload, now: Date): number | null {
    if (
      payload.resolutionStatus !== "provider_error" ||
      payload.resolutionRetryExhausted
    ) {
      return null;
    }
    if (
      typeof payload.retryDelayMs === "number" &&
      Number.isFinite(payload.retryDelayMs)
    ) {
      return clampRetryDelayMs(payload.retryDelayMs);
    }
    if (payload.resolutionNextAttemptAt) {
      return clampRetryDelayMs(
        payload.resolutionNextAttemptAt.getTime() - now.getTime(),
      );
    }
    return clampRetryDelayMs(30_000);
  }

  private parseClaim(raw: unknown): ResolutionClaim | null {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const pointId = asString(row.pointId);
    const driverId = asString(row.driverId);
    const claimToken = asString(row.claimToken);
    const claimedBy = asString(row.claimedBy);
    const claimedAt = asDate(row.claimedAt);
    const leaseExpiresAt = asDate(row.leaseExpiresAt);
    const resolutionVersion = asNumber(row.resolutionVersion);
    const resolutionAttemptCount = asNumber(row.resolutionAttemptCount);
    if (
      !pointId ||
      !driverId ||
      !claimToken ||
      !claimedBy ||
      !claimedAt ||
      !leaseExpiresAt ||
      resolutionVersion == null ||
      resolutionAttemptCount == null
    ) {
      return null;
    }
    return {
      pointId,
      driverId,
      claimToken,
      claimedBy,
      claimedAt,
      leaseExpiresAt,
      resolutionVersion,
      resolutionAttemptCount,
    };
  }

  private parsePii(raw: unknown): ResolutionPiiFetch | null {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const pointId = asString(row.pointId);
    if (!pointId) return null;
    return {
      pointId,
      rawAddress: asNullableString(row.rawAddress),
      detailAddress: asNullableString(row.detailAddress),
      normalizedAddress: asNullableString(row.normalizedAddress),
    };
  }

  private parseQueuePoint(raw: unknown): ResolutionQueuePoint | null {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const id = asString(row.id);
    const driverId = asString(row.driverId);
    if (!id || !driverId) return null;
    const lat = asNumber(row.latitude);
    const lng = asNumber(row.longitude);
    return {
      id,
      driverId,
      resolutionStatus: String(row.resolutionStatus) as ResolutionStatusDb,
      resolutionVersion: asNumber(row.resolutionVersion) ?? 1,
      resolutionAttemptCount: asNumber(row.resolutionAttemptCount) ?? 0,
      pinAccuracy: String(row.pinAccuracy ?? "address") as PinAccuracyDb,
      resolutionNextAttemptAt: asDate(row.resolutionNextAttemptAt),
      resolutionRetryExhausted: row.resolutionRetryExhausted === true,
      location:
        lat != null && lng != null ? { latitude: lat, longitude: lng } : null,
      resolutionClaimedBy: asNullableString(row.resolutionClaimedBy),
      resolutionClaimToken: asNullableString(row.resolutionClaimToken),
      resolutionLeaseExpiresAt: asDate(row.resolutionLeaseExpiresAt),
    };
  }

  private async rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<RpcResult> {
    const client = this.clientOrNull();
    if (!client) return null;
    try {
      const { data, error } = await client.rpc(name, args);
      if (error) {
        this.logger.warn(`rpc failed name=${name} code=${error.code ?? "rpc"}`);
        return null;
      }
      if (!data || typeof data !== "object") return null;
      const row = data as Record<string, unknown>;
      if (row.ok === false) {
        this.logger.warn(
          `rpc rejected name=${name} code=${typeof row.code === "string" ? row.code : "rejected"}`,
        );
      }
      return row;
    } catch {
      this.logger.warn(`rpc failed name=${name} code=throw`);
      return null;
    }
  }

  private clientOrNull(): SupabaseClient | null {
    return this.supabase.getOrNull();
  }
}

function asString(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return value;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  return value;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
