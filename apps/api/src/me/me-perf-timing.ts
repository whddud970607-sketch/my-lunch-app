import { Logger } from "@nestjs/common";

/**
 * PERF-S3: safe /me timing only — durations + status, never tokens/PII.
 */
export class MePerfTiming {
  private readonly logger = new Logger("DS_PERF_ME");
  private readonly t0 = process.hrtime.bigint();
  private last = this.t0;

  mark(name: string) {
    const now = process.hrtime.bigint();
    const fromStartMs = Number(now - this.t0) / 1e6;
    const sinceLastMs = Number(now - this.last) / 1e6;
    this.last = now;
    this.logger.log(
      `mark=${name} from_start_ms=${fromStartMs.toFixed(1)} since_last_ms=${sinceLastMs.toFixed(1)}`,
    );
  }

  end(status: number) {
    const now = process.hrtime.bigint();
    const totalMs = Number(now - this.t0) / 1e6;
    this.logger.log(
      `mark=ME_SERVER_END status=${status} total_ms=${totalMs.toFixed(1)}`,
    );
  }
}
