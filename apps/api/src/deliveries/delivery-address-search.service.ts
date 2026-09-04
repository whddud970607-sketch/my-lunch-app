import { Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DeliveryAddressSearchHit = {
  pointId: string;
  displayLabel: string;
  status: string;
  addressSnippet: string;
};

export type DeliveryAddressSearchResponse = {
  serviceDate: string;
  results: DeliveryAddressSearchHit[];
};

const WHITESPACE = /\s+/g;
const DONG_OR_HO_GAP = /([0-9a-z]+)\s+(동|호)/g;
const SNIPPET_MAX = 80;

export function normalizeAddressSearchQuery(raw: string): string {
  return raw.trim().replace(WHITESPACE, " ").toLowerCase();
}

function compactAddressSearchText(normalized: string): string {
  return normalized.replace(DONG_OR_HO_GAP, "$1$2");
}

export function addressSearchHaystackMatches(
  haystacks: Array<string | null | undefined>,
  query: string,
): boolean {
  const q = normalizeAddressSearchQuery(query);
  if (!q) return false;
  const cq = compactAddressSearchText(q);
  for (const raw of haystacks) {
    if (raw == null) continue;
    const n = normalizeAddressSearchQuery(raw);
    if (!n) continue;
    if (n.includes(q)) return true;
    if (compactAddressSearchText(n).includes(cq)) return true;
  }
  return false;
}

function snippetFromAddresses(
  rawAddress: string | null | undefined,
  normalizedAddress: string | null | undefined,
): string {
  const primary = (normalizedAddress ?? "").trim() || (rawAddress ?? "").trim();
  if (!primary) return "";
  if (primary.length <= SNIPPET_MAX) return primary;
  return `${primary.slice(0, SNIPPET_MAX).trimEnd()}…`;
}

type SearchJobRow = {
  id: string;
  driver_id: string;
  status: string;
};

type SearchPointRow = {
  id: string;
  job_id: string;
  driver_id: string;
  display_label: string;
  status: string;
  pii_masked_at: string | null;
};

type SearchPiiRow = {
  point_id: string;
  raw_address: string | null;
  normalized_address: string | null;
  detail_address: string | null;
};

/**
 * Authorized Today Point search. User JWT + RLS remain authoritative.
 * Never logs q / raw_address / detail_address.
 */
@Injectable()
export class DeliveryAddressSearchService {
  private readonly logger = new Logger(DeliveryAddressSearchService.name);

  async searchToday(
    userClient: SupabaseClient,
    args: { driverId: string; serviceDate: string; query: string },
  ): Promise<DeliveryAddressSearchResponse> {
    const empty: DeliveryAddressSearchResponse = {
      serviceDate: args.serviceDate,
      results: [],
    };
    const query = normalizeAddressSearchQuery(args.query);
    if (!query) return empty;

    const jobs = await this.listActiveJobs(
      userClient,
      args.driverId,
      args.serviceDate,
    );
    const ownJobs = jobs.filter((j) => j.driver_id === args.driverId);
    const jobIds = ownJobs.map((j) => j.id);
    if (jobIds.length === 0) return empty;

    const points = (await this.listPointsForJobs(userClient, jobIds)).filter(
      (p) =>
        p.driver_id === args.driverId &&
        (p.status === "pending" || p.status === "in_progress") &&
        p.pii_masked_at == null,
    );
    if (points.length === 0) return empty;

    const piiByPoint = await this.listAddressPii(
      userClient,
      points.map((p) => p.id),
    );

    const results: DeliveryAddressSearchHit[] = [];
    for (const point of points) {
      const pii = piiByPoint.get(point.id);
      const matched = addressSearchHaystackMatches(
        [
          point.display_label,
          pii?.raw_address,
          pii?.normalized_address,
          pii?.detail_address,
        ],
        query,
      );
      if (!matched) continue;
      results.push({
        pointId: point.id,
        displayLabel: point.display_label,
        status: point.status,
        addressSnippet: snippetFromAddresses(
          pii?.raw_address,
          pii?.normalized_address,
        ),
      });
    }

    return { serviceDate: args.serviceDate, results };
  }

  private async listActiveJobs(
    userClient: SupabaseClient,
    driverId: string,
    serviceDate: string,
  ): Promise<SearchJobRow[]> {
    const { data, error } = await userClient
      .from("delivery_jobs")
      .select("id, driver_id, status")
      .eq("driver_id", driverId)
      .eq("service_date", serviceDate)
      .eq("status", "active");
    if (error) {
      this.logger.warn(`today address search jobs failed code=${error.code}`);
      return [];
    }
    return (data as SearchJobRow[]) ?? [];
  }

  private async listPointsForJobs(
    userClient: SupabaseClient,
    jobIds: string[],
  ): Promise<SearchPointRow[]> {
    const { data, error } = await userClient
      .from("delivery_points")
      .select("id, job_id, driver_id, display_label, status, pii_masked_at")
      .in("job_id", jobIds)
      .order("sequence_no", { ascending: true });
    if (error) {
      this.logger.warn(`today address search points failed code=${error.code}`);
      return [];
    }
    return (data as SearchPointRow[]) ?? [];
  }

  private async listAddressPii(
    userClient: SupabaseClient,
    pointIds: string[],
  ): Promise<Map<string, SearchPiiRow>> {
    const out = new Map<string, SearchPiiRow>();
    if (pointIds.length === 0) return out;
    const { data, error } = await userClient
      .from("delivery_point_pii")
      .select("point_id, raw_address, normalized_address, detail_address")
      .in("point_id", pointIds);
    if (error) {
      this.logger.warn(`today address search pii failed code=${error.code}`);
      return out;
    }
    for (const row of (data as SearchPiiRow[]) ?? []) {
      if (!row.point_id) continue;
      out.set(row.point_id, row);
    }
    return out;
  }
}
