import { fairnessClaimPlan, rotateDriverIds } from "./resolution-fairness";

describe("resolution-fairness", () => {
  it("rotates driver ids deterministically", () => {
    const ids = ["a", "b", "c"];
    expect(rotateDriverIds(ids, 0)).toEqual(["a", "b", "c"]);
    expect(rotateDriverIds(ids, 1)).toEqual(["b", "c", "a"]);
    expect(rotateDriverIds(ids, 4)).toEqual(["b", "c", "a"]);
  });

  it("enforces per-driver cap in a single batch", () => {
    const plan = fairnessClaimPlan({
      driverIds: ["driver-a", "driver-b"],
      perDriverCap: 4,
      batchSize: 32,
    });
    const byDriver = Object.fromEntries(plan.map((p) => [p.driverId, p.limit]));
    expect(byDriver["driver-a"]).toBeLessThanOrEqual(4);
    expect(byDriver["driver-b"]).toBeLessThanOrEqual(4);
    expect(Object.values(byDriver).reduce((s, n) => s + n, 0)).toBe(8);
  });

  it("2000-row import does not let one driver consume entire batch", () => {
    const driverIds = ["driver-heavy", "driver-light"];
    const plan = fairnessClaimPlan({
      driverIds,
      perDriverCap: 4,
      batchSize: 32,
    });
    const total = plan.reduce((sum, row) => sum + row.limit, 0);
    expect(total).toBeLessThanOrEqual(32);
    for (const row of plan) {
      expect(row.limit).toBeLessThanOrEqual(4);
    }
    expect(plan.length).toBe(2);
  });
});
