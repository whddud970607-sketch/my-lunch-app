export type DeliverySessionRole =
  | "legacy_job"
  | "workday_job_slice"
  | "workday_execution";

export type SessionStartShape = {
  workdayId?: string;
  deliveryJobId?: string;
};

export type ResolvedSessionStartMode =
  | { mode: "legacy_job" }
  | { mode: "workday_job_slice"; workdayId: string; deliveryJobId: string }
  | { mode: "workday_execution"; workdayId: string }
  | { mode: "invalid"; reason: string };

/** Server-side start mode — client never sends session_role. */
export function resolveSessionStartMode(
  input: SessionStartShape,
  executionFlagEnabled: boolean,
): ResolvedSessionStartMode {
  const workdayId = input.workdayId?.trim() || null;
  const deliveryJobId = input.deliveryJobId?.trim() || null;

  if (workdayId && deliveryJobId) {
    return { mode: "workday_job_slice", workdayId, deliveryJobId };
  }

  if (workdayId && !deliveryJobId) {
    if (!executionFlagEnabled) {
      return {
        mode: "invalid",
        reason: "deliveryJobId is required when execution session flag is disabled",
      };
    }
    return { mode: "workday_execution", workdayId };
  }

  if (!workdayId && deliveryJobId) {
    return { mode: "legacy_job" };
  }

  // Legacy: no workday — job resolved server-side (optional deliveryJobId).
  return { mode: "legacy_job" };
}

export function isJobBoundSessionRole(
  role: DeliverySessionRole | undefined | null,
): boolean {
  return role === "legacy_job" || role === "workday_job_slice";
}

export function isExecutionSessionRole(
  role: DeliverySessionRole | undefined | null,
): boolean {
  return role === "workday_execution";
}
