/** Safe operational metrics — no PII/address labels. */

export type ResolutionMetricSnapshot = {
  queueDepth: number;
  processedTotal: number;
  resolvedTotal: number;
  lowerQualityTotal: number;
  unresolvedTotal: number;
  ambiguousTotal: number;
  providerErrorTotal: number;
  retryTotal: number;
  staleWritePreventedTotal: number;
  providerCallsTotal: number;
  latencyMsTotal: number;
  latencySamples: number;
};

export class ResolutionWorkerMetrics {
  private snapshot: ResolutionMetricSnapshot = {
    queueDepth: 0,
    processedTotal: 0,
    resolvedTotal: 0,
    lowerQualityTotal: 0,
    unresolvedTotal: 0,
    ambiguousTotal: 0,
    providerErrorTotal: 0,
    retryTotal: 0,
    staleWritePreventedTotal: 0,
    providerCallsTotal: 0,
    latencyMsTotal: 0,
    latencySamples: 0,
  };

  setQueueDepth(depth: number): void {
    this.snapshot.queueDepth = depth;
  }

  recordProcessed(result: string, latencyMs: number): void {
    this.snapshot.processedTotal += 1;
    this.snapshot.latencyMsTotal += latencyMs;
    this.snapshot.latencySamples += 1;
    switch (result) {
      case "resolved":
        this.snapshot.resolvedTotal += 1;
        break;
      case "lower_quality":
        this.snapshot.lowerQualityTotal += 1;
        break;
      case "unresolved":
        this.snapshot.unresolvedTotal += 1;
        break;
      case "ambiguous":
        this.snapshot.ambiguousTotal += 1;
        break;
      case "provider_error":
        this.snapshot.providerErrorTotal += 1;
        break;
      default:
        break;
    }
  }

  recordRetry(): void {
    this.snapshot.retryTotal += 1;
  }

  recordStaleWritePrevented(): void {
    this.snapshot.staleWritePreventedTotal += 1;
  }

  recordProviderCall(): void {
    this.snapshot.providerCallsTotal += 1;
  }

  getSnapshot(): ResolutionMetricSnapshot {
    return { ...this.snapshot };
  }
}

export function formatSafeWorkerLog(meta: Record<string, unknown>): string {
  const allowed = [
    "pointId",
    "result",
    "failureCode",
    "attemptCount",
    "latencyMs",
    "workerId",
    "claimed",
    "released",
  ];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (meta[key] !== undefined) out[key] = meta[key];
  }
  return JSON.stringify(out);
}
