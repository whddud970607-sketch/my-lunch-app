import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { WorkdayExecutionConfig } from "../config/workday-execution.config";
import { DeliverySessionsService } from "./delivery-sessions.service";
import type { DeliverySessionRow } from "./delivery-sessions.repository";

const driverA = "11111111-1111-1111-1111-111111111111";
const workdayId = "22222222-2222-2222-2222-222222222222";
const jobA = "33333333-3333-3333-3333-333333333333";
const sessionId = "44444444-4444-4444-4444-444444444444";

function sessionRow(
  overrides: Partial<DeliverySessionRow> = {},
): DeliverySessionRow {
  return {
    id: sessionId,
    driver_id: driverA,
    delivery_job_id: jobA,
    workday_id: workdayId,
    session_role: "workday_job_slice",
    status: "active",
    started_at: "2026-08-30T01:00:00.000Z",
    ended_at: null,
    idempotency_key: "key-1",
    client_started_at: null,
    summary_snapshot: {},
    created_at: "2026-08-30T01:00:00.000Z",
    updated_at: "2026-08-30T01:00:00.000Z",
    ...overrides,
  };
}

describe("DeliverySessionsService B3-1", () => {
  const repo = {
    findSessionByIdempotency: jest.fn(),
    findOpenSessionForDriver: jest.fn(),
    findExecutionSessionForWorkday: jest.fn(),
    findActiveJobForDriver: jest.fn(),
    insertSession: jest.fn(),
    countJobProgress: jest.fn(),
    maxSequence: jest.fn(),
    findSessionById: jest.fn(),
    markEnding: jest.fn(),
  };

  const workdays = {
    assertCanLinkSession: jest.fn(),
    assertCanStartExecutionSession: jest.fn(),
    getExecutionSessionProgress: jest.fn(),
  };

  const executionConfig = {
    isExecutionSessionEnabled: jest.fn(() => true),
  } as unknown as WorkdayExecutionConfig;

  let service: DeliverySessionsService;

  beforeEach(() => {
    jest.resetAllMocks();
    (executionConfig.isExecutionSessionEnabled as jest.Mock).mockReturnValue(
      true,
    );
    service = new DeliverySessionsService(
      repo as never,
      workdays as never,
      executionConfig,
    );
    repo.countJobProgress.mockResolvedValue({
      totalPoints: 10,
      completedPoints: 3,
      incompletePoints: 7,
      failedPoints: 0,
      totalQuantity: 10,
    });
    workdays.getExecutionSessionProgress.mockResolvedValue({
      totalPoints: 20,
      completedPoints: 8,
      incompletePoints: 12,
      failedPoints: 0,
      totalQuantity: 0,
    });
    repo.findOpenSessionForDriver.mockResolvedValue(null);
    repo.findSessionByIdempotency.mockResolvedValue(null);
    repo.findExecutionSessionForWorkday.mockResolvedValue(null);
  });

  it("execution start creates job-neutral session when flag ON", async () => {
    workdays.assertCanStartExecutionSession.mockResolvedValue({
      id: workdayId,
      status: "active",
    });
    repo.insertSession.mockResolvedValue(
      sessionRow({
        delivery_job_id: null,
        session_role: "workday_execution",
      }),
    );

    const result = await service.start({} as never, driverA, {
      idempotencyKey: "exec-1",
      workdayId,
    });

    expect(repo.insertSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        delivery_job_id: null,
        session_role: "workday_execution",
        workday_id: workdayId,
      }),
    );
    expect(result.created).toBe(true);
    expect(result.session.deliveryJobId).toBeNull();
    expect(result.session.sessionRole).toBe("workday_execution");
    expect(workdays.getExecutionSessionProgress).toHaveBeenCalled();
    expect(repo.countJobProgress).not.toHaveBeenCalled();
  });

  it("execution ensure returns existing session for same workday", async () => {
    const existing = sessionRow({
      delivery_job_id: null,
      session_role: "workday_execution",
    });
    workdays.assertCanStartExecutionSession.mockResolvedValue({
      id: workdayId,
    });
    repo.findExecutionSessionForWorkday.mockResolvedValue(existing);

    const result = await service.start({} as never, driverA, {
      idempotencyKey: "other-key",
      workdayId,
    });

    expect(result.created).toBe(false);
    expect(repo.insertSession).not.toHaveBeenCalled();
  });

  it("rejects execution start when flag OFF and no deliveryJobId", async () => {
    (executionConfig.isExecutionSessionEnabled as jest.Mock).mockReturnValue(
      false,
    );

    await expect(
      service.start({} as never, driverA, {
        idempotencyKey: "k",
        workdayId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("B2 slice start still validates membership", async () => {
    (executionConfig.isExecutionSessionEnabled as jest.Mock).mockReturnValue(
      true,
    );
    repo.findActiveJobForDriver.mockResolvedValue({
      id: jobA,
      driver_id: driverA,
      status: "active",
    });
    workdays.assertCanLinkSession.mockResolvedValue({ id: workdayId });
    repo.insertSession.mockResolvedValue(
      sessionRow({ session_role: "workday_job_slice" }),
    );

    await service.start({} as never, driverA, {
      idempotencyKey: "slice-1",
      workdayId,
      deliveryJobId: jobA,
    });

    expect(workdays.assertCanLinkSession).toHaveBeenCalledWith(
      expect.anything(),
      driverA,
      workdayId,
      jobA,
    );
    expect(repo.countJobProgress).toHaveBeenCalledWith(expect.anything(), jobA);
  });

  it("rejects execution on ending workday", async () => {
    workdays.assertCanStartExecutionSession.mockRejectedValue(
      new ConflictException({
        code: "workday_not_active",
        status: "ending",
      }),
    );

    await expect(
      service.start({} as never, driverA, {
        idempotencyKey: "k",
        workdayId,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects zero membership workday", async () => {
    workdays.assertCanStartExecutionSession.mockRejectedValue(
      new ConflictException({ code: "workday_no_membership" }),
    );

    await expect(
      service.start({} as never, driverA, {
        idempotencyKey: "k",
        workdayId,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("execution report is deferred", async () => {
    repo.findSessionById.mockResolvedValue(
      sessionRow({
        delivery_job_id: null,
        session_role: "workday_execution",
        status: "completed",
      }),
    );

    await expect(
      service.report({} as never, driverA, sessionId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("execution end uses workday-scoped progress not countJobProgress", async () => {
    repo.findSessionById.mockResolvedValue(
      sessionRow({
        delivery_job_id: null,
        session_role: "workday_execution",
        status: "active",
      }),
    );
    repo.markEnding.mockImplementation(async (_c, _id, summary) =>
      sessionRow({
        delivery_job_id: null,
        session_role: "workday_execution",
        status: "ending",
        summary_snapshot: summary,
      }),
    );

    await service.end({} as never, driverA, sessionId, {
      forceIncomplete: true,
    });

    expect(workdays.getExecutionSessionProgress).toHaveBeenCalled();
    expect(repo.countJobProgress).not.toHaveBeenCalled();
  });

  it("cross-driver execution existing rejected", async () => {
    workdays.assertCanStartExecutionSession.mockResolvedValue({
      id: workdayId,
    });
    repo.findExecutionSessionForWorkday.mockResolvedValue(
      sessionRow({
        driver_id: "99999999-9999-9999-9999-999999999999",
        delivery_job_id: null,
        session_role: "workday_execution",
      }),
    );

    await expect(
      service.start({} as never, driverA, {
        idempotencyKey: "k",
        workdayId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
