import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type Bucket = {
  count: number;
  resetAtMs: number;
};

@Injectable()
export class RecoveryRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly config: ConfigService) {}

  check(key: string): void {
    const maxAttempts = Number(
      this.config.get<string>("RECOVERY_MAX_ATTEMPTS_PER_HOUR") ?? 20,
    );
    const windowMs = 60 * 60 * 1000;
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAtMs) {
      this.buckets.set(key, { count: 1, resetAtMs: now + windowMs });
      return;
    }

    if (bucket.count >= maxAttempts) {
      throw new HttpException(
        "Too many recovery attempts. Try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
  }
}
