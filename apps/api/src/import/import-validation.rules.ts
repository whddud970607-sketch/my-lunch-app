/**
 * Composable Import validation rules (format-agnostic).
 * Keep composition simple — no heavy framework.
 */

import type { ImportContextResolver } from "./import-context.port";
import type {
  ImportSourceFormat,
  ImportValidationContextInput,
  NormalizedDeliveryDraft,
  ValidationIssue,
} from "./import.types";

export type ValidationRuleContext = {
  importFormat: ImportSourceFormat;
  input: ImportValidationContextInput;
  contextResolver: ImportContextResolver;
  /**
   * Per-row namespace key after context resolution.
   * "unresolved" | "required" | source:uuid
   */
  namespaceByRowIndex: Map<number, string>;
};

export interface ImportValidationRule {
  readonly name: string;
  validateRow?(
    draft: NormalizedDeliveryDraft,
    ctx: ValidationRuleContext,
  ): ValidationIssue[];
  validateBatch?(
    drafts: NormalizedDeliveryDraft[],
    ctx: ValidationRuleContext,
  ): ValidationIssue[];
  validateContext?(
    drafts: NormalizedDeliveryDraft[],
    ctx: ValidationRuleContext,
  ): ValidationIssue[];
}

const SERVICE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isPlausibleUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/** Row: required string presence / shape only (no geocode). */
export const rowRequiredAndShapeRule: ImportValidationRule = {
  name: "rowRequiredAndShape",
  validateRow(draft) {
    const issues: ValidationIssue[] = [];
    // Normalize already emits missing_required_field / empty_row / invalid_quantity /
    // column_count_mismatch / default_quantity_applied / formula_injection_risk.
    // Re-check address/tracking for drafts that skipped normalize path (API/manual).
    if (!draft.issues.some((i) => i.code === "empty_row")) {
      if (!draft.addressRaw || draft.addressRaw.trim() === "") {
        if (
          !draft.issues.some(
            (i) =>
              i.code === "missing_required_field" && i.field === "address",
          )
        ) {
          issues.push({
            code: "missing_required_field",
            severity: "error",
            message: "missing required field: address",
            messageKey: "import.error.missing_required_field",
            field: "address",
            rowIndex: draft.rowIndex,
          });
        }
      }
      if (!draft.trackingCode || draft.trackingCode.trim() === "") {
        if (
          !draft.issues.some(
            (i) =>
              i.code === "missing_required_field" &&
              i.field === "trackingCode",
          )
        ) {
          issues.push({
            code: "missing_required_field",
            severity: "error",
            message: "missing required field: trackingCode",
            messageKey: "import.error.missing_required_field",
            field: "trackingCode",
            rowIndex: draft.rowIndex,
          });
        }
      }
    }

    if (draft.quantityOrigin === "invalid" || draft.quantity == null) {
      if (!draft.issues.some((i) => i.code === "invalid_quantity")) {
        issues.push({
          code: "invalid_quantity",
          severity: "error",
          message: "quantity invalid",
          messageKey: "import.error.invalid_quantity",
          field: "quantity",
          rowIndex: draft.rowIndex,
          metadata: { quantityOrigin: draft.quantityOrigin },
        });
      }
    }

    if (draft.serviceDate != null) {
      if (!SERVICE_DATE_RE.test(draft.serviceDate)) {
        issues.push({
          code: "invalid_service_date",
          severity: "error",
          message: "serviceDate must be YYYY-MM-DD",
          messageKey: "import.error.invalid_service_date",
          field: "serviceDate",
          rowIndex: draft.rowIndex,
        });
      } else {
        const [y, m, d] = draft.serviceDate.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        if (
          dt.getUTCFullYear() !== y ||
          dt.getUTCMonth() !== m - 1 ||
          dt.getUTCDate() !== d
        ) {
          issues.push({
            code: "invalid_service_date",
            severity: "error",
            message: "serviceDate is not a real calendar date",
            messageKey: "import.error.invalid_service_date",
            field: "serviceDate",
            rowIndex: draft.rowIndex,
          });
        }
      }
    }

    // Soft format check only when claim present (UUID-shaped ids).
    if (draft.companyId && !isPlausibleUuid(draft.companyId)) {
      issues.push({
        code: "invalid_identifier_format",
        severity: "warning",
        message: "companyId claim is not UUID-shaped",
        messageKey: "import.warning.invalid_identifier_format",
        field: "companyId",
        rowIndex: draft.rowIndex,
      });
    }
    if (draft.sourceId && !isPlausibleUuid(draft.sourceId)) {
      issues.push({
        code: "invalid_identifier_format",
        severity: "warning",
        message: "sourceId claim is not UUID-shaped",
        messageKey: "import.warning.invalid_identifier_format",
        field: "sourceId",
        rowIndex: draft.rowIndex,
      });
    }

    return issues;
  },
};

/** Batch: source-scoped duplicates — O(n) maps. Never auto-delete rows. */
export const batchDuplicateRule: ImportValidationRule = {
  name: "batchDuplicates",
  validateBatch(drafts, ctx) {
    const issues: ValidationIssue[] = [];
    const trackingFirst = new Map<string, number>();
    const externalFirst = new Map<string, number>();
    const rowFingerprintFirst = new Map<string, number>();

    for (const d of drafts) {
      const ns = ctx.namespaceByRowIndex.get(d.rowIndex) ?? "unresolved";

      // Skip duplicate ERROR when namespace not resolved (avoid false global unique).
      if (ns !== "unresolved" && ns !== "required") {
        if (d.trackingCode) {
          const key = `${ns}|trk|${d.trackingCode}`;
          const prev = trackingFirst.get(key);
          if (prev != null) {
            issues.push({
              code: "duplicate_tracking_in_batch",
              severity: "error",
              message: "duplicate tracking identifier in batch for same source",
              messageKey: "import.error.duplicate_tracking_in_batch",
              field: "trackingCode",
              rowIndex: d.rowIndex,
              metadata: { otherRowIndex: prev },
            });
          } else {
            trackingFirst.set(key, d.rowIndex);
          }
        }

        if (d.externalId) {
          const key = `${ns}|ext|${d.externalId}`;
          const prev = externalFirst.get(key);
          if (prev != null) {
            issues.push({
              code: "duplicate_external_id_in_batch",
              severity: "error",
              message: "duplicate externalId in batch for same source",
              messageKey: "import.error.duplicate_external_id_in_batch",
              field: "externalId",
              rowIndex: d.rowIndex,
              metadata: { otherRowIndex: prev },
            });
          } else {
            externalFirst.set(key, d.rowIndex);
          }
        }
      }

      // Exact duplicate row within batch (fingerprint — no PII in issue).
      const fp = [
        ns,
        d.trackingCode ?? "",
        d.externalId ?? "",
        d.addressNormalized ?? d.addressRaw ?? "",
        d.detailAddress ?? "",
        String(d.quantity ?? ""),
        d.customerName ?? "",
        d.serviceDate ?? "",
      ].join("\u0001");
      const prevFp = rowFingerprintFirst.get(fp);
      if (prevFp != null) {
        issues.push({
          code: "duplicate_row_in_batch",
          severity: "warning",
          message: "duplicate row content in batch",
          messageKey: "import.warning.duplicate_row_in_batch",
          rowIndex: d.rowIndex,
          metadata: { otherRowIndex: prevFp },
        });
      } else {
        rowFingerprintFirst.set(fp, d.rowIndex);
      }
    }

    return issues;
  },
};

/** Context: authorize Company/Source via port — never trust CSV claims. */
export const contextSourceRule: ImportValidationRule = {
  name: "contextSource",
  validateContext(drafts, ctx) {
    const issues: ValidationIssue[] = [];
    const batchId = ctx.input.batchSourceId ?? null;

    if (batchId) {
      const resolution = ctx.contextResolver.resolve({
        actorDriverId: ctx.input.actorDriverId,
        actorCompanyIds: ctx.input.actorCompanyIds,
        batchSourceId: batchId,
        importFormat: ctx.importFormat,
      });
      const batchIssues = resolutionToIssues(resolution, undefined);
      for (const d of drafts) {
        if (resolution.status === "resolved") {
          ctx.namespaceByRowIndex.set(d.rowIndex, resolution.namespaceKey);
        } else if (resolution.status === "source_required") {
          ctx.namespaceByRowIndex.set(d.rowIndex, "required");
        } else {
          ctx.namespaceByRowIndex.set(d.rowIndex, "unresolved");
        }
        for (const issue of batchIssues) {
          issues.push({ ...issue, rowIndex: d.rowIndex });
        }
      }
      return issues;
    }

    // Per-row claims.
    for (const d of drafts) {
      const resolution = ctx.contextResolver.resolve({
        actorDriverId: ctx.input.actorDriverId,
        actorCompanyIds: ctx.input.actorCompanyIds,
        claimedSourceId: d.sourceId,
        claimedSourceKey: d.sourceKey,
        claimedCompanyId: d.companyId,
        importFormat: ctx.importFormat,
      });
      if (resolution.status === "resolved") {
        ctx.namespaceByRowIndex.set(d.rowIndex, resolution.namespaceKey);
      } else if (resolution.status === "source_required") {
        ctx.namespaceByRowIndex.set(d.rowIndex, "required");
      } else {
        ctx.namespaceByRowIndex.set(d.rowIndex, "unresolved");
        if (
          resolution.status === "unresolved" ||
          (!d.sourceId && !d.sourceKey)
        ) {
          // source_required already handled; unresolved when ambiguous key
        }
      }
      for (const issue of resolutionToIssues(resolution, d.rowIndex)) {
        issues.push(issue);
      }
    }
    return issues;
  },
};

function resolutionToIssues(
  resolution: ReturnType<ImportContextResolver["resolve"]>,
  rowIndex: number | undefined,
): ValidationIssue[] {
  const base = { rowIndex };
  switch (resolution.status) {
    case "resolved":
      return [];
    case "source_required":
      return [
        {
          ...base,
          code: "source_required",
          severity: "error",
          message: "import source is required",
          messageKey: "import.error.source_required",
        },
      ];
    case "source_not_found":
      return [
        {
          ...base,
          code: "source_not_found",
          severity: "error",
          message: "source not found",
          messageKey: "import.error.source_not_found",
        },
      ];
    case "source_not_allowed":
      return [
        {
          ...base,
          code: "source_not_allowed",
          severity: "error",
          message: "source not allowed for actor",
          messageKey: "import.error.source_not_allowed",
        },
      ];
    case "company_source_mismatch":
      return [
        {
          ...base,
          code: "company_source_mismatch",
          severity: "error",
          message: "claimed company does not match source",
          messageKey: "import.error.company_source_mismatch",
        },
      ];
    case "personal_source_owner_mismatch":
      return [
        {
          ...base,
          code: "personal_source_owner_mismatch",
          severity: "error",
          message: "personal source owner mismatch",
          messageKey: "import.error.personal_source_owner_mismatch",
        },
      ];
    case "source_type_not_importable":
      return [
        {
          ...base,
          code: "source_type_not_importable",
          severity: "error",
          message: "source type not importable for format",
          messageKey: "import.error.source_type_not_importable",
          metadata: {
            actualSourceType: resolution.actualSourceType,
            allowedSourceType: resolution.allowedSourceType,
          },
        },
      ];
    case "unresolved":
      return [
        {
          ...base,
          code: "source_namespace_unresolved",
          severity: "error",
          message: "source namespace could not be resolved",
          messageKey: "import.error.source_namespace_unresolved",
        },
      ];
    default:
      return [];
  }
}

export const DEFAULT_IMPORT_VALIDATION_RULES: ImportValidationRule[] = [
  contextSourceRule,
  rowRequiredAndShapeRule,
  batchDuplicateRule,
];
