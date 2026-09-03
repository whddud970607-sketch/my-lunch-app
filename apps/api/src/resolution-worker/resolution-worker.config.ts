/** Injectable worker configuration — conservative defaults, no provider contract hard-coding. */

export const RESOLUTION_WORKER_ENABLED_ENV = "RESOLUTION_WORKER_ENABLED";

export type ResolutionWorkerConfig = {
  enabled: boolean;
  pollIntervalMs: number;
  batchSize: number;
  perDriverCap: number;
  leaseDurationMs: number;
  maxHeartbeats: number;
  maxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  workerIdMaxLength: number;
  providerConcurrency: number;
  providerBudgets: {
    kakao: number;
    naver: number;
    public_building: number;
    vworld: number;
  };
};

export const DEFAULT_RESOLUTION_WORKER_CONFIG: ResolutionWorkerConfig = {
  enabled: false,
  pollIntervalMs: 5000,
  batchSize: 32,
  perDriverCap: 4,
  leaseDurationMs: 5 * 60 * 1000,
  maxHeartbeats: 3,
  maxAttempts: 8,
  backoffBaseMs: 30_000,
  backoffMaxMs: 3_600_000,
  workerIdMaxLength: 128,
  providerConcurrency: 8,
  providerBudgets: {
    kakao: 5,
    naver: 5,
    public_building: 3,
    vworld: 3,
  },
};

export function buildWorkerInstanceId(maxLength: number): string {
  const host =
    typeof process !== "undefined" && process.env?.HOSTNAME
      ? process.env.HOSTNAME
      : "local";
  const id = `worker:${host}:${process.pid}:${cryptoRandom()}`;
  return id.length > maxLength ? id.slice(0, maxLength) : id;
}

function cryptoRandom(): string {
  try {
    const { randomUUID } = require("node:crypto") as typeof import("node:crypto");
    return randomUUID();
  } catch {
    return `${Date.now()}`;
  }
}

export function resolutionWorkerConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): ResolutionWorkerConfig {
  return {
    ...DEFAULT_RESOLUTION_WORKER_CONFIG,
    enabled: env[RESOLUTION_WORKER_ENABLED_ENV] === "1",
    pollIntervalMs: parseIntEnv(env.RESOLUTION_WORKER_POLL_INTERVAL_MS, 5000),
    batchSize: parseIntEnv(env.RESOLUTION_WORKER_BATCH_SIZE, 32),
    perDriverCap: parseIntEnv(env.RESOLUTION_WORKER_PER_DRIVER_CAP, 4),
    leaseDurationMs: parseIntEnv(env.RESOLUTION_WORKER_LEASE_MS, 300_000),
    maxHeartbeats: parseIntEnv(env.RESOLUTION_WORKER_MAX_HEARTBEATS, 3),
    maxAttempts: parseIntEnv(env.RESOLUTION_WORKER_MAX_ATTEMPTS, 8),
    providerConcurrency: parseIntEnv(env.RESOLUTION_WORKER_CONCURRENCY, 8),
  };
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
