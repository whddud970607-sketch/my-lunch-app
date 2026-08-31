import { Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseServiceClient } from "../supabase/supabase-service.client";

export type AccessSecretRow = {
  point_id: string;
  job_id: string;
  driver_id: string;
  access_info_ciphertext: string | null;
  access_info_nonce: string | null;
  access_info_key_version: number | null;
  access_info_expires_at: string | null;
  access_info_purged_at: string | null;
};

/**
 * Nest-only reads of delivery_point_access_secrets via service_role.
 * Never used for ordinary delivery_points / shipments listing.
 */
@Injectable()
export class AccessSecretsRepository {
  private readonly logger = new Logger(AccessSecretsRepository.name);

  constructor(private readonly service: SupabaseServiceClient) {}

  /**
   * Batched revealable access capability (no ciphertext returned).
   * Requires: non-purged ciphertext present, and not past expires_at.
   * Callers must still gate by point status / pii_masked / assignment.
   */
  async listPointIdsWithAccessInfo(
    pointIds: string[],
    driverId: string,
  ): Promise<Set<string>> {
    const out = new Set<string>();
    if (!pointIds.length || !driverId?.trim()) return out;
    const client = this.service.getOrNull();
    if (!client) {
      this.logger.warn("service client unavailable for hasAccessInfo");
      return out;
    }
    const nowIso = new Date().toISOString();
    const { data, error } = await client
      .from("delivery_point_access_secrets")
      .select("point_id, access_info_expires_at")
      .in("point_id", pointIds)
      .eq("driver_id", driverId)
      .is("access_info_purged_at", null)
      .not("access_info_ciphertext", "is", null);
    if (error) {
      this.logger.warn(`access_secrets presence failed code=${error.code}`);
      return out;
    }
    for (const row of data ?? []) {
      const pointId = row.point_id as string | null;
      if (!pointId) continue;
      const expiresAt = row.access_info_expires_at as string | null;
      if (expiresAt && expiresAt < nowIso) continue;
      out.add(pointId);
    }
    return out;
  }

  async findSecretForPoint(
    pointId: string,
    driverId: string,
  ): Promise<AccessSecretRow | null> {
    if (!pointId?.trim() || !driverId?.trim()) return null;
    const client = this.service.getOrNull();
    if (!client) return null;
    const { data, error } = await client
      .from("delivery_point_access_secrets")
      .select(
        "point_id, job_id, driver_id, access_info_ciphertext, access_info_nonce, access_info_key_version, access_info_expires_at, access_info_purged_at",
      )
      .eq("point_id", pointId)
      .eq("driver_id", driverId)
      .maybeSingle();
    if (error) {
      this.logger.warn(`access_secrets select failed code=${error.code}`);
      return null;
    }
    return (data as AccessSecretRow | null) ?? null;
  }

  /**
   * Insert audit via user JWT (RLS insert-self). Never include secret plaintext in metadata.
   */
  async insertReadAccessAudit(
    userClient: SupabaseClient,
    args: {
      actorId: string;
      actorRole: string;
      pointId: string;
      accessReason: string;
    },
  ): Promise<boolean> {
    const { error } = await userClient.from("data_access_logs").insert({
      actor_id: args.actorId,
      actor_role: args.actorRole,
      resource_type: "delivery_point",
      resource_id: args.pointId,
      action: "read_access_info",
      access_reason: args.accessReason,
      metadata: { source: "nest_access_info" },
    });
    if (error) {
      this.logger.warn(`data_access_logs insert failed code=${error.code}`);
      return false;
    }
    return true;
  }
}
