import { Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MEMBERSHIP_SELECT,
  WORKDAY_SELECT,
  type WorkdayMembershipRow,
  type WorkdayRow,
  type WorkdaySessionRow,
  type WorkdaySummarySnapshot,
} from "./workday.types";

@Injectable()
export class WorkdayRepository {
  private readonly logger = new Logger(WorkdayRepository.name);

  async rpcStartAtomic(
    userClient: SupabaseClient,
    idempotencyKey: string,
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await userClient.rpc(
      "start_delivery_workday_atomic",
      { p_idempotency_key: idempotencyKey },
    );
    if (error) {
      this.logger.warn(`start_delivery_workday_atomic failed code=${error.code}`);
      return null;
    }
    return (data as Record<string, unknown>) ?? null;
  }

  async findOpenForDriver(
    userClient: SupabaseClient,
    driverId: string,
  ): Promise<WorkdayRow | null> {
    const { data, error } = await userClient
      .from("delivery_workdays")
      .select(WORKDAY_SELECT)
      .eq("driver_id", driverId)
      .in("status", ["active", "ending"])
      .maybeSingle();
    if (error) {
      this.logger.warn(`open workday select failed code=${error.code}`);
      return null;
    }
    return (data as WorkdayRow | null) ?? null;
  }

  async findById(
    userClient: SupabaseClient,
    workdayId: string,
  ): Promise<WorkdayRow | null> {
    const { data, error } = await userClient
      .from("delivery_workdays")
      .select(WORKDAY_SELECT)
      .eq("id", workdayId)
      .maybeSingle();
    if (error) {
      this.logger.warn(`workday by id failed code=${error.code}`);
      return null;
    }
    return (data as WorkdayRow | null) ?? null;
  }

  async listMembership(
    userClient: SupabaseClient,
    workdayId: string,
  ): Promise<WorkdayMembershipRow[]> {
    const { data, error } = await userClient
      .from("delivery_workday_jobs")
      .select(MEMBERSHIP_SELECT)
      .eq("workday_id", workdayId)
      .order("attached_at", { ascending: true });
    if (error) {
      this.logger.warn(`membership list failed code=${error.code}`);
      return [];
    }
    return (data as WorkdayMembershipRow[]) ?? [];
  }

  async listActiveJobIdsForDriver(
    userClient: SupabaseClient,
    driverId: string,
  ): Promise<
    Array<{
      id: string;
      company_id: string | null;
      source_id: string | null;
      status: string;
    }>
  > {
    const { data, error } = await userClient
      .from("delivery_jobs")
      .select("id, company_id, source_id, status")
      .eq("driver_id", driverId)
      .eq("status", "active")
      .order("created_at", { ascending: true });
    if (error) {
      this.logger.warn(`eligible jobs failed code=${error.code}`);
      return [];
    }
    return (data as Array<{
      id: string;
      company_id: string | null;
      source_id: string | null;
      status: string;
    }>) ?? [];
  }

  async findMembership(
    userClient: SupabaseClient,
    workdayId: string,
    jobId: string,
  ): Promise<WorkdayMembershipRow | null> {
    const { data, error } = await userClient
      .from("delivery_workday_jobs")
      .select(MEMBERSHIP_SELECT)
      .eq("workday_id", workdayId)
      .eq("job_id", jobId)
      .maybeSingle();
    if (error) {
      this.logger.warn(`membership find failed code=${error.code}`);
      return null;
    }
    return (data as WorkdayMembershipRow | null) ?? null;
  }

  async insertMembership(
    userClient: SupabaseClient,
    row: {
      workday_id: string;
      job_id: string;
      membership_source: "midday_attach" | "reconcile";
    },
  ): Promise<boolean> {
    const { error } = await userClient.from("delivery_workday_jobs").insert({
      workday_id: row.workday_id,
      job_id: row.job_id,
      membership_source: row.membership_source,
      attached_at: new Date().toISOString(),
      detached_at: null,
    });
    if (error) {
      this.logger.warn(`membership insert failed code=${error.code}`);
      return false;
    }
    return true;
  }

  async reactivateMembership(
    userClient: SupabaseClient,
    membershipId: string,
    source: "midday_attach" | "reconcile",
  ): Promise<boolean> {
    const { error } = await userClient
      .from("delivery_workday_jobs")
      .update({
        detached_at: null,
        attached_at: new Date().toISOString(),
        membership_source: source,
      })
      .eq("id", membershipId);
    if (error) {
      this.logger.warn(`membership reactivate failed code=${error.code}`);
      return false;
    }
    return true;
  }

  async detachMembership(
    userClient: SupabaseClient,
    membershipId: string,
  ): Promise<boolean> {
    const { error } = await userClient
      .from("delivery_workday_jobs")
      .update({ detached_at: new Date().toISOString() })
      .eq("id", membershipId)
      .is("detached_at", null);
    if (error) {
      this.logger.warn(`membership detach failed code=${error.code}`);
      return false;
    }
    return true;
  }

  async markEnding(
    userClient: SupabaseClient,
    workdayId: string,
    endIdempotencyKey: string | null,
  ): Promise<WorkdayRow | null> {
    const { data, error } = await userClient
      .from("delivery_workdays")
      .update({
        status: "ending",
        ended_at: new Date().toISOString(),
        end_idempotency_key: endIdempotencyKey,
      })
      .eq("id", workdayId)
      .eq("status", "active")
      .select(WORKDAY_SELECT)
      .maybeSingle();
    if (error) {
      this.logger.warn(`workday ending failed code=${error.code}`);
      return null;
    }
    return (data as WorkdayRow | null) ?? null;
  }

  async markCompleted(
    userClient: SupabaseClient,
    workdayId: string,
    summary: WorkdaySummarySnapshot,
  ): Promise<WorkdayRow | null> {
    const { data, error } = await userClient
      .from("delivery_workdays")
      .update({
        status: "completed",
        summary_snapshot: summary,
      })
      .eq("id", workdayId)
      .in("status", ["ending", "active"])
      .select(WORKDAY_SELECT)
      .maybeSingle();
    if (error) {
      this.logger.warn(`workday completed failed code=${error.code}`);
      return null;
    }
    return (data as WorkdayRow | null) ?? null;
  }

  async listAllSessionsForWorkday(
    userClient: SupabaseClient,
    workdayId: string,
  ): Promise<WorkdaySessionRow[]> {
    const { data, error } = await userClient
      .from("delivery_sessions")
      .select(
        "id, status, delivery_job_id, session_role, started_at, ended_at",
      )
      .eq("workday_id", workdayId)
      .order("started_at", { ascending: true });
    if (error) {
      this.logger.warn(`workday sessions list failed code=${error.code}`);
      return [];
    }
    return (data as WorkdaySessionRow[]) ?? [];
  }

  async findExecutionSessionForWorkday(
    userClient: SupabaseClient,
    workdayId: string,
  ): Promise<WorkdaySessionRow | null> {
    const { data, error } = await userClient
      .from("delivery_sessions")
      .select(
        "id, status, delivery_job_id, session_role, started_at, ended_at",
      )
      .eq("workday_id", workdayId)
      .eq("session_role", "workday_execution")
      .maybeSingle();
    if (error) {
      this.logger.warn(`execution session lookup failed code=${error.code}`);
      return null;
    }
    return (data as WorkdaySessionRow | null) ?? null;
  }

  async listRoutePointsForSessions(
    userClient: SupabaseClient,
    sessionIds: string[],
  ): Promise<
    Array<{
      session_id: string;
      sequence_no: number;
      recorded_at: string;
      location: unknown;
      accuracy_m: number | null;
      speed_mps: number | null;
      heading_deg: number | null;
    }>
  > {
    if (!sessionIds.length) return [];
    const { data, error } = await userClient
      .from("delivery_route_points")
      .select(
        "session_id, sequence_no, recorded_at, location, accuracy_m, speed_mps, heading_deg",
      )
      .in("session_id", sessionIds)
      .order("session_id", { ascending: true })
      .order("sequence_no", { ascending: true });
    if (error) {
      this.logger.warn(`route batch list failed code=${error.code}`);
      return [];
    }
    return data ?? [];
  }

  async listSourcesByIds(
    userClient: SupabaseClient,
    sourceIds: string[],
  ): Promise<
    Array<{
      id: string;
      display_name: string;
    }>
  > {
    if (!sourceIds.length) return [];
    const { data, error } = await userClient
      .from("delivery_sources")
      .select("id, display_name")
      .in("id", sourceIds);
    if (error) {
      this.logger.warn(`sources lookup failed code=${error.code}`);
      return [];
    }
    return (data as Array<{ id: string; display_name: string }>) ?? [];
  }

  async listOpenSessionsForWorkday(
    userClient: SupabaseClient,
    workdayId: string,
  ): Promise<Array<{ id: string; status: string; delivery_job_id: string | null }>> {
    const { data, error } = await userClient
      .from("delivery_sessions")
      .select("id, status, delivery_job_id")
      .eq("workday_id", workdayId)
      .in("status", ["active", "ending"]);
    if (error) {
      this.logger.warn(`open sessions for workday failed code=${error.code}`);
      return [];
    }
    return (data as Array<{
      id: string;
      status: string;
      delivery_job_id: string | null;
    }>) ?? [];
  }

  async countProgressForJobs(
    userClient: SupabaseClient,
    jobIds: string[],
  ): Promise<{
    totalPoints: number;
    completedPoints: number;
    incompletePoints: number;
    byCompany: Map<string, { companyId: string | null; total: number; completed: number }>;
    bySource: Map<string, { sourceId: string | null; total: number; completed: number }>;
  }> {
    const empty = {
      totalPoints: 0,
      completedPoints: 0,
      incompletePoints: 0,
      byCompany: new Map(),
      bySource: new Map(),
    };
    if (!jobIds.length) return empty;

    const { data: jobs, error: jobErr } = await userClient
      .from("delivery_jobs")
      .select("id, company_id, source_id, driver_id, status")
      .in("id", jobIds);
    if (jobErr) {
      this.logger.warn(`jobs for progress failed code=${jobErr.code}`);
      return empty;
    }

    const { data: points, error: ptErr } = await userClient
      .from("delivery_points")
      .select("id, job_id, status, driver_id")
      .in("job_id", jobIds);
    if (ptErr) {
      this.logger.warn(`points for progress failed code=${ptErr.code}`);
      return empty;
    }

    const jobMeta = new Map(
      (jobs ?? []).map((j) => [
        j.id as string,
        {
          companyId: (j.company_id as string | null) ?? null,
          sourceId: (j.source_id as string | null) ?? null,
          driverId: j.driver_id as string,
          status: j.status as string,
        },
      ]),
    );

    let total = 0;
    let completed = 0;
    let incomplete = 0;
    const byCompany = new Map<
      string,
      { companyId: string | null; total: number; completed: number }
    >();
    const bySource = new Map<
      string,
      { sourceId: string | null; total: number; completed: number }
    >();

    for (const p of points ?? []) {
      const meta = jobMeta.get(p.job_id as string);
      if (!meta) continue;
      total += 1;
      const done = p.status === "completed";
      if (done) completed += 1;
      else incomplete += 1;

      const ck = meta.companyId ?? "null";
      const c = byCompany.get(ck) ?? {
        companyId: meta.companyId,
        total: 0,
        completed: 0,
      };
      c.total += 1;
      if (done) c.completed += 1;
      byCompany.set(ck, c);

      const sk = meta.sourceId ?? "null";
      const s = bySource.get(sk) ?? {
        sourceId: meta.sourceId,
        total: 0,
        completed: 0,
      };
      s.total += 1;
      if (done) s.completed += 1;
      bySource.set(sk, s);
    }

    return {
      totalPoints: total,
      completedPoints: completed,
      incompletePoints: incomplete,
      byCompany,
      bySource,
    };
  }
}
