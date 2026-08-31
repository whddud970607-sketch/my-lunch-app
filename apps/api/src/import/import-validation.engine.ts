import { Injectable } from "@nestjs/common";
import {
  FakeImportContextResolver,
  type ImportContextResolver,
} from "./import-context.port";
import {
  DEFAULT_IMPORT_VALIDATION_RULES,
  type ImportValidationRule,
  type ValidationRuleContext,
} from "./import-validation.rules";
import type {
  ImportSourceFormat,
  ImportValidationContextInput,
  ImportValidationResult,
  ImportValidator,
  NormalizedDeliveryDraft,
  ValidationIssue,
} from "./import.types";
import { rowValidityFromIssues } from "./import.types";

const AUTH_ERROR_CODES = new Set([
  "source_required",
  "source_not_found",
  "source_not_allowed",
  "company_source_mismatch",
  "personal_source_owner_mismatch",
  "source_type_not_importable",
  "source_namespace_unresolved",
]);

/**
 * Shared Validation Engine for NormalizedDeliveryDraft[].
 * Used by CSV / XLSX / API / OCR / Manual — not CSV-specific.
 *
 * Stages: Context → Row → Batch.
 * No DB writes. No geocode. Does not auto-drop duplicate rows.
 */
@Injectable()
export class ImportValidationEngine implements ImportValidator {
  constructor(
    private readonly contextResolver: ImportContextResolver = new FakeImportContextResolver(),
    private readonly rules: ImportValidationRule[] = DEFAULT_IMPORT_VALIDATION_RULES,
  ) {}

  validate(
    drafts: NormalizedDeliveryDraft[],
    context: ImportValidationContextInput = {},
    options?: { importFormat?: ImportSourceFormat },
  ): ImportValidationResult {
    const importFormat = options?.importFormat ?? "csv";

    // Shallow-copy drafts so callers keep original normalize issues intact.
    const working: NormalizedDeliveryDraft[] = drafts.map((d) => ({
      ...d,
      issues: [...d.issues],
    }));

    const ruleCtx: ValidationRuleContext = {
      importFormat,
      input: context,
      contextResolver: this.contextResolver,
      namespaceByRowIndex: new Map(),
    };

    const append = (issues: ValidationIssue[]) => {
      for (const issue of issues) {
        const rowIndex = issue.rowIndex;
        if (rowIndex == null) continue;
        const draft = working.find((d) => d.rowIndex === rowIndex);
        if (draft) draft.issues.push(issue);
      }
    };

    // 1) Context (fills namespace map for batch rules)
    for (const rule of this.rules) {
      if (rule.validateContext) {
        append(rule.validateContext(working, ruleCtx));
      }
    }

    // 2) Row
    for (const rule of this.rules) {
      if (!rule.validateRow) continue;
      for (const draft of working) {
        append(rule.validateRow(draft, ruleCtx));
      }
    }

    // 3) Batch
    for (const rule of this.rules) {
      if (rule.validateBatch) {
        append(rule.validateBatch(working, ruleCtx));
      }
    }

    return buildValidationResult(working);
  }
}

export function buildValidationResult(
  drafts: NormalizedDeliveryDraft[],
): ImportValidationResult {
  const issues: ValidationIssue[] = [];
  const rowStatuses = drafts.map((d) => {
    issues.push(...d.issues);
    return rowValidityFromIssues(d.issues);
  });

  let validRows = 0;
  let errorRows = 0;
  let warningRows = 0;
  for (const s of rowStatuses) {
    if (s === "valid") validRows += 1;
    else if (s === "error") errorRows += 1;
    else warningRows += 1;
  }

  const hasError = issues.some((i) => i.severity === "error");
  const hasAuthBlock = issues.some(
    (i) => i.severity === "error" && AUTH_ERROR_CODES.has(i.code),
  );

  return {
    totalRows: drafts.length,
    validRows,
    errorRows,
    warningRows,
    issues,
    rowStatuses,
    canCommit: !hasError && !hasAuthBlock,
    drafts,
  };
}
