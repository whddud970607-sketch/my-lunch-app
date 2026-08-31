export type WorkdayStatus = "active" | "ending" | "completed" | "abandoned";

export type MembershipSource =
  | "start_snapshot"
  | "midday_attach"
  | "reconcile";

export type WorkdayRow = {
  id: string;
  driver_id: string;
  service_date: string;
  status: WorkdayStatus;
  started_at: string;
  ended_at: string | null;
  start_idempotency_key: string;
  end_idempotency_key: string | null;
  summary_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WorkdayMembershipRow = {
  id: string;
  workday_id: string;
  job_id: string;
  attached_at: string;
  detached_at: string | null;
  membership_source: MembershipSource;
};

export type WorkdayAggregateSlice = {
  companyId: string | null;
  totalPoints: number;
  completedPoints: number;
  incompletePoints: number;
  displayName?: string;
};

export type WorkdaySourceSlice = {
  sourceId: string | null;
  totalPoints: number;
  completedPoints: number;
  incompletePoints: number;
  displayName?: string;
};

export type WorkdayProgressProjection = {
  jobCount: number;
  totalPoints: number;
  completedPoints: number;
  incompletePoints: number;
  byCompany: WorkdayAggregateSlice[];
  bySource: WorkdaySourceSlice[];
};

export type WorkdayHistoricalProgress = {
  jobCount: number;
  completedPoints: number;
  totalPoints: number;
};

export type WorkdaySummarySnapshot = {
  totalPoints: number;
  completedPoints: number;
  incompletePoints: number;
  jobCount: number;
  byCompany: Array<{
    companyId: string | null;
    totalPoints: number;
    completedPoints: number;
  }>;
  bySource: Array<{
    sourceId: string | null;
    totalPoints: number;
    completedPoints: number;
  }>;
};

export type WorkdayRouteSegmentSummary = {
  sessionId: string;
  sessionRole: string;
  pointCount: number;
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
  start: { latitude: number; longitude: number } | null;
  end: { latitude: number; longitude: number } | null;
};

export type WorkdayRouteSummary = {
  sessionIds: string[];
  pointCount: number;
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
  start: { latitude: number; longitude: number } | null;
  end: { latitude: number; longitude: number } | null;
  segments: WorkdayRouteSegmentSummary[];
};

export type WorkdaySessionRow = {
  id: string;
  status: string;
  delivery_job_id: string | null;
  session_role: string;
  started_at: string;
  ended_at: string | null;
};

export const WORKDAY_SELECT =
  "id, driver_id, service_date, status, started_at, ended_at, start_idempotency_key, end_idempotency_key, summary_snapshot, created_at, updated_at";

export const MEMBERSHIP_SELECT =
  "id, workday_id, job_id, attached_at, detached_at, membership_source";
