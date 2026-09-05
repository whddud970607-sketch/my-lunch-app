import { Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeSupabaseError } from "../supabase/supabase-error-log";
import type {
  DeliverySourceType,
  ResolvedImportSource,
} from "./import-context.port";

type DeliverySourceRow = {
  id: string;
  company_id: string | null;
  owner_driver_id: string | null;
  source_type: DeliverySourceType;
  source_key: string;
  is_active: boolean;
};

@Injectable()
export class DeliverySourceRepository {
  private readonly logger = new Logger(DeliverySourceRepository.name);

  async findById(
    userClient: SupabaseClient,
    sourceId: string,
  ): Promise<ResolvedImportSource | null> {
    const { data, error } = await userClient
      .from("delivery_sources")
      .select(
        "id, company_id, owner_driver_id, source_type, source_key, is_active",
      )
      .eq("id", sourceId)
      .maybeSingle();

    if (error) {
      this.logger.warn(
        `delivery_sources lookup failed ${summarizeSupabaseError(error)}`,
      );
      return null;
    }

    if (!data) return null;
    return mapRow(data as DeliverySourceRow);
  }

  async findBySourceKey(
    userClient: SupabaseClient,
    sourceKey: string,
    scope: {
      companyId?: string | null;
      ownerDriverId?: string | null;
    },
  ): Promise<ResolvedImportSource[]> {
    let query = userClient
      .from("delivery_sources")
      .select(
        "id, company_id, owner_driver_id, source_type, source_key, is_active",
      )
      .eq("source_key", sourceKey);

    if (scope.companyId) {
      query = query.eq("company_id", scope.companyId);
    } else if (scope.ownerDriverId) {
      query = query.eq("owner_driver_id", scope.ownerDriverId);
    }

    const { data, error } = await query;
    if (error) {
      this.logger.warn(
        `delivery_sources key lookup failed ${summarizeSupabaseError(error)}`,
      );
      return [];
    }

    return ((data as DeliverySourceRow[] | null) ?? []).map(mapRow);
  }
}

function mapRow(row: DeliverySourceRow): ResolvedImportSource {
  return {
    id: row.id,
    companyId: row.company_id,
    ownerDriverId: row.owner_driver_id,
    sourceType: row.source_type,
    sourceKey: row.source_key,
    isActive: row.is_active,
  };
}
