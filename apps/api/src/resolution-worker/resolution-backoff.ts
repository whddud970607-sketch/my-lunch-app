/** Exponential backoff with full jitter for provider_error retries. */

export function computeRetryDelayMs(args: {
  attemptCount: number;
  baseMs: number;
  maxMs: number;
  rateLimited?: boolean;
  rng?: () => number;
}): number {
  const rng = args.rng ?? Math.random;
  const exponent = Math.min(Math.max(args.attemptCount, 1), 10);
  let cap = Math.min(args.maxMs, args.baseMs * 2 ** (exponent - 1));
  if (args.rateLimited) cap = Math.min(args.maxMs, cap * 2);
  const jittered = cap * (0.8 + rng() * 0.4);
  return Math.max(0, Math.floor(jittered));
}

export function nextAttemptAt(
  now: Date,
  delayMs: number,
): Date {
  return new Date(now.getTime() + delayMs);
}

export const RESOLUTION_RETRY_DELAY_MS_MIN = 0;
export const RESOLUTION_RETRY_DELAY_MS_MAX = 3_600_000;
export const RESOLUTION_LEASE_MS_MIN = 1_000;
export const RESOLUTION_LEASE_MS_MAX = 3_600_000;

export function clampRetryDelayMs(delayMs: number): number {
  if (!Number.isFinite(delayMs)) return RESOLUTION_RETRY_DELAY_MS_MIN;
  return Math.min(
    RESOLUTION_RETRY_DELAY_MS_MAX,
    Math.max(RESOLUTION_RETRY_DELAY_MS_MIN, Math.floor(delayMs)),
  );
}

export function clampLeaseDurationMs(leaseMs: number): number {
  if (!Number.isFinite(leaseMs)) return RESOLUTION_LEASE_MS_MIN;
  return Math.min(
    RESOLUTION_LEASE_MS_MAX,
    Math.max(RESOLUTION_LEASE_MS_MIN, Math.floor(leaseMs)),
  );
}
