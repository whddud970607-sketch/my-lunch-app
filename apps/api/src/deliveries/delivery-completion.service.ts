import { Injectable, Logger } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";

export type CompletionResultCode = "applied" | "duplicate" | "rejected";

export type CompletePointResult = {
  ok: boolean;
  resultCode: CompletionResultCode;
  pointId: string;
  status: string;
  code?: string;
  /** Safe metadata only — no PII/GPS/secrets */
  receiptBody: Record<string, unknown>;
};

/**
 * Single completion truth for delivery points:
 * delivery_proofs insert (point_id UNIQUE) + delivery_points.status=completed + mask.
 * Shared by map-spike complete and idempotent /points/:id/complete.
 *
 * Idempotent path (key+hash): Postgres RPC `complete_delivery_point_atomic` (one txn).
 * Legacy map-spike path (no key): multi-step PostgREST (unchanged contract).
 */
@Injectable()
export class DeliveryCompletionService {
  private readonly logger = new Logger(DeliveryCompletionService.name);

  async completePoint(
    userClient: SupabaseClient,
    args: {
      pointId: string;
      driverId: string;
      storagePath: string;
      latitude?: number;
      longitude?: number;
      idempotencyKey?: string;
      payloadHash?: string;
      operationType?: string;
    },
  ): Promise<CompletePointResult> {
    const key = args.idempotencyKey?.trim();
    const hash = args.payloadHash?.trim();
    if (key && hash) {
      return this.completePointAtomic(userClient, {
        pointId: args.pointId,
        storagePath: args.storagePath,
        idempotencyKey: key,
        payloadHash: hash,
        latitude: args.latitude,
        longitude: args.longitude,
      });
    }
    return this.completePointLegacy(userClient, args);
  }

  /**
   * Atomic idempotent complete via SECURITY INVOKER RPC (single Postgres transaction).
   * Driver identity is resolved inside RPC from JWT (`current_driver_id`), not args.driverId.
   */
  private async completePointAtomic(
    userClient: SupabaseClient,
    args: {
      pointId: string;
      storagePath: string;
      idempotencyKey: string;
      payloadHash: string;
      latitude?: number;
      longitude?: number;
    },
  ): Promise<CompletePointResult> {
    const { data, error } = await userClient.rpc(
      "complete_delivery_point_atomic",
      {
        p_point_id: args.pointId,
        p_storage_path: args.storagePath,
        p_idempotency_key: args.idempotencyKey,
        p_payload_hash: args.payloadHash,
        p_latitude: args.latitude ?? null,
        p_longitude: args.longitude ?? null,
        p_fail_after: null,
      },
    );

    if (error) {
      this.logger.warn(`atomic complete rpc failed code=${error.code}`);
      return {
        ok: false,
        resultCode: "rejected",
        pointId: args.pointId,
        status: "failed",
        code: error.code ?? "rpc_failed",
        receiptBody: { errorCode: error.code ?? "rpc_failed" },
      };
    }

    return this.mapRpcResult(args.pointId, data);
  }

  private mapRpcResult(
    pointId: string,
    data: unknown,
  ): CompletePointResult {
    const row =
      data && typeof data === "object"
        ? (data as Record<string, unknown>)
        : null;
    if (!row) {
      return {
        ok: false,
        resultCode: "rejected",
        pointId,
        status: "failed",
        code: "rpc_empty",
        receiptBody: { errorCode: "rpc_empty" },
      };
    }

    const resultCodeRaw = String(row["resultCode"] ?? "rejected");
    const resultCode =
      resultCodeRaw === "applied" || resultCodeRaw === "duplicate"
        ? resultCodeRaw
        : "rejected";
    const receiptBody =
      row["receiptBody"] && typeof row["receiptBody"] === "object"
        ? (row["receiptBody"] as Record<string, unknown>)
        : { errorCode: row["code"] ?? "complete_failed" };

    return {
      ok: Boolean(row["ok"]),
      resultCode,
      pointId: String(row["pointId"] ?? pointId),
      status: String(row["status"] ?? "failed"),
      code: row["code"] != null ? String(row["code"]) : undefined,
      receiptBody,
    };
  }

  /** Legacy multi-step path for map-spike (no idempotency key). */
  private async completePointLegacy(
    userClient: SupabaseClient,
    args: {
      pointId: string;
      driverId: string;
      storagePath: string;
      latitude?: number;
      longitude?: number;
    },
  ): Promise<CompletePointResult> {
    const domain = await this.applyCompletionDomain(userClient, args);
    if (!domain.ok && domain.code === "already_completed") {
      return {
        ok: true,
        resultCode: "duplicate",
        pointId: args.pointId,
        status: "completed",
        receiptBody: {
          resultCode: "duplicate",
          pointId: args.pointId,
          status: "completed",
        },
      };
    }

    if (!domain.ok) {
      return {
        ok: false,
        resultCode: "rejected",
        pointId: args.pointId,
        status: "failed",
        code: domain.code,
        receiptBody: { errorCode: domain.code ?? "complete_failed" },
      };
    }

    return {
      ok: true,
      resultCode: "applied",
      pointId: args.pointId,
      status: "completed",
      receiptBody: {
        resultCode: "applied",
        pointId: args.pointId,
        status: "completed",
      },
    };
  }

  private async applyCompletionDomain(
    userClient: SupabaseClient,
    args: {
      pointId: string;
      driverId: string;
      storagePath: string;
      latitude?: number;
      longitude?: number;
    },
  ): Promise<{ ok: boolean; code?: string }> {
    const completedAt = new Date().toISOString();
    const completedLocation =
      args.latitude != null && args.longitude != null
        ? `SRID=4326;POINT(${args.longitude} ${args.latitude})`
        : null;

    const { error: proofErr } = await userClient.from("delivery_proofs").insert({
      point_id: args.pointId,
      driver_id: args.driverId,
      storage_path: args.storagePath,
      outcome: "completed",
      completed_at: completedAt,
      completed_location: completedLocation,
    });

    if (proofErr) {
      if (proofErr.code === "23505") {
        const { data: point } = await userClient
          .from("delivery_points")
          .select("status")
          .eq("id", args.pointId)
          .maybeSingle();
        if (point?.status === "completed") {
          return { ok: false, code: "already_completed" };
        }
        const { error: fixErr } = await userClient
          .from("delivery_points")
          .update({
            status: "completed",
            pii_masked_at: completedAt,
            display_label: "배송 완료",
          })
          .eq("id", args.pointId);
        if (fixErr) {
          this.logger.warn(`point complete repair failed code=${fixErr.code}`);
          return { ok: false, code: fixErr.code };
        }
        return { ok: true };
      }
      this.logger.warn(`proof insert failed code=${proofErr.code}`);
      return { ok: false, code: proofErr.code };
    }

    const { error: pointErr } = await userClient
      .from("delivery_points")
      .update({
        status: "completed",
        pii_masked_at: completedAt,
        display_label: "배송 완료",
      })
      .eq("id", args.pointId);

    if (pointErr) {
      this.logger.warn(`point complete failed code=${pointErr.code}`);
      return { ok: false, code: pointErr.code };
    }

    return { ok: true };
  }
}
