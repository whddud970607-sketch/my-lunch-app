/**
 * Import & Validation domain types (C1/C2).
 *
 * Rules:
 * - Preview/validation MUST NOT insert into delivery_points.
 * - Commit is an explicit later step with ownership checks.
 * - CSV/XLSX adapters implement ImportParser; domain never imports csv-parse types.
 * - AddressResolver is NOT called in C1/C2 (geocodeStatus stays pending).
 * - ValidationIssue must never embed PII or raw tracking/barcode/address values.
 */

import type { ImportParseOptions } from "./import.limits";

export type ImportSourceFormat = "csv" | "xlsx" | "api" | "manual";

export type ImportBatchStatus =
  | "uploaded"
  | "parsed"
  | "validated"
  | "preview_ready"
  | "committing"
  | "committed"
  | "failed"
  | "cancelled";

export type ValidationSeverity = "error" | "warning" | "info";

/**
 * Stable machine codes for Validation Engine (CSV-agnostic).
 * Prefer these over free-form strings in new code.
 */
export type ValidationIssueCode =
  | "missing_address"
  | "invalid_address"
  | "duplicate_shipment_identifier"
  | "duplicate_external_id"
  | "missing_required_field"
  | "invalid_quantity"
  | "unknown_source"
  | "invalid_company_source_relationship"
  | "row_parse_error"
  | "column_count_mismatch"
  | "empty_row"
  | "invalid_service_date"
  | "invalid_identifier_format"
  | "unsupported_value"
  | "duplicate_tracking_in_batch"
  | "duplicate_external_id_in_batch"
  | "duplicate_row_in_batch"
  | "source_required"
  | "source_not_found"
  | "source_not_allowed"
  | "company_source_mismatch"
  | "personal_source_owner_mismatch"
  | "source_type_not_importable"
  | "source_namespace_unresolved"
  | "default_quantity_applied"
  | "formula_injection_risk"
  | "other";

/** Non-sensitive metadata only (counts, ids of allowed sources, row refs). */
export type ValidationIssueMetadata = {
  expectedColumns?: number;
  actualColumns?: number;
  otherRowIndex?: number;
  allowedSourceType?: string;
  actualSourceType?: string;
  quantityOrigin?: QuantityOrigin;
};

export type ValidationIssue = {
  code: ValidationIssueCode;
  severity: ValidationSeverity;
  /** Internal short message — must not contain PII / raw identifiers. */
  message: string;
  /** Stable key for UI i18n (optional). */
  messageKey?: string;
  field?: string;
  rowIndex?: number;
  metadata?: ValidationIssueMetadata;
};

export type GeocodeStatus = "pending" | "resolved" | "failed" | "skipped";

/**
 * How quantity was produced during normalize.
 * - explicit: user provided a parseable integer (including 1)
 * - defaulted: missing/blank → system default 1
 * - invalid: present but unparseable
 */
export type QuantityOrigin = "explicit" | "defaulted" | "invalid";

export type ColumnMismatchKind = "short" | "long" | null;

/**
 * PII on draft: customerName, address*, detailAddress, deliveryMemo
 * Operational (never put values in ValidationIssue): trackingCode, externalId, barcodeRaw
 */

export type ImportRow = {
  rowIndex: number;
  raw: Record<string, string | null>;
  /** Header count from CSV. */
  expectedColumnCount?: number;
  /** Field count on this data line (index-aligned). */
  actualColumnCount?: number;
  columnMismatch?: ColumnMismatchKind;
};

export type NormalizedDeliveryDraft = {
  rowIndex: number;
  companyId: string | null;
  sourceId: string | null;
  sourceKey: string | null;
  serviceDate: string | null;
  trackingCode: string | null;
  externalId: string | null;
  quantity: number | null;
  quantityOrigin: QuantityOrigin;
  customerName: string | null;
  addressRaw: string | null;
  addressNormalized: string | null;
  detailAddress: string | null;
  /**
   * Optional apartment/complex/building name from import.
   * Folded into detail_address at commit (no dedicated PII column).
   */
  complexName: string | null;
  deliveryMemo: string | null;
  displayLabel: string | null;
  barcodeRaw: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeConfidence: number | null;
  geocodeProvider: string | null;
  geocodeStatus: GeocodeStatus;
  /** Propagated from ImportRow for validation. */
  expectedColumnCount?: number;
  actualColumnCount?: number;
  columnMismatch?: ColumnMismatchKind;
  /**
   * Issues collected during normalize (C1). Validation Engine appends more;
   * never store PII values here.
   */
  issues: ValidationIssue[];
};

export type ImportBatch = {
  id: string;
  driverId: string | null;
  companyId: string | null;
  sourceId: string | null;
  format: ImportSourceFormat;
  status: ImportBatchStatus;
  rowCount: number;
  errorCount: number;
  warningCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RowValidity = "valid" | "warning" | "error";

export type ImportValidationResult = {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  issues: ValidationIssue[];
  /** Per-row validity aligned with input draft order. */
  rowStatuses: RowValidity[];
  /**
   * true only when:
   * - zero ERROR issues
   * - source/company context is fully resolved (no unresolved auth/source ERROR)
   * WARNING-only batches may still canCommit=true.
   */
  canCommit: boolean;
  drafts: NormalizedDeliveryDraft[];
};

export interface ImportParser {
  readonly format: ImportSourceFormat;
  parse(
    input: AsyncIterable<Uint8Array> | Buffer | string,
    options?: ImportParseOptions,
  ): AsyncIterable<ImportRow>;
}

export interface ImportValidator {
  validate(
    drafts: NormalizedDeliveryDraft[],
    context?: ImportValidationContextInput,
  ): ImportValidationResult;
}

export type ImportValidationContextInput = {
  /** Server-side resolved actor — never trust client role. */
  actorDriverId?: string | null;
  actorCompanyIds?: string[];
  /**
   * Batch-level source forced by server (preferred over per-row CSV claims).
   * When set, per-row sourceId/sourceKey are ignored for auth.
   */
  batchSourceId?: string | null;
};

export interface ImportCommitter {
  commit(
    userClient: import("@supabase/supabase-js").SupabaseClient,
    actor: { driverId: string; companyIds: string[] },
    request: import("./import-commit.types").ImportCommitRequest,
  ): Promise<import("./import-commit.types").ImportCommitResult>;
}

export function countIssues(
  drafts: NormalizedDeliveryDraft[],
): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const d of drafts) {
    for (const i of d.issues) {
      if (i.severity === "error") errors += 1;
      else if (i.severity === "warning") warnings += 1;
    }
  }
  return { errors, warnings };
}

export function rowValidityFromIssues(issues: ValidationIssue[]): RowValidity {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  return "valid";
}

/** @deprecated Prefer ImportValidationResult.canCommit from Validation Engine. */
export function canPreviewCommit(drafts: NormalizedDeliveryDraft[]): boolean {
  return drafts.every((d) => !d.issues.some((i) => i.severity === "error"));
}
