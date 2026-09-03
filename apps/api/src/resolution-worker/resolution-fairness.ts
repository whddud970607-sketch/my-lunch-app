/** Deterministic driver-stratified fairness for queue claims. */

export function rotateDriverIds(
  driverIds: string[],
  startIndex: number,
): string[] {
  if (driverIds.length <= 1) return [...driverIds];
  const offset = ((startIndex % driverIds.length) + driverIds.length) % driverIds.length;
  return [...driverIds.slice(offset), ...driverIds.slice(0, offset)];
}

export function fairnessClaimPlan(args: {
  driverIds: string[];
  perDriverCap: number;
  batchSize: number;
}): Array<{ driverId: string; limit: number }> {
  if (!args.driverIds.length || args.batchSize <= 0) return [];

  const counts = new Map<string, number>();
  let allocated = 0;
  let idx = 0;
  const guard = args.driverIds.length * args.batchSize + 1;

  while (allocated < args.batchSize && idx < guard) {
    const driverId = args.driverIds[idx % args.driverIds.length]!;
    const current = counts.get(driverId) ?? 0;
    if (current < args.perDriverCap) {
      counts.set(driverId, current + 1);
      allocated += 1;
    }
    idx += 1;
    const allCapped = args.driverIds.every(
      (id) => (counts.get(id) ?? 0) >= args.perDriverCap,
    );
    if (allCapped) break;
  }

  return [...counts.entries()].map(([driverId, limit]) => ({ driverId, limit }));
}
