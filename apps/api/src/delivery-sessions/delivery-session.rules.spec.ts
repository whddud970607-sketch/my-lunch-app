import {
  computeDurationSeconds,
  filterBatchForSessionStatus,
} from "./delivery-session.rules";

describe("delivery-session.rules", () => {
  const endedAt = "2026-08-29T06:00:00.000Z";

  it("accepts all points while active", () => {
    const result = filterBatchForSessionStatus({
      sessionStatus: "active",
      endedAtIso: null,
      points: [
        { sequenceNo: 1, recordedAt: "2026-08-29T05:00:00.000Z" },
        { sequenceNo: 2, recordedAt: "2026-08-29T07:00:00.000Z" },
      ],
    });
    expect(result.rejectClosed).toBe(false);
    expect(result.accepted).toHaveLength(2);
    expect(result.rejectedAfterEnd).toBe(0);
  });

  it("accepts buffered points at or before ended_at while ending", () => {
    const result = filterBatchForSessionStatus({
      sessionStatus: "ending",
      endedAtIso: endedAt,
      points: [
        { sequenceNo: 1, recordedAt: "2026-08-29T05:59:59.000Z" },
        { sequenceNo: 2, recordedAt: endedAt },
        { sequenceNo: 3, recordedAt: "2026-08-29T06:00:01.000Z" },
      ],
    });
    expect(result.accepted.map((p) => p.sequenceNo)).toEqual([1, 2]);
    expect(result.rejectedAfterEnd).toBe(1);
  });

  it("rejects all points after completed", () => {
    const result = filterBatchForSessionStatus({
      sessionStatus: "completed",
      endedAtIso: endedAt,
      points: [{ sequenceNo: 1, recordedAt: "2026-08-29T05:00:00.000Z" }],
    });
    expect(result.rejectClosed).toBe(true);
    expect(result.accepted).toHaveLength(0);
  });

  it("computes authoritative duration from server timestamps", () => {
    expect(
      computeDurationSeconds(
        "2026-08-29T02:00:00.000Z",
        "2026-08-29T06:37:00.000Z",
      ),
    ).toBe(4 * 3600 + 37 * 60);
  });
});
