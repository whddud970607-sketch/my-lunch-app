import { Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DeliveriesRepository } from "../deliveries/deliveries.repository";
import {
  AccessSecretRow,
  AccessSecretsRepository,
} from "./access-secrets.repository";

/** Point statuses eligible for access-info capability / reveal. */
function isAccessEligiblePointStatus(status: string): boolean {
  return status === "pending" || status === "in_progress";
}

/**
 * Defense-in-depth gate for service_role access secret reads.
 * Controller authorization remains required; this layer scopes queries
 * to JWT-verified driver assignment and open/incomplete points.
 */
@Injectable()
export class AccessSecretsService {
  private readonly logger = new Logger(AccessSecretsService.name);

  constructor(
    private readonly repo: AccessSecretsRepository,
    private readonly deliveries: DeliveriesRepository,
  ) {}

  /**
   * Batched hasAccessInfo for Today/detail — driver-owned open points only.
   */
  async listPointIdsWithAccessInfo(
    userClient: SupabaseClient,
    driverId: string,
    pointIds: string[],
  ): Promise<Set<string>> {
    const eligible = await this.filterEligiblePointIds(
      userClient,
      driverId,
      pointIds,
    );
    if (!eligible.length) return new Set();
    return this.repo.listPointIdsWithAccessInfo(eligible, driverId);
  }

  /**
   * Reveal path: assigned driver, open point, matching secret row.
   * Returns null when any gate fails (caller maps to 404/403).
   */
  async findSecretForAssignedPoint(
    userClient: SupabaseClient,
    driverId: string,
    pointId: string,
  ): Promise<AccessSecretRow | null> {
    const point = await this.deliveries.findPointForDriver(
      userClient,
      driverId,
      pointId,
    );
    if (!point) return null;
    if (point.pii_masked_at) return null;
    if (!isAccessEligiblePointStatus(point.status)) return null;

    const secret = await this.repo.findSecretForPoint(pointId, driverId);
    if (!secret) return null;
    if (secret.driver_id !== driverId) {
      this.logger.warn("access secret driver mismatch blocked");
      return null;
    }
    if (secret.driver_id !== point.driver_id) {
      this.logger.warn("access secret stale driver_id blocked");
      return null;
    }
    return secret;
  }

  /** Audit via user JWT (RLS insert-self). */
  insertReadAccessAudit(
    userClient: SupabaseClient,
    args: {
      actorId: string;
      actorRole: string;
      pointId: string;
      accessReason: string;
    },
  ): Promise<boolean> {
    return this.repo.insertReadAccessAudit(userClient, args);
  }

  private async filterEligiblePointIds(
    userClient: SupabaseClient,
    driverId: string,
    pointIds: string[],
  ): Promise<string[]> {
    if (!pointIds.length) return [];
    const rows = await this.deliveries.listPointsForDriverByIds(
      userClient,
      driverId,
      pointIds,
    );
    return rows
      .filter(
        (p) =>
          !p.pii_masked_at && isAccessEligiblePointStatus(p.status),
      )
      .map((p) => p.id);
  }
}
