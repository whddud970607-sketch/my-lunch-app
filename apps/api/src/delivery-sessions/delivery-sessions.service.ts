import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WorkdayExecutionConfig } from "../config/workday-execution.config";
import { parsePointLocation } from "../deliveries/location.util";
import { WorkdayService } from "../workday/workday.service";
import { filterBatchForSessionStatus } from "./delivery-session.rules";
import {
  DeliverySessionsRepository,
  type DeliverySessionRow,
  type ProgressCounts,
} from "./delivery-sessions.repository";
import {
  isExecutionSessionRole,
  isJobBoundSessionRole,
  resolveSessionStartMode,
} from "./session-role.util";

function toSessionDto(
  row: DeliverySessionRow,
  progress?: ProgressCounts,
  extras?: { lastUploadedSequence?: number; durationSeconds?: number | null },
) {
  const started = new Date(row.started_at).getTime();
  const ended = row.ended_at ? new Date(row.ended_at).getTime() : null;
  const durationSeconds =
    extras?.durationSeconds ??
    (ended != null ? Math.max(0, Math.floor((ended - started) / 1000)) : null);

  return {
    id: row.id,
    driverId: row.driver_id,
    deliveryJobId: row.delivery_job_id,
    workdayId: row.workday_id ?? null,
    sessionRole: row.session_role,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    idempotencyKey: row.idempotency_key,
    summarySnapshot: row.summary_snapshot,
    progress: progress ?? null,
    durationSeconds,
    lastUploadedSequence: extras?.lastUploadedSequence ?? null,
  };
}

@Injectable()
export class DeliverySessionsService {
  constructor(
    private readonly repo: DeliverySessionsRepository,
    private readonly workdays: WorkdayService,
    private readonly executionConfig: WorkdayExecutionConfig,
  ) {}

  async start(
    userClient: SupabaseClient,
    driverId: string,
    input: {
      idempotencyKey: string;
      deliveryJobId?: string;
      clientStartedAt?: string;
      workdayId?: string;
    },
  ) {
    if (!input.idempotencyKey?.trim()) {
      throw new BadRequestException("idempotencyKey is required");
    }

    const idempotencyKey = input.idempotencyKey.trim();
    const mode = resolveSessionStartMode(
      input,
      this.executionConfig.isExecutionSessionEnabled(),
    );

    if (mode.mode === "invalid") {
      throw new BadRequestException(mode.reason);
    }

    const byKey = await this.repo.findSessionByIdempotency(
      userClient,
      driverId,
      idempotencyKey,
    );
    if (byKey) {
      const progress = await this.resolveProgress(userClient, driverId, byKey);
      return { session: toSessionDto(byKey, progress), created: false };
    }

    if (mode.mode === "workday_execution") {
      return this.startExecutionSession(userClient, driverId, {
        workdayId: mode.workdayId,
        idempotencyKey,
        clientStartedAt: input.clientStartedAt,
      });
    }

    const open = await this.repo.findOpenSessionForDriver(userClient, driverId);
    if (open) {
      throw new ConflictException({
        message: "An active delivery session already exists",
        existingSessionId: open.id,
        status: open.status,
      });
    }

    const job = await this.repo.findActiveJobForDriver(
      userClient,
      driverId,
      mode.mode === "workday_job_slice"
        ? mode.deliveryJobId
        : input.deliveryJobId,
    );
    if (!job) {
      throw new NotFoundException("No active delivery job found");
    }
    if (job.driver_id !== driverId) {
      throw new ForbiddenException("Job is not assigned to this driver");
    }
    if (job.status !== "active") {
      throw new BadRequestException("Delivery job is not active");
    }

    let workdayId: string | null = null;
    let sessionRole: "legacy_job" | "workday_job_slice" = "legacy_job";

    if (mode.mode === "workday_job_slice") {
      await this.workdays.assertCanLinkSession(
        userClient,
        driverId,
        mode.workdayId,
        job.id,
      );
      workdayId = mode.workdayId;
      sessionRole = "workday_job_slice";
    }

    const created = await this.repo.insertSession(userClient, {
      driver_id: driverId,
      delivery_job_id: job.id,
      session_role: sessionRole,
      idempotency_key: idempotencyKey,
      client_started_at: input.clientStartedAt ?? null,
      workday_id: workdayId,
    });

    if (!created) {
      const raced = await this.repo.findOpenSessionForDriver(
        userClient,
        driverId,
      );
      if (raced) {
        throw new ConflictException({
          message: "An active delivery session already exists",
          existingSessionId: raced.id,
          status: raced.status,
        });
      }
      throw new BadRequestException("Failed to start delivery session");
    }

    const progress = await this.resolveProgress(userClient, driverId, created);
    return { session: toSessionDto(created, progress), created: true };
  }

  private async startExecutionSession(
    userClient: SupabaseClient,
    driverId: string,
    input: {
      workdayId: string;
      idempotencyKey: string;
      clientStartedAt?: string;
    },
  ) {
    await this.workdays.assertCanStartExecutionSession(
      userClient,
      driverId,
      input.workdayId,
    );

    const existing = await this.repo.findExecutionSessionForWorkday(
      userClient,
      input.workdayId,
    );
    if (existing) {
      if (existing.driver_id !== driverId) {
        throw new ForbiddenException("Execution session not accessible");
      }
      const progress = await this.resolveProgress(
        userClient,
        driverId,
        existing,
      );
      return { session: toSessionDto(existing, progress), created: false };
    }

    const open = await this.repo.findOpenSessionForDriver(userClient, driverId);
    if (open) {
      throw new ConflictException({
        message: "An active delivery session already exists",
        existingSessionId: open.id,
        status: open.status,
      });
    }

    const created = await this.repo.insertSession(userClient, {
      driver_id: driverId,
      delivery_job_id: null,
      session_role: "workday_execution",
      workday_id: input.workdayId,
      idempotency_key: input.idempotencyKey,
      client_started_at: input.clientStartedAt ?? null,
    });

    if (!created) {
      const raced = await this.repo.findExecutionSessionForWorkday(
        userClient,
        input.workdayId,
      );
      if (raced) {
        const progress = await this.resolveProgress(
          userClient,
          driverId,
          raced,
        );
        return { session: toSessionDto(raced, progress), created: false };
      }
      const openAgain = await this.repo.findOpenSessionForDriver(
        userClient,
        driverId,
      );
      if (openAgain) {
        throw new ConflictException({
          message: "An active delivery session already exists",
          existingSessionId: openAgain.id,
          status: openAgain.status,
        });
      }
      throw new BadRequestException("Failed to start execution session");
    }

    const progress = await this.resolveProgress(userClient, driverId, created);
    return { session: toSessionDto(created, progress), created: true };
  }

  private async resolveProgress(
    userClient: SupabaseClient,
    driverId: string,
    row: DeliverySessionRow,
  ): Promise<ProgressCounts> {
    if (isExecutionSessionRole(row.session_role)) {
      if (!row.workday_id) {
        return {
          totalPoints: 0,
          completedPoints: 0,
          incompletePoints: 0,
          failedPoints: 0,
          totalQuantity: 0,
        };
      }
      return this.workdays.getExecutionSessionProgress(
        userClient,
        driverId,
        row.workday_id,
      );
    }
    if (!row.delivery_job_id) {
      return {
        totalPoints: 0,
        completedPoints: 0,
        incompletePoints: 0,
        failedPoints: 0,
        totalQuantity: 0,
      };
    }
    return this.repo.countJobProgress(userClient, row.delivery_job_id);
  }

  async getActive(userClient: SupabaseClient, driverId: string) {
    const open = await this.repo.findOpenSessionForDriver(userClient, driverId);
    if (!open) return { session: null };
    const progress = await this.resolveProgress(userClient, driverId, open);
    const lastUploadedSequence = await this.repo.maxSequence(
      userClient,
      open.id,
    );
    return {
      session: toSessionDto(open, progress, { lastUploadedSequence }),
    };
  }

  async getById(
    userClient: SupabaseClient,
    driverId: string,
    sessionId: string,
  ) {
    const row = await this.requireOwnSession(userClient, driverId, sessionId);
    const progress = await this.resolveProgress(userClient, driverId, row);
    const lastUploadedSequence = await this.repo.maxSequence(
      userClient,
      row.id,
    );
    return {
      session: toSessionDto(row, progress, { lastUploadedSequence }),
    };
  }

  async ingestRouteBatch(
    userClient: SupabaseClient,
    driverId: string,
    sessionId: string,
    points: Array<{
      sequenceNo: number;
      recordedAt: string;
      latitude: number;
      longitude: number;
      accuracyM?: number | null;
      speedMps?: number | null;
      headingDeg?: number | null;
      source?: string;
    }>,
  ) {
    const session = await this.requireOwnSession(
      userClient,
      driverId,
      sessionId,
    );

    if (session.status === "completed" || session.status === "abandoned") {
      throw new BadRequestException("Session is closed; route points rejected");
    }
    if (session.status !== "active" && session.status !== "ending") {
      throw new BadRequestException("Session does not accept route points");
    }

    const structurallyValid = points.filter(
      (p) =>
        Number.isFinite(p.sequenceNo) &&
        p.sequenceNo >= 1 &&
        !!p.recordedAt &&
        Number.isFinite(p.latitude) &&
        Number.isFinite(p.longitude) &&
        !Number.isNaN(new Date(p.recordedAt).getTime()),
    );

    const filtered = filterBatchForSessionStatus({
      sessionStatus: session.status,
      endedAtIso: session.ended_at,
      points: structurallyValid.map((p) => ({
        sequenceNo: p.sequenceNo,
        recordedAt: p.recordedAt,
      })),
    });
    if (filtered.rejectClosed) {
      throw new BadRequestException("Session is closed; route points rejected");
    }

    const acceptedSeq = new Set(filtered.accepted.map((p) => p.sequenceNo));
    const accepted = structurallyValid.filter((p) =>
      acceptedSeq.has(p.sequenceNo),
    );
    const rejectedAfterEnd = filtered.rejectedAfterEnd;

    const inserts = accepted.map((p) => ({
      session_id: sessionId,
      driver_id: driverId,
      sequence_no: Math.floor(p.sequenceNo),
      recorded_at: p.recordedAt,
      locationEwkt: `SRID=4326;POINT(${p.longitude} ${p.latitude})`,
      accuracy_m: p.accuracyM ?? null,
      speed_mps: p.speedMps ?? null,
      heading_deg: p.headingDeg ?? null,
      source: p.source ?? "gps",
    }));

    const result = await this.repo.insertRoutePointsBatch(userClient, inserts);
    const lastUploadedSequence = await this.repo.maxSequence(
      userClient,
      sessionId,
    );

    return {
      accepted: accepted.length,
      inserted: result.inserted,
      conflictSkipped: result.conflictSkipped,
      rejectedAfterEnd,
      lastUploadedSequence,
      sessionStatus: session.status,
    };
  }

  async end(
    userClient: SupabaseClient,
    driverId: string,
    sessionId: string,
    input: { forceIncomplete?: boolean; finalize?: boolean },
  ) {
    const session = await this.requireOwnSession(
      userClient,
      driverId,
      sessionId,
    );

    if (session.status === "completed") {
      const progress = await this.resolveProgress(
        userClient,
        driverId,
        session,
      );
      return {
        session: toSessionDto(session, progress),
        alreadyCompleted: true,
      };
    }

    if (session.status === "ending") {
      const progress =
        (session.summary_snapshot as ProgressCounts | undefined) ??
        (await this.resolveProgress(userClient, driverId, session));
      if (input.finalize === true) {
        const completed = await this.repo.markCompleted(userClient, sessionId);
        return {
          session: toSessionDto(completed ?? session, progress),
          alreadyCompleted: false,
          finalized: true,
        };
      }
      return {
        session: toSessionDto(session, progress),
        alreadyCompleted: false,
        finalized: false,
      };
    }

    if (session.status !== "active") {
      throw new BadRequestException("Session cannot be ended");
    }

    const progress = await this.resolveProgress(userClient, driverId, session);

    if (progress.incompletePoints > 0 && !input.forceIncomplete) {
      throw new ConflictException({
        message: "Incomplete deliveries remain",
        incompletePoints: progress.incompletePoints,
        progress,
        requiresConfirmation: true,
      });
    }

    const ending = await this.repo.markEnding(userClient, sessionId, progress);
    if (!ending) {
      throw new BadRequestException("Failed to end session");
    }

    let finalized = ending;
    if (input.finalize === true) {
      finalized =
        (await this.repo.markCompleted(userClient, sessionId)) ?? ending;
    }

    return {
      session: toSessionDto(finalized, progress),
      alreadyCompleted: false,
      finalized: input.finalize === true,
    };
  }

  async finalize(
    userClient: SupabaseClient,
    driverId: string,
    sessionId: string,
  ) {
    const session = await this.requireOwnSession(
      userClient,
      driverId,
      sessionId,
    );
    if (session.status === "completed") {
      return { session: toSessionDto(session), alreadyCompleted: true };
    }
    if (session.status !== "ending") {
      throw new BadRequestException("Session must be ending to finalize");
    }
    const completed = await this.repo.markCompleted(userClient, sessionId);
    if (!completed) {
      throw new BadRequestException("Failed to finalize session");
    }
    return { session: toSessionDto(completed), alreadyCompleted: false };
  }

  async report(
    userClient: SupabaseClient,
    driverId: string,
    sessionId: string,
  ) {
    const session = await this.requireOwnSession(
      userClient,
      driverId,
      sessionId,
    );

    if (isExecutionSessionRole(session.session_role)) {
      throw new BadRequestException({
        message: "Use Workday report for execution sessions (B3-2)",
        code: "workday_execution_report_deferred",
      });
    }

    if (session.status === "active") {
      throw new BadRequestException("Report available after session end");
    }

    if (!isJobBoundSessionRole(session.session_role) || !session.delivery_job_id) {
      throw new BadRequestException("Session report not available for this role");
    }

    const progress =
      (session.summary_snapshot as ProgressCounts | undefined) &&
      typeof (session.summary_snapshot as ProgressCounts).totalPoints ===
        "number"
        ? (session.summary_snapshot as ProgressCounts)
        : await this.repo.countJobProgress(
            userClient,
            session.delivery_job_id,
          );

    const rawPoints = await this.repo.listRoutePoints(userClient, sessionId);
    const routePoints = rawPoints
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

    const dto = toSessionDto(session, progress);
    return {
      session: dto,
      route: {
        sessionId: session.id,
        points: routePoints,
        start:
          routePoints.length > 0
            ? {
                latitude: routePoints[0].latitude,
                longitude: routePoints[0].longitude,
              }
            : null,
        end:
          routePoints.length > 0
            ? {
                latitude: routePoints[routePoints.length - 1].latitude,
                longitude: routePoints[routePoints.length - 1].longitude,
              }
            : null,
      },
      progress,
    };
  }

  async listRoutePointsForSession(
    userClient: SupabaseClient,
    driverId: string,
    sessionId: string,
    fromSequence?: number,
  ) {
    const session = await this.requireOwnSession(
      userClient,
      driverId,
      sessionId,
    );
    const rawPoints = await this.repo.listRoutePoints(
      userClient,
      sessionId,
      fromSequence,
    );
    const points = rawPoints
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
      sessionId: session.id,
      status: session.status,
      points,
      lastUploadedSequence:
        points.length > 0 ? points[points.length - 1].sequenceNo : 0,
    };
  }

  private async requireOwnSession(
    userClient: SupabaseClient,
    driverId: string,
    sessionId: string,
  ): Promise<DeliverySessionRow> {
    const row = await this.repo.findSessionById(userClient, sessionId);
    if (!row || row.driver_id !== driverId) {
      throw new NotFoundException("Session not found");
    }
    return row;
  }
}
