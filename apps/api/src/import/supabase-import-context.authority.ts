import { Injectable } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DeliverySourceRepository } from "./delivery-source.repository";
import { evaluateImportContextResolution } from "./import-context.evaluator";
import type {
  ImportContextResolution,
  ImportContextResolveInput,
} from "./import-context.port";

/**
 * Authoritative import context from delivery_sources via user-JWT (RLS-scoped reads).
 * Client CSV company/source claims are never trusted without DB-backed resolution.
 */
@Injectable()
export class SupabaseImportContextAuthority {
  constructor(private readonly sources: DeliverySourceRepository) {}

  async resolve(
    userClient: SupabaseClient,
    input: ImportContextResolveInput,
  ): Promise<ImportContextResolution> {
    const sourceId = input.batchSourceId ?? input.claimedSourceId ?? null;
    const sourceKey = input.claimedSourceKey ?? null;

    if (!sourceId && !sourceKey) {
      return { status: "source_required" };
    }

    if (sourceId) {
      const found = await this.sources.findById(userClient, sourceId);
      return evaluateImportContextResolution(found, input);
    }

    const matches = await this.sources.findBySourceKey(userClient, sourceKey!, {
      companyId: input.claimedCompanyId ?? input.actorCompanyIds?.[0] ?? null,
      ownerDriverId: input.actorDriverId ?? null,
    });

    if (matches.length === 0) {
      return { status: "source_not_found" };
    }
    if (matches.length > 1) {
      return { status: "unresolved" };
    }

    return evaluateImportContextResolution(matches[0], input);
  }
}
