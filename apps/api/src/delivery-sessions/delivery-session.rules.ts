/**
 * Pure helpers for session route ingestion rules (unit-tested without DB).
 */

export function filterBatchForSessionStatus(args: {
  sessionStatus: "active" | "ending" | "completed" | "abandoned";
  endedAtIso: string | null;
  points: Array<{ sequenceNo: number; recordedAt: string }>;
}): {
  accepted: Array<{ sequenceNo: number; recordedAt: string }>;
  rejectedAfterEnd: number;
  rejectClosed: boolean;
} {
  if (args.sessionStatus === "completed" || args.sessionStatus === "abandoned") {
    return { accepted: [], rejectedAfterEnd: 0, rejectClosed: true };
  }

  const endedAtMs = args.endedAtIso
    ? new Date(args.endedAtIso).getTime()
    : null;
  const accepted: Array<{ sequenceNo: number; recordedAt: string }> = [];
  let rejectedAfterEnd = 0;

  for (const p of args.points) {
    if (!Number.isFinite(p.sequenceNo) || p.sequenceNo < 1) continue;
    const recordedMs = new Date(p.recordedAt).getTime();
    if (Number.isNaN(recordedMs)) continue;
    if (args.sessionStatus === "ending" && endedAtMs != null) {
      if (recordedMs > endedAtMs) {
        rejectedAfterEnd += 1;
        continue;
      }
    }
    accepted.push(p);
  }

  return { accepted, rejectedAfterEnd, rejectClosed: false };
}

export function computeDurationSeconds(
  startedAtIso: string,
  endedAtIso: string | null,
): number | null {
  if (!endedAtIso) return null;
  const started = new Date(startedAtIso).getTime();
  const ended = new Date(endedAtIso).getTime();
  if (Number.isNaN(started) || Number.isNaN(ended)) return null;
  return Math.max(0, Math.floor((ended - started) / 1000));
}
