import type { MappedImportFields } from "./import.header-mapping";
import type {
  NormalizedDeliveryDraft,
  QuantityOrigin,
  ValidationIssue,
} from "./import.types";

/**
 * String-level normalization only — no AddressResolver / geocode calls.
 *
 * Formula-injection boundary (preserved from C1):
 * - Import RAW values are never stripped/rewritten for = + - @ prefixes.
 * - Normalize may flag WARNING formula_injection_risk.
 * - Export/display layers MUST sanitize (e.g. prefix apostrophe) before
 *   spreadsheet export. Validation Engine does not mutate original values.
 */
const FORMULA_PREFIX = /^[=+\-@]/;

export function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

export function normalizeTrackingIdentifier(
  value: string | null | undefined,
): string | null {
  const t = emptyToNull(value);
  if (!t) return null;
  return t.replace(/\s+/g, "");
}

export function normalizeQuantity(
  value: string | null | undefined,
): {
  quantity: number | null;
  origin: QuantityOrigin;
  issue?: ValidationIssue;
} {
  const t = emptyToNull(value);
  if (t == null) {
    return {
      quantity: 1,
      origin: "defaulted",
      issue: {
        code: "default_quantity_applied",
        severity: "warning",
        message: "quantity defaulted to 1",
        messageKey: "import.warning.default_quantity_applied",
        field: "quantity",
        metadata: { quantityOrigin: "defaulted" },
      },
    };
  }
  const cleaned = t.replace(/,/g, "");
  if (!/^\d+$/.test(cleaned)) {
    return {
      quantity: null,
      origin: "invalid",
      issue: {
        code: "invalid_quantity",
        severity: "error",
        message: "quantity must be a non-negative integer",
        messageKey: "import.error.invalid_quantity",
        field: "quantity",
        metadata: { quantityOrigin: "invalid" },
      },
    };
  }
  const n = Number(cleaned);
  if (!Number.isSafeInteger(n) || n < 0) {
    return {
      quantity: null,
      origin: "invalid",
      issue: {
        code: "invalid_quantity",
        severity: "error",
        message: "quantity out of range",
        messageKey: "import.error.invalid_quantity",
        field: "quantity",
        metadata: { quantityOrigin: "invalid" },
      },
    };
  }
  return { quantity: n, origin: "explicit" };
}

function formulaRiskIssue(
  field: string,
  value: string | null,
): ValidationIssue | null {
  if (value == null) return null;
  if (!FORMULA_PREFIX.test(value)) return null;
  return {
    code: "formula_injection_risk",
    severity: "warning",
    message: "cell may be spreadsheet-formula-like; sanitize on export/display",
    messageKey: "import.warning.formula_injection_risk",
    field,
  };
}

function isEntirelyBlankRaw(raw: Record<string, string | null>): boolean {
  return Object.entries(raw).every(([k, v]) => {
    if (k.startsWith("__extra_")) return emptyToNull(v) == null;
    return emptyToNull(v) == null;
  });
}

/**
 * Map + normalize one ImportRow into a draft.
 * companyId/sourceId are data only — not authorization truth.
 */
export function normalizeMappedRow(args: {
  rowIndex: number;
  mapped: MappedImportFields;
  missingRequired: Array<keyof MappedImportFields>;
  unknownHeaders: string[];
  raw: Record<string, string | null>;
  expectedColumnCount?: number;
  actualColumnCount?: number;
  columnMismatch?: "short" | "long" | null;
}): NormalizedDeliveryDraft {
  const issues: ValidationIssue[] = [];
  const { mapped, rowIndex } = args;

  if (isEntirelyBlankRaw(args.raw)) {
    issues.push({
      code: "empty_row",
      severity: "error",
      message: "empty row",
      messageKey: "import.error.empty_row",
      rowIndex,
    });
  }

  if (args.columnMismatch === "short") {
    issues.push({
      code: "column_count_mismatch",
      severity: "error",
      message: "row has fewer columns than header",
      messageKey: "import.error.column_count_mismatch",
      rowIndex,
      metadata: {
        expectedColumns: args.expectedColumnCount,
        actualColumns: args.actualColumnCount,
      },
    });
  } else if (args.columnMismatch === "long") {
    issues.push({
      code: "column_count_mismatch",
      severity: "warning",
      message: "row has extra columns beyond header",
      messageKey: "import.warning.column_count_mismatch",
      rowIndex,
      metadata: {
        expectedColumns: args.expectedColumnCount,
        actualColumns: args.actualColumnCount,
      },
    });
  }

  for (const field of args.missingRequired) {
    // Skip redundant missing_* when empty_row already covers blank rows.
    if (issues.some((i) => i.code === "empty_row")) break;
    issues.push({
      code: "missing_required_field",
      severity: "error",
      message: `missing required field: ${String(field)}`,
      messageKey: "import.error.missing_required_field",
      field: String(field),
      rowIndex,
    });
  }

  if (args.unknownHeaders.length > 0) {
    const realUnknown = args.unknownHeaders.filter(
      (h) => !h.startsWith("__extra_") && !h.startsWith("__empty_header_"),
    );
    if (realUnknown.length > 0) {
      issues.push({
        code: "other",
        severity: "warning",
        message: `unknown headers count=${realUnknown.length}`,
        messageKey: "import.warning.unknown_headers",
        rowIndex,
      });
    }
  }

  const customerName = emptyToNull(mapped.customerName ?? null);
  const addressRaw = emptyToNull(mapped.address ?? null);
  const detailAddress = emptyToNull(mapped.addressDetail ?? null);
  const complexName = emptyToNull(mapped.complexName ?? null);
  const deliveryMemo = emptyToNull(mapped.deliveryMemo ?? null);
  const displayLabel = emptyToNull(mapped.displayLabel ?? null);
  const barcodeRaw = emptyToNull(mapped.barcodeRaw ?? null);
  const trackingCode = normalizeTrackingIdentifier(mapped.trackingCode ?? null);
  const externalId = normalizeTrackingIdentifier(mapped.externalId ?? null);
  const companyId = emptyToNull(mapped.companyId ?? null);
  const sourceId = emptyToNull(mapped.sourceId ?? null);
  const sourceKey = emptyToNull(mapped.sourceKey ?? null);
  const serviceDate = emptyToNull(mapped.serviceDate ?? null);

  const qty = normalizeQuantity(mapped.quantity ?? null);
  if (qty.issue) {
    issues.push({ ...qty.issue, rowIndex });
  }

  for (const [field, value] of [
    ["customerName", customerName],
    ["address", addressRaw],
    ["addressDetail", detailAddress],
    ["complexName", complexName],
    ["deliveryMemo", deliveryMemo],
    ["displayLabel", displayLabel],
    ["barcodeRaw", barcodeRaw],
    ["trackingCode", trackingCode],
  ] as const) {
    const risk = formulaRiskIssue(field, value);
    if (risk) issues.push({ ...risk, rowIndex });
  }

  const addressNormalized = addressRaw
    ? addressRaw.replace(/\s+/g, " ").trim()
    : null;

  return {
    rowIndex,
    companyId,
    sourceId,
    sourceKey,
    serviceDate,
    trackingCode,
    externalId,
    quantity: qty.quantity,
    quantityOrigin: qty.origin,
    customerName,
    addressRaw,
    addressNormalized,
    detailAddress,
    complexName,
    deliveryMemo,
    displayLabel,
    barcodeRaw,
    latitude: null,
    longitude: null,
    geocodeConfidence: null,
    geocodeProvider: null,
    geocodeStatus: "pending",
    expectedColumnCount: args.expectedColumnCount,
    actualColumnCount: args.actualColumnCount,
    columnMismatch: args.columnMismatch ?? null,
    issues,
  };
}
