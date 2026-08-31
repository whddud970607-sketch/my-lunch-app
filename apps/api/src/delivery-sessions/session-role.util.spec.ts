import {
  isExecutionSessionRole,
  isJobBoundSessionRole,
  resolveSessionStartMode,
} from "./session-role.util";

describe("session-role.util", () => {
  it("resolves workday_job_slice when both ids present", () => {
    expect(
      resolveSessionStartMode(
        { workdayId: "w1", deliveryJobId: "j1" },
        false,
      ),
    ).toEqual({
      mode: "workday_job_slice",
      workdayId: "w1",
      deliveryJobId: "j1",
    });
  });

  it("resolves execution when workday only and flag ON", () => {
    expect(
      resolveSessionStartMode({ workdayId: "w1" }, true),
    ).toEqual({ mode: "workday_execution", workdayId: "w1" });
  });

  it("rejects workday-only when flag OFF", () => {
    expect(resolveSessionStartMode({ workdayId: "w1" }, false)).toEqual({
      mode: "invalid",
      reason: expect.stringContaining("deliveryJobId"),
    });
  });

  it("resolves legacy without workday", () => {
    expect(resolveSessionStartMode({ deliveryJobId: "j1" }, false)).toEqual({
      mode: "legacy_job",
    });
    expect(resolveSessionStartMode({}, false)).toEqual({ mode: "legacy_job" });
  });

  it("classifies roles", () => {
    expect(isJobBoundSessionRole("legacy_job")).toBe(true);
    expect(isJobBoundSessionRole("workday_job_slice")).toBe(true);
    expect(isJobBoundSessionRole("workday_execution")).toBe(false);
    expect(isExecutionSessionRole("workday_execution")).toBe(true);
  });
});
