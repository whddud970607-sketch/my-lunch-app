import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { WorkdayService } from "./workday.service";
import type { WorkdayRepository } from "./workday.repository";
import type { WorkdayMembershipRow, WorkdayRow } from "./workday.types";
import type { SupabaseServiceClient } from "../supabase/supabase-service.client";

describe("WorkdayService", () => {
  const driverA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const driverB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const workdayId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const jobA = "11111111-1111-1111-1111-111111111111";
  const jobB = "22222222-2222-2222-2222-222222222222";
  const companyA = "33333333-3333-3333-3333-333333333333";
  const sourceA = "44444444-4444-4444-4444-444444444444";
  const execSessionId = "55555555-5555-5555-5555-555555555555";

  function baseWorkday(over: Partial<WorkdayRow> = {}): WorkdayRow {
    return {
      id: workdayId,
      driver_id: driverA,
      service_date: "2026-08-30",
      status: "active",
      started_at: "2026-08-30T00:00:00Z",
      ended_at: null,
      start_idempotency_key: "key-1",
      end_idempotency_key: null,
      summary_snapshot: {},
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
      ...over,
    };
  }

  function membership(
    over: Partial<WorkdayMembershipRow> & { job_id: string },
  ): WorkdayMembershipRow {
    return {
      id: `m-${over.job_id}`,
      workday_id: workdayId,
      attached_at: "2026-08-30T00:00:00Z",
      detached_at: null,
      membership_source: "start_snapshot",
      ...over,
    };
  }

  function progressResult(
    over: Partial<{
      totalPoints: number;
      completedPoints: number;
      incompletePoints: number;
    }> = {},
  ) {
    return {
      totalPoints: over.totalPoints ?? 3,
      completedPoints: over.completedPoints ?? 1,
      incompletePoints: over.incompletePoints ?? 2,
      byCompany: new Map([
        [
          companyA,
          {
            companyId: companyA,
            total: over.totalPoints ?? 3,
            completed: over.completedPoints ?? 1,
          },
        ],
      ]),
      bySource: new Map([
        [
          sourceA,
          {
            sourceId: sourceA,
            total: over.totalPoints ?? 3,
            completed: over.completedPoints ?? 1,
          },
        ],
      ]),
    };
  }

  function mockServiceClient(
    companies: Array<{ id: string; name: string }> = [],
  ) {
    return {
      getOrNull: () => ({
        from: (table: string) => {
          if (table !== "companies") {
            return {
              select: () => ({
                in: async () => ({ data: [], error: null }),
              }),
            };
          }
          return {
            select: () => ({
              in: async (_col: string, ids: string[]) => ({
                data: companies.filter((c) => ids.includes(c.id)),
                error: null,
              }),
            }),
          };
        },
      }),
    } as unknown as SupabaseServiceClient;
  }

  function mockRepo(partial: Partial<WorkdayRepository>) {
    return partial as unknown as WorkdayRepository;
  }

  function createService(
    repo: WorkdayRepository,
    companies: Array<{ id: string; name: string }> = [],
  ) {
    return new WorkdayService(repo, mockServiceClient(companies));
  }

  it("start returns created workday from atomic rpc", async () => {
    const repo = mockRepo({
      rpcStartAtomic: async () => ({
        ok: true,
        created: true,
        workdayId,
      }),
      findById: async () => baseWorkday(),
      listMembership: async () => [
        membership({ job_id: jobA }),
        membership({ job_id: jobB }),
      ],
    });
    const service = createService(repo);
    const result = await service.start({} as never, driverA, {
      idempotencyKey: "key-1",
    });
    expect(result.created).toBe(true);
    expect(result.workday.membership).toHaveLength(2);
    expect(result.workday.driverId).toBe(driverA);
  });

  it("start rejects zero eligible jobs", async () => {
    const repo = mockRepo({
      rpcStartAtomic: async () => ({
        ok: false,
        code: "no_eligible_jobs",
        message: "No eligible jobs to start a workday",
      }),
    });
    const service = createService(repo);
    await expect(
      service.start({} as never, driverA, { idempotencyKey: "k" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("start is idempotent on same key", async () => {
    const repo = mockRepo({
      rpcStartAtomic: async () => ({
        ok: true,
        created: false,
        workdayId,
      }),
      findById: async () => baseWorkday(),
      listMembership: async () => [membership({ job_id: jobA })],
    });
    const service = createService(repo);
    const result = await service.start({} as never, driverA, {
      idempotencyKey: "key-1",
    });
    expect(result.created).toBe(false);
  });

  it("forged driver cannot read other workday", async () => {
    const repo = mockRepo({
      findById: async () => baseWorkday({ driver_id: driverA }),
    });
    const service = createService(repo);
    await expect(
      service.getById({} as never, driverB, workdayId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("forged driver cannot load workday report", async () => {
    const repo = mockRepo({
      findById: async () => baseWorkday({ driver_id: driverA }),
    });
    const service = createService(repo);
    await expect(
      service.report({} as never, driverB, workdayId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("assertCanLinkSession rejects ending workday", async () => {
    const repo = mockRepo({
      findById: async () => baseWorkday({ status: "ending" }),
    });
    const service = createService(repo);
    await expect(
      service.assertCanLinkSession({} as never, driverA, workdayId, jobA),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("assertCanLinkSession rejects job not in membership", async () => {
    const repo = mockRepo({
      findById: async () => baseWorkday(),
      findMembership: async () => null,
    });
    const service = createService(repo);
    await expect(
      service.assertCanLinkSession({} as never, driverA, workdayId, jobA),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("assertCanLinkSession rejects detached membership", async () => {
    const repo = mockRepo({
      findById: async () => baseWorkday(),
      findMembership: async () =>
        membership({ job_id: jobA, detached_at: "2026-08-30T01:00:00Z" }),
    });
    const service = createService(repo);
    await expect(
      service.assertCanLinkSession({} as never, driverA, workdayId, jobA),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("incomplete obligation excludes detached unassigned jobs", async () => {
    const repo = mockRepo({
      listActiveJobIdsForDriver: async () => [
        { id: jobA, company_id: null, source_id: null, status: "active" },
      ],
      countProgressForJobs: async (_client, ids) => {
        expect(ids).toEqual([jobA]);
        return progressResult({ totalPoints: 2, completedPoints: 1, incompletePoints: 1 });
      },
    });
    const service = createService(repo);
    const count = await service.countCurrentObligation({} as never, driverA, [
      membership({ job_id: jobA }),
      membership({
        job_id: jobB,
        detached_at: "2026-08-30T02:00:00Z",
      }),
    ]);
    expect(count).toBe(1);
  });

  it("current obligation excludes reassigned jobs no longer assigned", async () => {
    const repo = mockRepo({
      listActiveJobIdsForDriver: async () => [],
      countProgressForJobs: async () => progressResult({ totalPoints: 0, completedPoints: 0, incompletePoints: 0 }),
    });
    const service = createService(repo);
    const progress = await service.getCurrentObligationProgress(
      {} as never,
      driverA,
      [membership({ job_id: jobA })],
    );
    expect(progress.totalPoints).toBe(0);
    expect(progress.incompletePoints).toBe(0);
  });

  it("multi-job progress aggregates obligation jobs", async () => {
    const repo = mockRepo({
      listActiveJobIdsForDriver: async () => [
        { id: jobA, company_id: companyA, source_id: sourceA, status: "active" },
        { id: jobB, company_id: companyA, source_id: sourceA, status: "active" },
      ],
      countProgressForJobs: async (_client, ids) => {
        expect(ids.sort()).toEqual([jobA, jobB].sort());
        return progressResult({ totalPoints: 10, completedPoints: 7, incompletePoints: 3 });
      },
    });
    const service = createService(repo);
    const progress = await service.getCurrentObligationProgress(
      {} as never,
      driverA,
      [membership({ job_id: jobA }), membership({ job_id: jobB })],
    );
    expect(progress.jobCount).toBe(2);
    expect(progress.totalPoints).toBe(10);
    expect(progress.incompletePoints).toBe(3);
  });

  it("execution session progress delegates to workday obligation progress", async () => {
    const repo = mockRepo({
      findById: async () => baseWorkday(),
      listMembership: async () => [membership({ job_id: jobA })],
      listActiveJobIdsForDriver: async () => [
        { id: jobA, company_id: null, source_id: null, status: "active" },
      ],
      countProgressForJobs: async () =>
        progressResult({ totalPoints: 4, completedPoints: 3, incompletePoints: 1 }),
    });
    const service = createService(repo);
    const progress = await service.getExecutionSessionProgress(
      {} as never,
      driverA,
      workdayId,
    );
    expect(progress.totalPoints).toBe(4);
    expect(progress.incompletePoints).toBe(1);
    expect(progress.failedPoints).toBe(0);
  });

  it("getActive includes progress and executionSessionId", async () => {
    const repo = mockRepo({
      findOpenForDriver: async () => baseWorkday(),
      findById: async () => baseWorkday(),
      listMembership: async () => [membership({ job_id: jobA })],
      listActiveJobIdsForDriver: async () => [
        { id: jobA, company_id: null, source_id: null, status: "active" },
      ],
      countProgressForJobs: async () =>
        progressResult({ totalPoints: 5, completedPoints: 2, incompletePoints: 3 }),
      listOpenSessionsForWorkday: async () => [
        { id: execSessionId, status: "active", delivery_job_id: null },
      ],
      findExecutionSessionForWorkday: async () => ({
        id: execSessionId,
        status: "active",
        delivery_job_id: null,
        session_role: "workday_execution",
        started_at: "2026-08-30T00:00:00Z",
        ended_at: null,
      }),
      insertMembership: async () => true,
      reactivateMembership: async () => true,
      detachMembership: async () => true,
    });
    const service = createService(repo);
    const result = await service.getActive({} as never, driverA);
    expect(result.workday?.progress?.totalPoints).toBe(5);
    expect(result.workday?.executionSessionId).toBe(execSessionId);
    expect(result.workday?.incompletePoints).toBe(3);
  });

  it("requestEnd requires confirmation when incomplete", async () => {
    const repo = mockRepo({
      findById: async () => baseWorkday(),
      listMembership: async () => [membership({ job_id: jobA })],
      listActiveJobIdsForDriver: async () => [
        { id: jobA, company_id: null, source_id: null, status: "active" },
      ],
      countProgressForJobs: async () => progressResult(),
      insertMembership: async () => true,
      reactivateMembership: async () => true,
      detachMembership: async () => true,
    });
    const service = createService(repo);
    await expect(
      service.requestEnd({} as never, driverA, workdayId, {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("finalize rejects when active session remains", async () => {
    const repo = mockRepo({
      findById: async () => baseWorkday({ status: "ending" }),
      listOpenSessionsForWorkday: async () => [
        { id: "sess-1", status: "active", delivery_job_id: jobA },
      ],
    });
    const service = createService(repo);
    await expect(
      service.finalize({} as never, driverA, workdayId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("summary snapshot has no PII fields", async () => {
    const repo = mockRepo({
      countProgressForJobs: async () => ({
        totalPoints: 5,
        completedPoints: 2,
        incompletePoints: 3,
        byCompany: new Map([
          ["null", { companyId: null, total: 5, completed: 2 }],
        ]),
        bySource: new Map(),
      }),
    });
    const service = createService(repo);
    const summary = await service.buildSummarySnapshot({} as never, [
      membership({ job_id: jobA }),
    ]);
    const blob = JSON.stringify(summary);
    expect(blob).not.toMatch(/customer|phone|address|access|tracking|otp/i);
    expect(summary.jobCount).toBe(1);
    expect(summary.totalPoints).toBe(5);
  });

  it("active report uses live progress and null duration", async () => {
    const repo = mockRepo({
      findById: async () => baseWorkday({ status: "active", ended_at: null }),
      listMembership: async () => [membership({ job_id: jobA })],
      listActiveJobIdsForDriver: async () => [
        { id: jobA, company_id: companyA, source_id: sourceA, status: "active" },
      ],
      countProgressForJobs: async () =>
        progressResult({ totalPoints: 6, completedPoints: 4, incompletePoints: 2 }),
      listSourcesByIds: async () => [
        { id: sourceA, display_name: "Source A" },
      ],
      listAllSessionsForWorkday: async () => [],
      findExecutionSessionForWorkday: async () => null,
    });
    const service = createService(repo, [
      { id: companyA, name: "Company A" },
    ]);
    const report = await service.report({} as never, driverA, workdayId);
    expect(report.progressSource).toBe("live");
    expect(report.durationSeconds).toBeNull();
    expect(report.progress.totalPoints).toBe(6);
    expect(report.progress.byCompany[0]?.displayName).toBe("Company A");
    expect(JSON.stringify(report)).not.toMatch(
      /phone|customer|access|secret|address/i,
    );
  });

  it("completed report prefers finalize snapshot", async () => {
    const snapshot = {
      totalPoints: 8,
      completedPoints: 7,
      incompletePoints: 1,
      jobCount: 2,
      byCompany: [{ companyId: companyA, totalPoints: 8, completedPoints: 7 }],
      bySource: [{ sourceId: sourceA, totalPoints: 8, completedPoints: 7 }],
    };
    const repo = mockRepo({
      findById: async () =>
        baseWorkday({
          status: "completed",
          ended_at: "2026-08-30T08:00:00Z",
          summary_snapshot: snapshot,
        }),
      listMembership: async () => [membership({ job_id: jobA })],
      listSourcesByIds: async () => [
        { id: sourceA, display_name: "Source A" },
      ],
      listAllSessionsForWorkday: async () => [
        {
          id: execSessionId,
          status: "completed",
          delivery_job_id: null,
          session_role: "workday_execution",
          started_at: "2026-08-30T00:00:00Z",
          ended_at: "2026-08-30T08:00:00Z",
        },
      ],
      listRoutePointsForSessions: async () => [
        {
          session_id: execSessionId,
          sequence_no: 1,
          recorded_at: "2026-08-30T01:00:00Z",
          location: { type: "Point", coordinates: [127.0, 37.0] },
          accuracy_m: 5,
          speed_mps: 1,
          heading_deg: 90,
        },
      ],
      findExecutionSessionForWorkday: async () => ({
        id: execSessionId,
        status: "completed",
        delivery_job_id: null,
        session_role: "workday_execution",
        started_at: "2026-08-30T00:00:00Z",
        ended_at: "2026-08-30T08:00:00Z",
      }),
    });
    const service = createService(repo, [
      { id: companyA, name: "Company A" },
    ]);
    const report = await service.report({} as never, driverA, workdayId);
    expect(report.progressSource).toBe("snapshot");
    expect(report.progress.totalPoints).toBe(8);
    expect(report.durationSeconds).toBe(8 * 3600);
    expect(report.route.pointCount).toBe(1);
    expect(report.executionSessionId).toBe(execSessionId);
  });

  it("report includes historical completed from detached membership", async () => {
    const repo = mockRepo({
      findById: async () => baseWorkday({ status: "active" }),
      listMembership: async () => [
        membership({ job_id: jobA }),
        membership({ job_id: jobB, detached_at: "2026-08-30T04:00:00Z" }),
      ],
      listActiveJobIdsForDriver: async () => [
        { id: jobA, company_id: null, source_id: null, status: "active" },
      ],
      countProgressForJobs: async (_client, ids) => {
        if (ids.includes(jobB)) {
          return progressResult({ totalPoints: 2, completedPoints: 2, incompletePoints: 0 });
        }
        return progressResult({ totalPoints: 3, completedPoints: 1, incompletePoints: 2 });
      },
      listSourcesByIds: async () => [],
      listAllSessionsForWorkday: async () => [],
      findExecutionSessionForWorkday: async () => null,
    });
    const service = createService(repo);
    const report = await service.report({} as never, driverA, workdayId);
    expect(report.historicalCompleted?.completedPoints).toBe(2);
    expect(report.progress.incompletePoints).toBe(2);
  });

  it("B2 route summary uses all workday sessions when no execution session", async () => {
    const sliceA = "66666666-6666-6666-6666-666666666666";
    const sliceB = "77777777-7777-7777-7777-777777777777";
    const repo = mockRepo({
      listAllSessionsForWorkday: async () => [
        {
          id: sliceA,
          status: "completed",
          delivery_job_id: jobA,
          session_role: "workday_job_slice",
          started_at: "2026-08-30T00:00:00Z",
          ended_at: "2026-08-30T04:00:00Z",
        },
        {
          id: sliceB,
          status: "completed",
          delivery_job_id: jobB,
          session_role: "workday_job_slice",
          started_at: "2026-08-30T04:00:00Z",
          ended_at: "2026-08-30T08:00:00Z",
        },
      ],
      listRoutePointsForSessions: async () => [
        {
          session_id: sliceA,
          sequence_no: 1,
          recorded_at: "2026-08-30T01:00:00Z",
          location: { type: "Point", coordinates: [127.0, 37.0] },
          accuracy_m: null,
          speed_mps: null,
          heading_deg: null,
        },
        {
          session_id: sliceB,
          sequence_no: 1,
          recorded_at: "2026-08-30T05:00:00Z",
          location: { type: "Point", coordinates: [127.1, 37.1] },
          accuracy_m: null,
          speed_mps: null,
          heading_deg: null,
        },
      ],
    });
    const service = createService(repo);
    const summary = await service.buildRouteSummary({} as never, workdayId);
    expect(summary.sessionIds).toEqual([sliceA, sliceB]);
    expect(summary.pointCount).toBe(2);
    expect(summary.segments).toHaveLength(2);
  });

  it("B3 route summary uses execution session only", async () => {
    const sliceA = "66666666-6666-6666-6666-666666666666";
    const repo = mockRepo({
      listAllSessionsForWorkday: async () => [
        {
          id: sliceA,
          status: "completed",
          delivery_job_id: jobA,
          session_role: "workday_job_slice",
          started_at: "2026-08-30T00:00:00Z",
          ended_at: "2026-08-30T04:00:00Z",
        },
        {
          id: execSessionId,
          status: "active",
          delivery_job_id: null,
          session_role: "workday_execution",
          started_at: "2026-08-30T04:00:00Z",
          ended_at: null,
        },
      ],
      listRoutePointsForSessions: async () => [
        {
          session_id: execSessionId,
          sequence_no: 1,
          recorded_at: "2026-08-30T05:00:00Z",
          location: { type: "Point", coordinates: [127.2, 37.2] },
          accuracy_m: null,
          speed_mps: null,
          heading_deg: null,
        },
      ],
    });
    const service = createService(repo);
    const summary = await service.buildRouteSummary({} as never, workdayId);
    expect(summary.sessionIds).toEqual([execSessionId]);
    expect(summary.pointCount).toBe(1);
  });

  it("route details endpoint returns segment points for own driver", async () => {
    const repo = mockRepo({
      findById: async () => baseWorkday(),
      listAllSessionsForWorkday: async () => [
        {
          id: execSessionId,
          status: "completed",
          delivery_job_id: null,
          session_role: "workday_execution",
          started_at: "2026-08-30T00:00:00Z",
          ended_at: "2026-08-30T08:00:00Z",
        },
      ],
      listRoutePointsForSessions: async () => [
        {
          session_id: execSessionId,
          sequence_no: 1,
          recorded_at: "2026-08-30T01:00:00Z",
          location: { type: "Point", coordinates: [127.0, 37.0] },
          accuracy_m: 5,
          speed_mps: 1,
          heading_deg: 90,
        },
      ],
    });
    const service = createService(repo);
    const route = await service.getRouteDetails({} as never, driverA, workdayId);
    expect(route.segments).toHaveLength(1);
    expect(route.segments[0]?.points).toHaveLength(1);
    expect(route.segments[0]?.points[0]?.latitude).toBe(37);
  });

  it("missing workday is not found", async () => {
    const repo = mockRepo({
      findById: async () => null,
    });
    const service = createService(repo);
    await expect(
      service.requireOwn({} as never, driverA, workdayId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
