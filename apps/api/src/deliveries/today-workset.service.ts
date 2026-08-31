import { Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AccessSecretsService } from "../access/access-secrets.service";
import { SupabaseServiceClient } from "../supabase/supabase-service.client";
import { parsePointLocation } from "./location.util";

export type TodaySourceRow = {
  id: string;
  company_id: string | null;
  owner_driver_id: string | null;
  source_type: string;
  source_key: string;
  display_name: string;
  external_system: string | null;
  is_active: boolean;
};

export type TodayJobRow = {
  id: string;
  driver_id: string;
  company_id: string | null;
  source_id: string | null;
  status: string;
  service_date: string;
};

export type TodayPointRow = {
  id: string;
  job_id: string;
  driver_id: string;
  display_label: string;
  quantity: number;
  status: string;
  location: unknown;
  pin_accuracy: string;
  pii_masked_at: string | null;
};

export type TodayShipmentRow = {
  id: string;
  point_id: string;
  job_id: string;
  driver_id: string;
  source_id: string | null;
  external_id: string | null;
  sequence_no: number;
  tracking_code: string;
  status: string;
};

export type TodayWorksetResponse = {
  serviceDate: string;
  summary: {
    totalPoints: number;
    completedPoints: number;
    pendingPoints: number;
    totalShipments: number;
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
  /** Workset-scoped company labels only (not a company directory). */
  companies: Array<{
    id: string;
    displayName: string;
  }>;
  sources: Array<{
    id: string;
    companyId: string | null;
    ownerDriverId: string | null;
    sourceType: string;
    sourceKey: string;
    displayName: string;
    externalSystem: string | null;
    isActive: boolean;
  }>;
  jobs: Array<{
    id: string;
    companyId: string | null;
    sourceId: string | null;
    status: string;
    serviceDate: string;
  }>;
  points: Array<{
    pointId: string;
    jobId: string;
    companyId: string | null;
    sourceId: string | null;
    status: string;
    latitude: number | null;
    longitude: number | null;
    quantity: number;
    displayLabel: string;
    pinAccuracy: string;
    piiMasked: boolean;
    /** Reveal endpoint worth calling (no secret payload). */
    hasAccessInfo: boolean;
    shipmentCount: number;
    /** Contact exists and is usable — never includes phone value. */
    contactAvailable: boolean;
  }>;
  shipments: Array<{
    id: string;
    pointId: string;
    jobId: string;
    sourceId: string | null;
    externalId: string | null;
    sequenceNo: number;
    trackingCode: string;
    status: string;
  }>;
};

/** Product service-date timezone (Korea). Not client-local. */
export function serviceDateInSeoul(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function parseServiceDateParam(raw: string | undefined): string {
  if (raw == null || raw.trim() === "") {
    return serviceDateInSeoul();
  }
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error("invalid_service_date");
  }
  const [y, m, d] = s.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new Error("invalid_service_date");
  }
  return s;
}

function isRevealablePointStatus(status: string, piiMasked: boolean): boolean {
  if (piiMasked) return false;
  return status === "pending" || status === "in_progress";
}

/**
 * Today's Workset = query projection (no workset table).
 * Auth: JWT driver + jobs/points.driver_id assignment only.
 */
@Injectable()
export class TodayWorksetService {
  private readonly logger = new Logger(TodayWorksetService.name);

  constructor(
    private readonly accessSecrets: AccessSecretsService,
    private readonly serviceClient: SupabaseServiceClient,
  ) {}

  async getToday(
    userClient: SupabaseClient,
    args: { driverId: string; serviceDate: string },
  ): Promise<TodayWorksetResponse> {
    const jobs = await this.listJobsForDriverDate(
      userClient,
      args.driverId,
      args.serviceDate,
    );

    // Defense: never leak another driver's jobs even if RLS misconfigured.
    const ownJobs = jobs.filter((j) => j.driver_id === args.driverId);
    const jobIds = ownJobs.map((j) => j.id);
    const jobById = new Map(ownJobs.map((j) => [j.id, j]));

    const points =
      jobIds.length === 0
        ? []
        : (await this.listPointsForJobs(userClient, jobIds)).filter(
            (p) => p.driver_id === args.driverId && jobById.has(p.job_id),
          );

    const pointIds = points.map((p) => p.id);
    const shipments =
      pointIds.length === 0
        ? []
        : (await this.listShipmentsForPoints(userClient, pointIds)).filter(
            (s) =>
              s.driver_id === args.driverId && pointIds.includes(s.point_id),
          );

    const sourceIds = [
      ...new Set(
        [
          ...ownJobs.map((j) => j.source_id),
          ...shipments.map((s) => s.source_id),
        ].filter((x): x is string => Boolean(x)),
      ),
    ];
    const sources =
      sourceIds.length === 0
        ? []
        : await this.listSourcesByIds(userClient, sourceIds);

    const companyIds = [
      ...new Set(
        ownJobs
          .map((j) => j.company_id)
          .filter((x): x is string => Boolean(x)),
      ),
    ];

    // Bounded batch capability queries (not per-point N+1).
    const [companies, accessSet, contactSet] = await Promise.all([
      this.listCompaniesByIds(companyIds),
      pointIds.length === 0
        ? Promise.resolve(new Set<string>())
        : this.accessSecrets.listPointIdsWithAccessInfo(
            userClient,
            args.driverId,
            pointIds,
          ),
      pointIds.length === 0
        ? Promise.resolve(new Set<string>())
        : this.listContactAvailablePointIds(userClient, pointIds),
    ]);

    return this.buildResponse({
      serviceDate: args.serviceDate,
      jobs: ownJobs,
      points,
      shipments,
      sources,
      companies,
      accessSet,
      contactSet,
    });
  }

  private buildResponse(input: {
    serviceDate: string;
    jobs: TodayJobRow[];
    points: TodayPointRow[];
    shipments: TodayShipmentRow[];
    sources: TodaySourceRow[];
    companies: Array<{ id: string; displayName: string }>;
    accessSet: Set<string>;
    contactSet: Set<string>;
  }): TodayWorksetResponse {
    const jobById = new Map(input.jobs.map((j) => [j.id, j]));
    let completedPoints = 0;
    let pendingPoints = 0;
    const byCompanyMap = new Map<
      string,
      { companyId: string | null; totalPoints: number; completedPoints: number }
    >();
    const bySourceMap = new Map<
      string,
      { sourceId: string | null; totalPoints: number; completedPoints: number }
    >();

    const shipmentCountByPoint = new Map<string, number>();
    for (const s of input.shipments) {
      shipmentCountByPoint.set(
        s.point_id,
        (shipmentCountByPoint.get(s.point_id) ?? 0) + 1,
      );
    }

    const pointsOut = input.points.map((p) => {
      const job = jobById.get(p.job_id);
      const companyId = job?.company_id ?? null;
      const sourceId = job?.source_id ?? null;
      const done = p.status === "completed";
      if (done) completedPoints += 1;
      else pendingPoints += 1;

      const ck = companyId ?? "null";
      const c = byCompanyMap.get(ck) ?? {
        companyId,
        totalPoints: 0,
        completedPoints: 0,
      };
      c.totalPoints += 1;
      if (done) c.completedPoints += 1;
      byCompanyMap.set(ck, c);

      const sk = sourceId ?? "null";
      const s = bySourceMap.get(sk) ?? {
        sourceId,
        totalPoints: 0,
        completedPoints: 0,
      };
      s.totalPoints += 1;
      if (done) s.completedPoints += 1;
      bySourceMap.set(sk, s);

      const coords = parsePointLocation(p.location);
      const piiMasked = p.pii_masked_at != null || p.status === "completed";
      const revealable = isRevealablePointStatus(p.status, piiMasked);

      return {
        pointId: p.id,
        jobId: p.job_id,
        companyId,
        sourceId,
        status: p.status,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        quantity: p.quantity,
        displayLabel: p.display_label,
        pinAccuracy: p.pin_accuracy,
        piiMasked,
        hasAccessInfo: revealable && input.accessSet.has(p.id),
        shipmentCount: shipmentCountByPoint.get(p.id) ?? 0,
        contactAvailable: revealable && input.contactSet.has(p.id),
      };
    });

    return {
      serviceDate: input.serviceDate,
      summary: {
        totalPoints: input.points.length,
        completedPoints,
        pendingPoints,
        totalShipments: input.shipments.length,
        byCompany: [...byCompanyMap.values()],
        bySource: [...bySourceMap.values()],
      },
      companies: input.companies,
      sources: input.sources.map((s) => ({
        id: s.id,
        companyId: s.company_id,
        ownerDriverId: s.owner_driver_id,
        sourceType: s.source_type,
        sourceKey: s.source_key,
        displayName: s.display_name,
        externalSystem: s.external_system,
        isActive: s.is_active,
      })),
      jobs: input.jobs.map((j) => ({
        id: j.id,
        companyId: j.company_id,
        sourceId: j.source_id,
        status: j.status,
        serviceDate: j.service_date,
      })),
      points: pointsOut,
      shipments: input.shipments.map((s) => ({
        id: s.id,
        pointId: s.point_id,
        jobId: s.job_id,
        sourceId: s.source_id,
        externalId: s.external_id,
        sequenceNo: s.sequence_no,
        trackingCode: s.tracking_code,
        status: s.status,
      })),
    };
  }

  private async listJobsForDriverDate(
    userClient: SupabaseClient,
    driverId: string,
    serviceDate: string,
  ): Promise<TodayJobRow[]> {
    const { data, error } = await userClient
      .from("delivery_jobs")
      .select("id, driver_id, company_id, source_id, status, service_date")
      .eq("driver_id", driverId)
      .eq("service_date", serviceDate)
      .order("created_at", { ascending: true });

    if (error) {
      this.logger.warn(`today jobs failed code=${error.code}`);
      return [];
    }
    return (data as TodayJobRow[]) ?? [];
  }

  private async listPointsForJobs(
    userClient: SupabaseClient,
    jobIds: string[],
  ): Promise<TodayPointRow[]> {
    const { data, error } = await userClient
      .from("delivery_points")
      .select(
        "id, job_id, driver_id, display_label, quantity, status, location, pin_accuracy, pii_masked_at",
      )
      .in("job_id", jobIds)
      .order("sequence_no", { ascending: true });

    if (error) {
      this.logger.warn(`today points failed code=${error.code}`);
      return [];
    }
    return (data as TodayPointRow[]) ?? [];
  }

  private async listShipmentsForPoints(
    userClient: SupabaseClient,
    pointIds: string[],
  ): Promise<TodayShipmentRow[]> {
    const { data, error } = await userClient
      .from("delivery_shipments")
      .select(
        "id, point_id, job_id, driver_id, source_id, external_id, sequence_no, tracking_code, status",
      )
      .in("point_id", pointIds)
      .order("sequence_no", { ascending: true });

    if (error) {
      this.logger.warn(`today shipments failed code=${error.code}`);
      return [];
    }
    return (data as TodayShipmentRow[]) ?? [];
  }

  private async listSourcesByIds(
    userClient: SupabaseClient,
    sourceIds: string[],
  ): Promise<TodaySourceRow[]> {
    const { data, error } = await userClient
      .from("delivery_sources")
      .select(
        "id, company_id, owner_driver_id, source_type, source_key, display_name, external_system, is_active",
      )
      .in("id", sourceIds);

    if (error) {
      this.logger.warn(`today sources failed code=${error.code}`);
      return [];
    }
    return (data as TodaySourceRow[]) ?? [];
  }

  /**
   * Company labels for workset company_ids only.
   * Uses service_role because driver RLS cannot read other companies' rows,
   * while multi-company drivers may be assigned jobs across companies.
   * Never returns companies outside the provided id set.
   */
  private async listCompaniesByIds(
    companyIds: string[],
  ): Promise<Array<{ id: string; displayName: string }>> {
    if (!companyIds.length) return [];
    const client = this.serviceClient.getOrNull();
    if (!client) {
      this.logger.warn("service client unavailable for company labels");
      return [];
    }
    const { data, error } = await client
      .from("companies")
      .select("id, name")
      .in("id", companyIds);
    if (error) {
      this.logger.warn(`companies label lookup failed code=${error.code}`);
      return [];
    }
    return (data ?? []).map((row) => ({
      id: row.id as string,
      displayName: (row.name as string) ?? "",
    }));
  }

  /** Batched contact capability — point_id only, no phone/value in response path. */
  private async listContactAvailablePointIds(
    userClient: SupabaseClient,
    pointIds: string[],
  ): Promise<Set<string>> {
    const out = new Set<string>();
    if (!pointIds.length) return out;
    const { data, error } = await userClient
      .from("delivery_point_pii")
      .select("point_id, contact_type, contact_value, contact_purged_at")
      .in("point_id", pointIds);
    if (error) {
      this.logger.warn(`contactAvailable batch failed code=${error.code}`);
      return out;
    }
    for (const row of data ?? []) {
      const pointId = row.point_id as string | null;
      if (!pointId) continue;
      if (row.contact_purged_at) continue;
      const type = (row.contact_type as string | null) ?? "none";
      if (type === "none") continue;
      const value = (row.contact_value as string | null)?.trim() ?? "";
      if (!value) continue;
      out.add(pointId);
    }
    return out;
  }
}
