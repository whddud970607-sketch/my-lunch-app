import { Injectable } from "@nestjs/common";

/**
 * P0-B3-1 feature gate. Default OFF — B2 job-bound Session path unchanged.
 * Set WORKDAY_EXECUTION_SESSION_V1=true locally to exercise execution start.
 */
@Injectable()
export class WorkdayExecutionConfig {
  isExecutionSessionEnabled(): boolean {
    const raw = process.env.WORKDAY_EXECUTION_SESSION_V1?.trim().toLowerCase();
    return raw === "true" || raw === "1" || raw === "yes";
  }
}
