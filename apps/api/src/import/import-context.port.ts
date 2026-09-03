/**
 * Server-side Import context resolution (C2).
 *
 * Client-supplied companyId / sourceId / sourceKey on CSV rows are claims only.
 * Authorization truth comes from this port + authenticated actor.
 *
 * C2: no HTTP/JWT wiring — FakeImportContextResolver for unit tests.
 * C3+: Nest provider backed by delivery_sources (read-only).
 */

import type { ImportSourceFormat } from "./import.types";

/** Mirrors public.delivery_source_type — do not invent new values in C2. */
export type DeliverySourceType =
  | "company_api"
  | "excel_import"
  | "csv_import"
  | "driver_manual"
  | "partner"
  | "local_shop"
  | "fixture"
  | "unknown";

/**
 * File-style import formats map to existing enum values only.
 * CSV → csv_import; XLSX → excel_import.
 * API ingest uses company_api / partner (not this file path).
 */
export const IMPORTABLE_SOURCE_TYPES_BY_FORMAT: Record<
  ImportSourceFormat,
  ReadonlySet<DeliverySourceType>
> = {
  csv: new Set(["csv_import"]),
  xlsx: new Set(["excel_import"]),
  api: new Set(["company_api", "partner"]),
  manual: new Set(["driver_manual"]),
};

export type ResolvedImportSource = {
  id: string;
  companyId: string | null;
  ownerDriverId: string | null;
  sourceType: DeliverySourceType;
  sourceKey: string;
  isActive: boolean;
};

export type ImportContextResolveInput = {
  actorDriverId?: string | null;
  actorCompanyIds?: string[];
  /** Preferred: server-forced batch source. */
  batchSourceId?: string | null;
  /** Per-row CSV claims — never trusted alone. */
  claimedSourceId?: string | null;
  claimedSourceKey?: string | null;
  claimedCompanyId?: string | null;
  importFormat: ImportSourceFormat;
};

export type ImportContextResolution =
  | {
      status: "resolved";
      source: ResolvedImportSource;
      /** Stable key for duplicate namespace maps. */
      namespaceKey: string;
    }
  | { status: "source_required" }
  | { status: "source_not_found" }
  | { status: "source_not_allowed" }
  | { status: "company_source_mismatch" }
  | { status: "personal_source_owner_mismatch" }
  | {
      status: "source_type_not_importable";
      actualSourceType: DeliverySourceType;
      allowedSourceType: string;
    }
  | { status: "unresolved" };

export interface ImportContextResolver {
  resolve(input: ImportContextResolveInput): ImportContextResolution;
}

import { evaluateImportContextResolution } from "./import-context.evaluator";

/**
 * In-memory resolver for unit tests and explicit dev fixtures only.
 * Production uses SupabaseImportContextAuthority — never trust CSV UUIDs blindly.
 */
export class FakeImportContextResolver implements ImportContextResolver {
  constructor(private readonly sources: ResolvedImportSource[] = []) {}

  resolve(input: ImportContextResolveInput): ImportContextResolution {
    const sourceId = input.batchSourceId ?? input.claimedSourceId ?? null;
    const sourceKey = input.claimedSourceKey ?? null;

    if (!sourceId && !sourceKey) {
      return { status: "source_required" };
    }

    let found: ResolvedImportSource | undefined;
    if (sourceId) {
      found = this.sources.find((s) => s.id === sourceId);
    } else if (sourceKey) {
      const matches = this.sources.filter((s) => s.sourceKey === sourceKey);
      if (matches.length === 1) found = matches[0];
      else if (matches.length === 0) return { status: "source_not_found" };
      else return { status: "unresolved" };
    }

    return evaluateImportContextResolution(found, input);
  }
}
