import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AddressResolutionService } from "../address/address-resolution.service";
import {
  parseDong,
  resolveComplexNameHint,
} from "../address/address.parser";
import { assertNoSensitiveLeak } from "../address/building/diagnostic-redaction";
import type { ResolutionDiagnosticSink } from "../address/building/resolution-diagnostic-trace";
import { fairnessClaimPlan, rotateDriverIds } from "./resolution-fairness";
import {
  mapResolutionResult,
  mapThrownError,
} from "./resolution-result.mapper";
import {
  DEFAULT_RESOLUTION_WORKER_CONFIG,
  buildWorkerInstanceId,
  resolutionWorkerConfigFromEnv,
  type ResolutionWorkerConfig,
} from "./resolution-worker.config";
import {
  RESOLUTION_WORKER_REPOSITORY,
  type ResolutionWorkerRepository,
} from "./resolution-worker.repository.port";
import type { ResolutionClaim } from "./resolution-worker.types";
import {
  ResolutionWorkerMetrics,
  formatSafeWorkerLog,
} from "./resolution-worker.metrics";

@Injectable()
export class ResolutionWorkerService {
  private readonly logger = new Logger(ResolutionWorkerService.name);
  private readonly config: ResolutionWorkerConfig;
  private readonly workerId: string;
  private driverRotateIndex = 0;
  readonly metrics = new ResolutionWorkerMetrics();

  constructor(
    private readonly resolver: AddressResolutionService,
    @Inject(RESOLUTION_WORKER_REPOSITORY)
    private readonly repository: ResolutionWorkerRepository,
    @Optional() configService?: ConfigService,
  ) {
    this.config = configService
      ? resolutionWorkerConfigFromEnv(
          configService as unknown as Record<string, string | undefined>,
        )
      : DEFAULT_RESOLUTION_WORKER_CONFIG;
    this.workerId = buildWorkerInstanceId(this.config.workerIdMaxLength);
  }

  getConfig(): ResolutionWorkerConfig {
    return this.config;
  }

  getWorkerId(): string {
    return this.workerId;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async pollOnce(now = new Date()): Promise<number> {
    const drivers = await this.repository.listEligibleDriverIds(now);
    this.metrics.setQueueDepth(drivers.length);
    const rotated = rotateDriverIds(drivers, this.driverRotateIndex);
    if (rotated.length) {
      this.driverRotateIndex = (this.driverRotateIndex + 1) % rotated.length;
    }

    const plan = fairnessClaimPlan({
      driverIds: rotated,
      perDriverCap: this.config.perDriverCap,
      batchSize: this.config.batchSize,
    });

    const claims = await this.repository.claimBatch({
      plan,
      workerId: this.workerId,
      leaseDurationMs: this.config.leaseDurationMs,
      now,
    });

    await this.mapWithConcurrency(claims, (claim) =>
      this.processClaim(claim, now),
    );

    return claims.length;
  }

  async processClaim(
    claim: ResolutionClaim,
    now = new Date(),
    options?: { diagnosticTrace?: ResolutionDiagnosticSink | null },
  ): Promise<void> {
    const wallStart = Date.now();
    const started = wallStart;
    const piiRows = await this.repository.fetchPii([claim.pointId]);
    const pii = piiRows[0];
    if (!pii?.rawAddress) {
      const persisted = await this.repository.persistResult(
        claim,
        {
          resolutionStatus: "unresolved",
          resolutionStage: "failed",
          pinAccuracy: "address",
          location: null,
          identityProvenance: null,
          geometryProvenance: null,
          complexCorroboration: null,
          resolvedAt: null,
          resolutionFailureCode: "NO_CANDIDATES",
          resolutionNextAttemptAt: null,
          resolutionRetryExhausted: false,
        },
        now,
      );
      if (!persisted) this.metrics.recordStaleWritePrevented();
      this.metrics.recordProcessed("unresolved", Date.now() - started);
      return;
    }

    const executionStarted = await this.repository.executionStartCas(claim, now);
    if (!executionStarted) {
      await this.repository.releaseClaim(claim, now);
      return;
    }

    const classifyCtx = {
      attemptCount: claim.resolutionAttemptCount + 1,
      maxAttempts: this.config.maxAttempts,
      backoffBaseMs: this.config.backoffBaseMs,
      backoffMaxMs: this.config.backoffMaxMs,
      now,
    };

    try {
      this.metrics.recordProviderCall();
      const result = await this.resolver.resolve(
        {
          roadAddress: pii.rawAddress,
          detailAddress: pii.detailAddress,
          // Identity hints extracted from structured detail only (never memo).
          complexNameHint: resolveComplexNameHint({
            detailAddress: pii.detailAddress,
          }),
          dongHint: parseDong(pii.detailAddress),
        },
        options?.diagnosticTrace
          ? { diagnosticTrace: options.diagnosticTrace }
          : undefined,
      );

      const payload = mapResolutionResult(result, classifyCtx);
      const persisted = await this.repository.persistResult(
        claim,
        payload,
        logicalNow(now, wallStart),
      );
      if (!persisted) {
        this.metrics.recordStaleWritePrevented();
      } else {
        if (payload.resolutionStatus === "provider_error") {
          this.metrics.recordRetry();
        }
        this.metrics.recordProcessed(payload.resolutionStatus, Date.now() - started);
      }
      this.logSafe({
        pointId: claim.pointId,
        result: persisted ? payload.resolutionStatus : "stale_write_prevented",
        failureCode: payload.resolutionFailureCode,
        attemptCount: classifyCtx.attemptCount,
        latencyMs: Date.now() - started,
      });
    } catch (error) {
      const payload = mapThrownError(error, classifyCtx);
      const persisted = await this.repository.persistResult(
        claim,
        payload,
        logicalNow(now, wallStart),
      );
      if (!persisted) {
        this.metrics.recordStaleWritePrevented();
      } else {
        if (payload.resolutionStatus === "provider_error") {
          this.metrics.recordRetry();
        }
        this.metrics.recordProcessed(payload.resolutionStatus, Date.now() - started);
      }
      this.logSafe({
        pointId: claim.pointId,
        result: persisted ? payload.resolutionStatus : "stale_write_prevented",
        failureCode: payload.resolutionFailureCode,
        attemptCount: classifyCtx.attemptCount,
        latencyMs: Date.now() - started,
      });
    }
  }

  async manualRequeue(pointId: string, now = new Date()): Promise<boolean> {
    return this.repository.manualRequeue(pointId, now);
  }

  async heartbeatLease(claim: ResolutionClaim, now = new Date()): Promise<boolean> {
    const ok = await this.repository.heartbeat(claim, {
      leaseDurationMs: this.config.leaseDurationMs,
      maxHeartbeats: this.config.maxHeartbeats,
      now,
    });
    if (ok) {
      claim.leaseExpiresAt = new Date(now.getTime() + this.config.leaseDurationMs);
    }
    return ok;
  }

  private async mapWithConcurrency<T>(
    items: T[],
    fn: (item: T) => Promise<void>,
  ): Promise<void> {
    const limit = Math.max(1, this.config.providerConcurrency);
    let idx = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (idx < items.length) {
        const current = items[idx];
        idx += 1;
        if (current !== undefined) await fn(current);
      }
    });
    await Promise.all(workers);
  }

  private logSafe(meta: Record<string, unknown>): void {
    const line = formatSafeWorkerLog(meta);
    if (!assertNoSensitiveLeak(line)) return;
    this.logger.log(line);
  }
}

function logicalNow(claimNow: Date, wallStart: number): Date {
  return new Date(claimNow.getTime() + (Date.now() - wallStart));
}
