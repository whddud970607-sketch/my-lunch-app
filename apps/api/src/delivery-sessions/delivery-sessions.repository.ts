import { Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DeliverySessionRole } from "./session-role.util";

export type DeliverySessionRow = {
  id: string;
  driver_id: string;
  delivery_job_id: string | null;
  workday_id: string | null;
  session_role: DeliverySessionRole;
  status: "active" | "ending" | "completed" | "abandoned";
  started_at: string;
  ended_at: string | null;
  idempotency_key: string;
  client_started_at: string | null;
  summary_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type RoutePointInsert = {
  session_id: string;
  driver_id: string;
  sequence_no: number;
  recorded_at: string;
  locationEwkt: string;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  source: string;
};

export type ProgressCounts = {
  totalPoints: number;
  completedPoints: number;
  incompletePoints: number;
  failedPoints: number;
  totalQuantity: number;
};

@Injectable()
export class DeliverySessionsRepository {
  private readonly logger = new Logger(DeliverySessionsRepository.name);

  private readonly sessionSelect =
    "id, driver_id, delivery_job_id, workday_id, session_role, status, started_at, ended_at, idempotency_key, client_started_at, summary_snapshot, created_at, updated_at";

  async findOpenSessionForDriver(
    userClient: SupabaseClient,
    driverId: string,
  ): Promise<DeliverySessionRow | null> {
    const { data, error } = await userClient
      .from("delivery_sessions")
      .select(this.sessionSelect)
      .eq("driver_id", driverId)
      .in("status", ["active", "ending"])
      .maybeSingle();

    if (error) {
      this.logger.warn(`open session select failed code=${error.code}`);
      return null;
    }
    return (data as DeliverySessionRow | null) ?? null;
  }

  async findSessionByIdempotency(
    userClient: SupabaseClient,
    driverId: string,
    idempotencyKey: string,
  ): Promise<DeliverySessionRow | null> {
    const { data, error } = await userClient
      .from("delivery_sessions")
      .select(this.sessionSelect)
      .eq("driver_id", driverId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (error) {
      this.logger.warn(`session by idempotency failed code=${error.code}`);
      return null;
    }
    return (data as DeliverySessionRow | null) ?? null;
  }

  async findSessionById(
    userClient: SupabaseClient,
    sessionId: string,
  ): Promise<DeliverySessionRow | null> {
    const { data, error } = await userClient
      .from("delivery_sessions")
      .select(this.sessionSelect)
      .eq("id", sessionId)
      .maybeSingle();

    if (error) {
      this.logger.warn(`session by id failed code=${error.code}`);
      return null;
    }
    return (data as DeliverySessionRow | null) ?? null;
  }

  async findActiveJobForDriver(
    userClient: SupabaseClient,
    driverId: string,
    jobId?: string,
  ): Promise<{
    id: string;
    driver_id: string;
    company_id: string | null;
    status: string;
    service_date: string;
  } | null> {
    let query = userClient
      .from("delivery_jobs")
      .select("id, driver_id, company_id, status, service_date")
      .eq("driver_id", driverId)
      .eq("status", "active");

    if (jobId) {
      query = query.eq("id", jobId);
    } else {
      query = query.order("service_date", { ascending: false }).limit(1);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      this.logger.warn(`active job select failed code=${error.code}`);
      return null;
    }
    return data ?? null;
  }

  async findExecutionSessionForWorkday(
    userClient: SupabaseClient,
    workdayId: string,
  ): Promise<DeliverySessionRow | null> {
    const { data, error } = await userClient
      .from("delivery_sessions")
      .select(this.sessionSelect)
      .eq("workday_id", workdayId)
      .eq("session_role", "workday_execution")
      .maybeSingle();

    if (error) {
      this.logger.warn(`execution session lookup failed code=${error.code}`);
      return null;
    }
    return (data as DeliverySessionRow | null) ?? null;
  }

  async insertSession(
    userClient: SupabaseClient,
    row: {
      driver_id: string;
      delivery_job_id: string | null;
      session_role: DeliverySessionRole;
      idempotency_key: string;
      client_started_at?: string | null;
      workday_id?: string | null;
    },
  ): Promise<DeliverySessionRow | null> {
    const { data, error } = await userClient
      .from("delivery_sessions")
      .insert({
        driver_id: row.driver_id,
        delivery_job_id: row.delivery_job_id,
        session_role: row.session_role,
        workday_id: row.workday_id ?? null,
        status: "active",
        idempotency_key: row.idempotency_key,
        client_started_at: row.client_started_at ?? null,
      })
      .select(this.sessionSelect)
      .maybeSingle();

    if (error) {
      this.logger.warn(`session insert failed code=${error.code}`);
      return null;
    }
    return (data as DeliverySessionRow | null) ?? null;
  }

  async markEnding(
    userClient: SupabaseClient,
    sessionId: string,
    summary: ProgressCounts,
  ): Promise<DeliverySessionRow | null> {
    const { data, error } = await userClient
      .from("delivery_sessions")
      .update({
        status: "ending",
        ended_at: new Date().toISOString(),
        summary_snapshot: summary,
      })
      .eq("id", sessionId)
      .eq("status", "active")
      .select(this.sessionSelect)
      .maybeSingle();

    if (error) {
      this.logger.warn(`session ending failed code=${error.code}`);
      return null;
    }
    return (data as DeliverySessionRow | null) ?? null;
  }

  async markCompleted(
    userClient: SupabaseClient,
    sessionId: string,
  ): Promise<DeliverySessionRow | null> {
    const { data, error } = await userClient
      .from("delivery_sessions")
      .update({ status: "completed" })
      .eq("id", sessionId)
      .in("status", ["ending", "active"])
      .select(this.sessionSelect)
      .maybeSingle();

    if (error) {
      this.logger.warn(`session complete failed code=${error.code}`);
      return null;
    }
    return (data as DeliverySessionRow | null) ?? null;
  }

  async countJobProgress(
    userClient: SupabaseClient,
    jobId: string,
  ): Promise<ProgressCounts> {
    const { data, error } = await userClient
      .from("delivery_points")
      .select("status, quantity")
      .eq("job_id", jobId);

    if (error || !data) {
      this.logger.warn(`progress count failed code=${error?.code}`);
      return {
        totalPoints: 0,
        completedPoints: 0,
        incompletePoints: 0,
        failedPoints: 0,
        totalQuantity: 0,
      };
    }

    let completed = 0;
    let failed = 0;
    let incomplete = 0;
    let qty = 0;
    for (const row of data as Array<{ status: string; quantity: number }>) {
      qty += row.quantity ?? 0;
      if (row.status === "completed") completed += 1;
      else if (row.status === "failed") {
        failed += 1;
        incomplete += 1;
      } else incomplete += 1;
    }
    return {
      totalPoints: data.length,
      completedPoints: completed,
      incompletePoints: incomplete,
      failedPoints: failed,
      totalQuantity: qty,
    };
  }

  async insertRoutePointsBatch(
    userClient: SupabaseClient,
    points: RoutePointInsert[],
  ): Promise<{ inserted: number; conflictSkipped: boolean }> {
    if (points.length === 0) return { inserted: 0, conflictSkipped: false };

    const rows = points.map((p) => ({
      session_id: p.session_id,
      driver_id: p.driver_id,
      sequence_no: p.sequence_no,
      recorded_at: p.recorded_at,
      location: p.locationEwkt,
      accuracy_m: p.accuracy_m,
      speed_mps: p.speed_mps,
      heading_deg: p.heading_deg,
      source: p.source,
    }));

    const { data, error } = await userClient
      .from("delivery_route_points")
      .upsert(rows, {
        onConflict: "session_id,sequence_no",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      this.logger.warn(`route batch insert failed code=${error.code}`);
      throw error;
    }
    const inserted = data?.length ?? 0;
    return {
      inserted,
      conflictSkipped: inserted < points.length,
    };
  }

  async listRoutePoints(
    userClient: SupabaseClient,
    sessionId: string,
    fromSequence?: number,
  ): Promise<
    Array<{
      sequence_no: number;
      recorded_at: string;
      location: unknown;
      accuracy_m: number | null;
      speed_mps: number | null;
      heading_deg: number | null;
    }>
  > {
    let query = userClient
      .from("delivery_route_points")
      .select("sequence_no, recorded_at, location, accuracy_m, speed_mps, heading_deg")
      .eq("session_id", sessionId)
      .order("sequence_no", { ascending: true });

    if (fromSequence != null) {
      query = query.gte("sequence_no", fromSequence);
    }

    const { data, error } = await query;
    if (error) {
      this.logger.warn(`route list failed code=${error.code}`);
      return [];
    }
    return data ?? [];
  }

  async maxSequence(
    userClient: SupabaseClient,
    sessionId: string,
  ): Promise<number> {
    const { data, error } = await userClient
      .from("delivery_route_points")
      .select("sequence_no")
      .eq("session_id", sessionId)
      .order("sequence_no", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return 0;
    return Number((data as { sequence_no: number }).sequence_no) || 0;
  }
}
