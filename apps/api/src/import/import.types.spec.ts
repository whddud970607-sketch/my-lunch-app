import {
  canPreviewCommit,
  countIssues,
  NormalizedDeliveryDraft,
  ValidationIssue,
} from "./import.types";

describe("Import foundation helpers", () => {
  const draft = (
    issues: ValidationIssue[],
  ): NormalizedDeliveryDraft => ({
    rowIndex: 0,
    companyId: null,
    sourceId: "src-1",
    sourceKey: null,
    serviceDate: "2026-08-30",
    trackingCode: "T1",
    externalId: null,
    quantity: 1,
    quantityOrigin: "explicit",
    customerName: null,
    addressRaw: "서울",
    addressNormalized: null,
    detailAddress: null,
    deliveryMemo: null,
    displayLabel: null,
    barcodeRaw: null,
    latitude: null,
    longitude: null,
    geocodeConfidence: null,
    geocodeProvider: null,
    geocodeStatus: "pending",
    issues,
  });

  it("blocks preview when any error issue exists", () => {
    expect(
      canPreviewCommit([
        draft([
          {
            code: "missing_address",
            severity: "error",
            message: "address required",
          },
        ]),
      ]),
    ).toBe(false);
  });

  it("allows preview when only warnings", () => {
    expect(
      canPreviewCommit([
        draft([
          {
            code: "other",
            severity: "warning",
            message: "low confidence geocode",
          },
        ]),
      ]),
    ).toBe(true);
  });

  it("counts errors and warnings", () => {
    const { errors, warnings } = countIssues([
      draft([
        { code: "invalid_quantity", severity: "error", message: "qty" },
        { code: "other", severity: "warning", message: "warn" },
      ]),
    ]);
    expect(errors).toBe(1);
    expect(warnings).toBe(1);
  });
});
