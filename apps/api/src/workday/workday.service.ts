import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePointLocation } from "../deliveries/location.util";
import { SupabaseServiceClient } from "../supabase/supabase-service.client";
import { WorkdayRepository } from "./workday.repository";
import type {
  WorkdayHistoricalProgress,
  WorkdayMembershipRow,
  WorkdayProgressProjection,
  WorkdayRouteSegmentSummary,
  WorkdayRouteSummary,
  WorkdayRow,
  WorkdaySessionRow,
  WorkdaySummarySnapshot,
} from "./workday.types";

function membershipDto(row: WorkdayMembershipRow) {
  return {
    jobId: row.job_id,
    attachedAt: row.attached_at,
    detachedAt: row.detached_at,
    membershipSource: row.membership_source,
    active: row.detached_at == null,
  };
}

function mapProgressProjection(
  progress: Awaited<ReturnType<WorkdayRepository["countProgressForJobs"]>>,
  jobCount: number,
): WorkdayProgressProjection {
  return {
    jobCount,
    totalPoints: progress.totalPoints,
    completedPoints: progress.completedPoints,
    incompletePoints: progress.incompletePoints,
    byCompany: [...progress.byCompany.values()].map((c) => ({
      companyId: c.companyId,
      totalPoints: c.total,
      completedPoints: c.completed,
      incompletePoints: c.total - c.completed,
    })),
    bySource: [...progress.bySource.values()].map((s) => ({
      sourceId: s.sourceId,
      totalPoints: s.total,
      completedPoints: s.completed,
      incompletePoints: s.total - s.completed,
    })),
  };
}

function emptyProgress(): WorkdayProgressProjection {
  return {
    jobCount: 0,
    totalPoints: 0,
    completedPoints: 0,
    incompletePoints: 0,
    byCompany: [],
    bySource: [],
  };
}

function computeDurationSeconds(workday: WorkdayRow): number | null {
  if (!workday.ended_at) return null;
  const startMs = new Date(workday.started_at).getTime();
  const endMs = new Date(workday.ended_at).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

function isValidSummarySnapshot(
  raw: Record<string, unknown>,
): raw is WorkdaySummarySnapshot {
  return (
    typeof raw.totalPoints === "number" &&
    typeof raw.completedPoints === "number" &&
    typeof raw.incompletePoints === "number" &&
    typeof raw.jobCount === "number"
  );
}

function progressFromSnapshot(
  snapshot: WorkdaySummarySnapshot,
): WorkdayProgressProjection {
  return {
    jobCount: snapshot.jobCount,
    totalPoints: snapshot.totalPoints,
    completedPoints: snapshot.completedPoints,
    incompletePoints: snapshot.incompletePoints,
    byCompany: (snapshot.byCompany ?? []).map((c) => ({
      companyId: c.companyId,
      totalPoints: c.totalPoints,
      completedPoints: c.completedPoints,
      incompletePoints: c.totalPoints - c.completedPoints,
    })),
    bySource: (snapshot.bySource ?? []).map((s) => ({
      sourceId: s.sourceId,
      totalPoints: s.totalPoints,
      completedPoints: s.completedPoints,
      incompletePoints: s.totalPoints - s.completedPoints,
    })),
  };
}

function workdayDto(
  row: WorkdayRow,
  membership: WorkdayMembershipRow[],
  extras?: {
    incompletePoints?: number;
    openSessionIds?: string[];
    progress?: WorkdayProgressProjection | null;
    executionSessionId?: string | null;
  },
) {
  return {
    id: row.id,
    driverId: row.driver_id,
    serviceDate: row.service_date,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    startIdempotencyKey: row.start_idempotency_key,
    summarySnapshot: row.summary_snapshot ?? {},
    membership: membership.map(membershipDto),
    incompletePoints: extras?.incompletePoints ?? null,
    openSessionIds: extras?.openSessionIds ?? null,
    progress: extras?.progress ?? null,
    executionSessionId: extras?.executionSessionId ?? null,
  };
}

@Injectable()
export class WorkdayService {
  private readonly logger = new Logger(WorkdayService.name);

  constructor(
    private readonly repo: WorkdayRepository,
    private readonly serviceClient: SupabaseServiceClient,
  ) {}

  async start(
    userClient: SupabaseClient,
    driverId: string,
    input: { idempotencyKey: string },
  ) {
    const key = input.idempotencyKey?.trim() ?? "";
    if (!key) {
      throw new BadRequestException("idempotencyKey is required");
    }

    const raw = await this.repo.rpcStartAtomic(userClient, key);
    if (!raw) {
      throw new BadRequestException("Failed to start workday");
    }

    if (raw.ok === false) {
      const code = String(raw.code ?? "conflict");
      if (code === "no_eligible_jobs") {
        throw new ConflictException({
          message: String(raw.message ?? "No eligible jobs"),
          code: "no_eligible_jobs",
        });
      }
      if (code === "open_workday_exists") {
        throw new ConflictException({
          message: String(raw.message ?? "Open workday exists"),
          code: "open_workday_exists",
          existingWorkdayId: raw.existingWorkdayId,
          status: raw.status,
        });
      }
      if (code === "unauthorized") {
        throw new ForbiddenException("unauthorized");
      }
      throw new BadRequestException({
        message: String(raw.message ?? "workday start failed"),
        code,
      });
    }

    const workdayId = String(raw.workdayId);
    const row = await this.repo.findById(userClient, workdayId);
    if (!row || row.driver_id !== driverId) {
      throw new ForbiddenException("Workday not accessible");
    }
    const membership = await this.repo.listMembership(userClient, workdayId);
    return {
      workday: workdayDto(row, membership),
      created: Boolean(raw.created),
    };
  }

  async getActive(userClient: SupabaseClient, driverId: string) {
    const open = await this.repo.findOpenForDriver(userClient, driverId);
    if (!open) return { workday: null };
    if (open.driver_id !== driverId) {
      throw new ForbiddenException("Workday not accessible");
    }
    if (open.status === "active") {
      await this.reconcileMembership(userClient, driverId, open.id);
    }
    const refreshed = (await this.repo.findById(userClient, open.id)) ?? open;
    const membership = await this.repo.listMembership(userClient, open.id);
    const progress = await this.getCurrentObligationProgress(
      userClient,
      driverId,
      membership,
    );
    const incomplete = progress.incompletePoints;
    const openSessions = await this.repo.listOpenSessionsForWorkday(
      userClient,
      open.id,
    );
    const execution = await this.repo.findExecutionSessionForWorkday(
      userClient,
      open.id,
    );
    return {
      workday: workdayDto(refreshed, membership, {
        incompletePoints: incomplete,
        openSessionIds: openSessions.map((s) => s.id),
        progress,
        executionSessionId: execution?.id ?? null,
      }),
    };
  }

  async getById(
    userClient: SupabaseClient,
    driverId: string,
    workdayId: string,
  ) {
    const row = await this.requireOwn(userClient, driverId, workdayId);
    if (row.status === "active") {
      await this.reconcileMembership(userClient, driverId, workdayId);
    }
    const refreshed =
      (await this.repo.findById(userClient, workdayId)) ?? row;
    const membership = await this.repo.listMembership(userClient, workdayId);
    const progress = await this.getCurrentObligationProgress(
      userClient,
      driverId,
      membership,
    );
    const execution = await this.repo.findExecutionSessionForWorkday(
      userClient,
      workdayId,
    );
    return {
      workday: workdayDto(refreshed, membership, {
        incompletePoints: progress.incompletePoints,
        progress,
        executionSessionId: execution?.id ?? null,
      }),
    };
  }

  /**
   * Mid-day reconcile: attach newly assigned active jobs; detach jobs no longer assigned.
   * Does not auto-switch Session.
   */
  async reconcileMembership(
    userClient: SupabaseClient,
    driverId: string,
    workdayId: string,
  ) {
    const workday = await this.requireOwn(userClient, driverId, workdayId);
    if (workday.status !== "active") {
      return { attached: 0, detached: 0 };
    }

    const eligible = await this.repo.listActiveJobIdsForDriver(
      userClient,
      driverId,
    );
    const eligibleIds = new Set(eligible.map((j) => j.id));
    const membership = await this.repo.listMembership(userClient, workdayId);
    const byJob = new Map(membership.map((m) => [m.job_id, m]));

    let attached = 0;
    let detached = 0;

    for (const job of eligible) {
      const existing = byJob.get(job.id);
      if (!existing) {
        const ok = await this.repo.insertMembership(userClient, {
          workday_id: workdayId,
          job_id: job.id,
          membership_source: "reconcile",
        });
        if (ok) attached += 1;
      } else if (existing.detached_at != null) {
        const ok = await this.repo.reactivateMembership(
          userClient,
          existing.id,
          "reconcile",
        );
        if (ok) attached += 1;
      }
    }

    for (const m of membership) {
      if (m.detached_at != null) continue;
      if (!eligibleIds.has(m.job_id)) {
        const ok = await this.repo.detachMembership(userClient, m.id);
        if (ok) detached += 1;
      }
    }

    return { attached, detached };
  }

  /**
   * Lock workday: active → ending. Does not claim Flutter route flush done.
   * Client should end linked Session(s) then call finalize.
   */
  async requestEnd(
    userClient: SupabaseClient,
    driverId: string,
    workdayId: string,
    input: { forceIncomplete?: boolean; endIdempotencyKey?: string },
  ) {
    const workday = await this.requireOwn(userClient, driverId, workdayId);

    if (workday.status === "completed" || workday.status === "abandoned") {
      const membership = await this.repo.listMembership(userClient, workdayId);
      return {
        workday: workdayDto(workday, membership),
        alreadyEnded: true,
      };
    }

    if (workday.status === "ending") {
      const membership = await this.repo.listMembership(userClient, workdayId);
      const openSessions = await this.repo.listOpenSessionsForWorkday(
        userClient,
        workdayId,
      );
      return {
        workday: workdayDto(workday, membership, {
          openSessionIds: openSessions.map((s) => s.id),
        }),
        alreadyEnding: true,
        requiresClientSessionEnd: openSessions.some((s) => s.status === "active"),
      };
    }

    await this.reconcileMembership(userClient, driverId, workdayId);
    const membership = await this.repo.listMembership(userClient, workdayId);
    const incomplete = await this.countCurrentObligation(
      userClient,
      driverId,
      membership,
    );

    if (incomplete > 0 && !input.forceIncomplete) {
      throw new ConflictException({
        message: "Incomplete deliveries remain",
        code: "incomplete_deliveries",
        incompletePoints: incomplete,
        requiresConfirmation: true,
      });
    }

    const ending =
      (await this.repo.markEnding(
        userClient,
        workdayId,
        input.endIdempotencyKey?.trim() || null,
      )) ?? (await this.repo.findById(userClient, workdayId));

    if (!ending || ending.status !== "ending") {
      throw new BadRequestException("Failed to mark workday ending");
    }

    const openSessions = await this.repo.listOpenSessionsForWorkday(
      userClient,
      workdayId,
    );

    return {
      workday: workdayDto(ending, membership, {
        incompletePoints: incomplete,
        openSessionIds: openSessions.map((s) => s.id),
      }),
      requiresClientSessionEnd: openSessions.length > 0,
    };
  }

  /**
   * Finalize after Sessions are no longer active.
   * Ending sessions may be completed server-side (status only — route flush is client).
   */
  async finalize(
    userClient: SupabaseClient,
    driverId: string,
    workdayId: string,
  ) {
    const workday = await this.requireOwn(userClient, driverId, workdayId);

    if (workday.status === "completed") {
      const membership = await this.repo.listMembership(userClient, workdayId);
      return {
        workday: workdayDto(workday, membership),
        alreadyCompleted: true,
      };
    }

    if (workday.status !== "ending") {
      throw new ConflictException({
        message: "Workday must be ending before finalize",
        code: "workday_not_ending",
        status: workday.status,
      });
    }

    const openSessions = await this.repo.listOpenSessionsForWorkday(
      userClient,
      workdayId,
    );
    const stillActive = openSessions.filter((s) => s.status === "active");
    if (stillActive.length > 0) {
      throw new ConflictException({
        message: "Linked session still active — end session first",
        code: "open_session_active",
        openSessionIds: stillActive.map((s) => s.id),
      });
    }

    // Complete any sessions left in ending (server status only).
    for (const s of openSessions.filter((x) => x.status === "ending")) {
      await userClient
        .from("delivery_sessions")
        .update({ status: "completed" })
        .eq("id", s.id)
        .eq("status", "ending");
    }

    const remaining = await this.repo.listOpenSessionsForWorkday(
      userClient,
      workdayId,
    );
    if (remaining.length > 0) {
      throw new ConflictException({
        message: "Open sessions remain under workday",
        code: "open_sessions_remain",
        openSessionIds: remaining.map((s) => s.id),
      });
    }

    const membership = await this.repo.listMembership(userClient, workdayId);
    const summary = await this.buildSummarySnapshot(
      userClient,
      membership,
    );

    const completed = await this.repo.markCompleted(
      userClient,
      workdayId,
      summary,
    );
    if (!completed) {
      throw new BadRequestException("Failed to complete workday");
    }

    return {
      workday: workdayDto(completed, membership),
      alreadyCompleted: false,
    };
  }

  /**
   * Current operational incomplete: active membership jobs that are still
   * assigned to this driver. Detached / reassigned jobs are excluded.
   */
  async countCurrentObligation(
    userClient: SupabaseClient,
    driverId: string,
    membership: WorkdayMembershipRow[],
  ): Promise<number> {
    const progress = await this.getCurrentObligationProgress(
      userClient,
      driverId,
      membership,
    );
    return progress.incompletePoints;
  }

  /** Authoritative live progress: active membership ∩ current driver assignment. */
  async getCurrentObligationProgress(
    userClient: SupabaseClient,
    driverId: string,
    membership: WorkdayMembershipRow[],
  ): Promise<WorkdayProgressProjection> {
    const obligationJobs = await this.resolveObligationJobIds(
      userClient,
      driverId,
      membership,
    );
    if (!obligationJobs.length) return emptyProgress();
    const progress = await this.repo.countProgressForJobs(
      userClient,
      obligationJobs,
    );
    return mapProgressProjection(progress, obligationJobs.length);
  }

  /**
   * Completed results on detached membership jobs (historical, not current obligation).
   * Schema limitation: counts all points on those jobs, not per-workday attribution.
   */
  async getHistoricalProgress(
    userClient: SupabaseClient,
    membership: WorkdayMembershipRow[],
  ): Promise<WorkdayHistoricalProgress> {
    const detachedJobIds = membership
      .filter((m) => m.detached_at != null)
      .map((m) => m.job_id);
    if (!detachedJobIds.length) {
      return { jobCount: 0, completedPoints: 0, totalPoints: 0 };
    }
    const progress = await this.repo.countProgressForJobs(
      userClient,
      detachedJobIds,
    );
    return {
      jobCount: detachedJobIds.length,
      completedPoints: progress.completedPoints,
      totalPoints: progress.totalPoints,
    };
  }

  private async resolveObligationJobIds(
    userClient: SupabaseClient,
    driverId: string,
    membership: WorkdayMembershipRow[],
  ): Promise<string[]> {
    const activeJobIds = membership
      .filter((m) => m.detached_at == null)
      .map((m) => m.job_id);
    if (!activeJobIds.length) return [];

    const eligible = await this.repo.listActiveJobIdsForDriver(
      userClient,
      driverId,
    );
    const assigned = new Set(eligible.map((j) => j.id));
    return activeJobIds.filter((id) => assigned.has(id));
  }

  async buildSummarySnapshot(
    userClient: SupabaseClient,
    membership: WorkdayMembershipRow[],
  ): Promise<WorkdaySummarySnapshot> {
    // Historical: all membership jobs ever attached (including detached).
    const jobIds = [...new Set(membership.map((m) => m.job_id))];
    const progress = await this.repo.countProgressForJobs(userClient, jobIds);
    return {
      totalPoints: progress.totalPoints,
      completedPoints: progress.completedPoints,
      incompletePoints: progress.incompletePoints,
      jobCount: jobIds.length,
      byCompany: [...progress.byCompany.values()].map((c) => ({
        companyId: c.companyId,
        totalPoints: c.total,
        completedPoints: c.completed,
      })),
      bySource: [...progress.bySource.values()].map((s) => ({
        sourceId: s.sourceId,
        totalPoints: s.total,
        completedPoints: s.completed,
      })),
    };
  }

  async requireOwn(
    userClient: SupabaseClient,
    driverId: string,
    workdayId: string,
  ): Promise<WorkdayRow> {
    const row = await this.repo.findById(userClient, workdayId);
    if (!row) {
      throw new NotFoundException("Workday not found");
    }
    if (row.driver_id !== driverId) {
      throw new ForbiddenException("Workday not accessible");
    }
    return row;
  }

  /** Used by Session start to validate link. */
  async assertCanLinkSession(
    userClient: SupabaseClient,
    driverId: string,
    workdayId: string,
    jobId: string,
  ): Promise<WorkdayRow> {
    const workday = await this.requireOwn(userClient, driverId, workdayId);
    if (workday.status !== "active") {
      throw new ConflictException({
        message: "Workday is not active for new sessions",
        code: "workday_not_active",
        status: workday.status,
      });
    }
    const membership = await this.repo.findMembership(
      userClient,
      workdayId,
      jobId,
    );
    if (!membership || membership.detached_at != null) {
      throw new ForbiddenException({
        message: "Job is not an active workday membership",
        code: "job_not_in_workday_membership",
      });
    }
    return workday;
  }

  /** B3 execution Session — Workday active, driver-owned, membership present. */
  async assertCanStartExecutionSession(
    userClient: SupabaseClient,
    driverId: string,
    workdayId: string,
  ): Promise<WorkdayRow> {
    const workday = await this.requireOwn(userClient, driverId, workdayId);
    if (workday.status !== "active") {
      throw new ConflictException({
        message: "Workday is not active for execution session",
        code: "workday_not_active",
        status: workday.status,
      });
    }
    const membership = await this.repo.listMembership(userClient, workdayId);
    const activeCount = membership.filter((m) => m.detached_at == null).length;
    if (activeCount === 0) {
      throw new ConflictException({
        message: "Workday has no active membership",
        code: "workday_no_membership",
      });
    }
    return workday;
  }

  /** Multi-job progress for job-neutral execution Session — delegates to Workday progress. */
  async getExecutionSessionProgress(
    userClient: SupabaseClient,
    driverId: string,
    workdayId: string,
  ): Promise<{
    totalPoints: number;
    completedPoints: number;
    incompletePoints: number;
    failedPoints: number;
    totalQuantity: number;
  }> {
    await this.requireOwn(userClient, driverId, workdayId);
    const membership = await this.repo.listMembership(userClient, workdayId);
    const progress = await this.getCurrentObligationProgress(
      userClient,
      driverId,
      membership,
    );
    return {
      totalPoints: progress.totalPoints,
      completedPoints: progress.completedPoints,
      incompletePoints: progress.incompletePoints,
      failedPoints: 0,
      totalQuantity: 0,
    };
  }

  /** Workday-first primary report (B3-2). Driver-owned only. */
  async report(
    userClient: SupabaseClient,
    driverId: string,
    workdayId: string,
  ) {
    const row = await this.requireOwn(userClient, driverId, workdayId);
    const membership = await this.repo.listMembership(userClient, workdayId);

    let progress: WorkdayProgressProjection;
    let progressSource: "snapshot" | "live";

    if (
      row.status === "completed" &&
      isValidSummarySnapshot(row.summary_snapshot)
    ) {
      progress = progressFromSnapshot(row.summary_snapshot);
      progressSource = "snapshot";
    } else {
      progress = await this.getCurrentObligationProgress(
        userClient,
        driverId,
        membership,
      );
      progressSource = "live";
    }

    const historical =
      row.status !== "completed"
        ? await this.getHistoricalProgress(userClient, membership)
        : null;

    const enriched = await this.enrichProgressLabels(userClient, progress);
    const routeSummary = await this.buildRouteSummary(userClient, workdayId);
    const execution = await this.repo.findExecutionSessionForWorkday(
      userClient,
      workdayId,
    );

    return {
      workdayId: row.id,
      status: row.status,
      serviceDate: row.service_date,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      durationSeconds: computeDurationSeconds(row),
      progress: enriched,
      progressSource,
      historicalCompleted:
        historical && historical.completedPoints > 0 ? historical : null,
      route: routeSummary,
      executionSessionId: execution?.id ?? null,
    };
  }

  /** Full route details — separate from report to keep report payload bounded. */
  async getRouteDetails(
    userClient: SupabaseClient,
    driverId: string,
    workdayId: string,
  ) {
    await this.requireOwn(userClient, driverId, workdayId);
    const sessions = await this.repo.listAllSessionsForWorkday(
      userClient,
      workdayId,
    );
    const routeSessionIds = this.resolveRouteSessionIds(sessions);
    if (!routeSessionIds.length) {
      return { workdayId, segments: [] };
    }

    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const rawPoints = await this.repo.listRoutePointsForSessions(
      userClient,
      routeSessionIds,
    );

    const bySession = new Map<string, typeof rawPoints>();
    for (const p of rawPoints) {
      const sid = p.session_id as string;
      const list = bySession.get(sid) ?? [];
      list.push(p);
      bySession.set(sid, list);
    }

    const segments = routeSessionIds.map((sessionId) => {
      const session = sessionById.get(sessionId);
      const points = (bySession.get(sessionId) ?? [])
        .map((p) => {
          const loc = parsePointLocation(p.location);
          if (!loc) return null;
          return {
            sequenceNo: p.sequence_no,
            recordedAt: p.recorded_at,
            latitude: loc.latitude,
            longitude: loc.longitude,
            accuracyM: p.accuracy_m,
            speedMps: p.speed_mps,
            headingDeg: p.heading_deg,
          };
        })
        .filter((p): p is NonNullable<typeof p> => p != null);

      return {
        sessionId,
        sessionRole: session?.session_role ?? "unknown",
        deliveryJobId: session?.delivery_job_id ?? null,
        points,
        start:
          points.length > 0
            ? {
                latitude: points[0].latitude,
                longitude: points[0].longitude,
              }
            : null,
        end:
          points.length > 0
            ? {
                latitude: points[points.length - 1].latitude,
                longitude: points[points.length - 1].longitude,
              }
            : null,
      };
    });

    return { workdayId, segments };
  }

  private resolveRouteSessionIds(sessions: WorkdaySessionRow[]): string[] {
    const execution = sessions.find(
      (s) => s.session_role === "workday_execution",
    );
    if (execution) return [execution.id];
    return sessions.map((s) => s.id);
  }

  async buildRouteSummary(
    userClient: SupabaseClient,
    workdayId: string,
  ): Promise<WorkdayRouteSummary> {
    const sessions = await this.repo.listAllSessionsForWorkday(
      userClient,
      workdayId,
    );
    const routeSessionIds = this.resolveRouteSessionIds(sessions);
    if (!routeSessionIds.length) {
      return {
        sessionIds: [],
        pointCount: 0,
        firstRecordedAt: null,
        lastRecordedAt: null,
        start: null,
        end: null,
        segments: [],
      };
    }

    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    const rawPoints = await this.repo.listRoutePointsForSessions(
      userClient,
      routeSessionIds,
    );

    const bySession = new Map<string, typeof rawPoints>();
    for (const p of rawPoints) {
      const sid = p.session_id as string;
      const list = bySession.get(sid) ?? [];
      list.push(p);
      bySession.set(sid, list);
    }

    const segments: WorkdayRouteSegmentSummary[] = routeSessionIds.map(
      (sessionId) => {
        const session = sessionById.get(sessionId);
        const points = bySession.get(sessionId) ?? [];
        const parsed = points
          .map((p) => ({
            recordedAt: p.recorded_at,
            loc: parsePointLocation(p.location),
          }))
          .filter((p) => p.loc != null);

        return {
          sessionId,
          sessionRole: session?.session_role ?? "unknown",
          pointCount: points.length,
          firstRecordedAt: parsed[0]?.recordedAt ?? null,
          lastRecordedAt: parsed[parsed.length - 1]?.recordedAt ?? null,
          start: parsed[0]?.loc ?? null,
          end: parsed[parsed.length - 1]?.loc ?? null,
        };
      },
    );

    const allParsed = rawPoints
      .map((p) => ({
        recordedAt: p.recorded_at,
        loc: parsePointLocation(p.location),
      }))
      .filter((p) => p.loc != null)
      .sort(
        (a, b) =>
          new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
      );

    return {
      sessionIds: routeSessionIds,
      pointCount: rawPoints.length,
      firstRecordedAt: allParsed[0]?.recordedAt ?? null,
      lastRecordedAt: allParsed[allParsed.length - 1]?.recordedAt ?? null,
      start: allParsed[0]?.loc ?? null,
      end: allParsed[allParsed.length - 1]?.loc ?? null,
      segments,
    };
  }

  private async enrichProgressLabels(
    userClient: SupabaseClient,
    progress: WorkdayProgressProjection,
  ): Promise<WorkdayProgressProjection> {
    const companyIds = progress.byCompany
      .map((c) => c.companyId)
      .filter((id): id is string => Boolean(id));
    const sourceIds = progress.bySource
      .map((s) => s.sourceId)
      .filter((id): id is string => Boolean(id));

    const [companies, sources] = await Promise.all([
      this.listCompanyLabels(companyIds),
      sourceIds.length
        ? this.repo.listSourcesByIds(userClient, sourceIds)
        : Promise.resolve([]),
    ]);

    const companyNameById = new Map(
      companies.map((c) => [c.id, c.displayName]),
    );
    const sourceNameById = new Map(
      sources.map((s) => [s.id, s.display_name]),
    );

    return {
      ...progress,
      byCompany: progress.byCompany.map((c) => ({
        ...c,
        displayName: c.companyId
          ? (companyNameById.get(c.companyId) ?? "")
          : "",
      })),
      bySource: progress.bySource.map((s) => ({
        ...s,
        displayName: s.sourceId
          ? (sourceNameById.get(s.sourceId) ?? "")
          : "",
      })),
    };
  }

  private async listCompanyLabels(
    companyIds: string[],
  ): Promise<Array<{ id: string; displayName: string }>> {
    if (!companyIds.length) return [];
    const client = this.serviceClient.getOrNull();
    if (!client) {
      this.logger.warn("service client unavailable for company labels");
      return [];
    }
    const { data, error } = await client
      .from("companies")
      .select("id, name")
      .in("id", companyIds);
    if (error) {
      this.logger.warn(`companies label lookup failed code=${error.code}`);
      return [];
    }
    return (data ?? []).map((row) => ({
      id: row.id as string,
      displayName: (row.name as string) ?? "",
    }));
  }
}
