import { CsvParseAdapter } from "./csv-parse.adapter";
import {
  FakeImportContextResolver,
  type ResolvedImportSource,
} from "./import-context.port";
import { ImportNormalizeService } from "./import-normalize.service";
import { ImportValidationEngine } from "./import-validation.engine";
import { IMPORT_SMOKE_ROW_TARGET } from "./import.limits";
import type { NormalizedDeliveryDraft, ValidationIssue } from "./import.types";

const SRC_A: ResolvedImportSource = {
  id: "11111111-1111-4111-8111-111111111111",
  companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ownerDriverId: null,
  sourceType: "csv_import",
  sourceKey: "company-a-csv",
  isActive: true,
};

const SRC_B: ResolvedImportSource = {
  id: "22222222-2222-4222-8222-222222222222",
  companyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ownerDriverId: null,
  sourceType: "csv_import",
  sourceKey: "company-b-csv",
  isActive: true,
};

const SRC_API: ResolvedImportSource = {
  id: "33333333-3333-4333-8333-333333333333",
  companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ownerDriverId: null,
  sourceType: "company_api",
  sourceKey: "api-feed",
  isActive: true,
};

const SRC_PERSONAL: ResolvedImportSource = {
  id: "44444444-4444-4444-8444-444444444444",
  companyId: null,
  ownerDriverId: "driver-owner-1",
  sourceType: "driver_manual",
  sourceKey: "my-manual",
  isActive: true,
};

function assertNoPii(issues: ValidationIssue[]) {
  const blob = JSON.stringify(issues);
  // Must not embed raw operational/PII values (codes/messages may say "tracking").
  const forbidden = [
    "Seoul",
    "서울",
    "고객홍",
    "010-",
    "TRACK-SECRET",
    "TRK-001",
    "SecretAddr",
    "=1+1",
    "Gangnam",
    "memo-private",
    "Same Addr",
  ];
  for (const f of forbidden) {
    expect(blob).not.toContain(f);
  }
}

function baseDraft(
  overrides: Partial<NormalizedDeliveryDraft>,
): NormalizedDeliveryDraft {
  return {
    rowIndex: 1,
    companyId: null,
    sourceId: SRC_A.id,
    sourceKey: null,
    serviceDate: "2026-08-30",
    trackingCode: "T1",
    externalId: null,
    quantity: 1,
    quantityOrigin: "explicit",
    customerName: null,
    addressRaw: "Addr",
    addressNormalized: "Addr",
    detailAddress: null,
    deliveryMemo: null,
    displayLabel: null,
    barcodeRaw: null,
    latitude: null,
    longitude: null,
    geocodeConfidence: null,
    geocodeProvider: null,
    geocodeStatus: "pending",
    issues: [],
    ...overrides,
  };
}

describe("ImportValidationEngine (C2)", () => {
  const resolver = new FakeImportContextResolver([
    SRC_A,
    SRC_B,
    SRC_API,
    SRC_PERSONAL,
  ]);
  const engine = new ImportValidationEngine(resolver);
  const actor = {
    actorDriverId: "driver-1",
    actorCompanyIds: [SRC_A.companyId!, SRC_B.companyId!],
    batchSourceId: SRC_A.id,
  };

  it("valid batch → canCommit", () => {
    const result = engine.validate(
      [
        baseDraft({ rowIndex: 1, trackingCode: "A1", addressRaw: "Addr1" }),
        baseDraft({ rowIndex: 2, trackingCode: "A2", addressRaw: "Addr2" }),
      ],
      actor,
    );
    expect(result.totalRows).toBe(2);
    expect(result.errorRows).toBe(0);
    expect(result.canCommit).toBe(true);
    expect(result.rowStatuses).toEqual(["valid", "valid"]);
  });

  it("missing required field → error, cannotCommit", () => {
    const result = engine.validate(
      [baseDraft({ trackingCode: null, addressRaw: null })],
      actor,
    );
    expect(result.canCommit).toBe(false);
    expect(
      result.issues.some((i) => i.code === "missing_required_field"),
    ).toBe(true);
  });

  it("explicit quantity=1 stays explicit without default warning from engine", () => {
    const result = engine.validate(
      [baseDraft({ quantity: 1, quantityOrigin: "explicit" })],
      actor,
    );
    expect(result.canCommit).toBe(true);
    expect(
      result.issues.some((i) => i.code === "default_quantity_applied"),
    ).toBe(false);
  });

  it("missing quantity default provenance carries WARNING", () => {
    const result = engine.validate(
      [
        baseDraft({
          quantity: 1,
          quantityOrigin: "defaulted",
          issues: [
            {
              code: "default_quantity_applied",
              severity: "warning",
              message: "quantity defaulted to 1",
              field: "quantity",
              metadata: { quantityOrigin: "defaulted" },
            },
          ],
        }),
      ],
      actor,
    );
    expect(result.canCommit).toBe(true);
    expect(result.warningRows).toBe(1);
    expect(result.rowStatuses[0]).toBe("warning");
  });

  it("invalid quantity → error", () => {
    const result = engine.validate(
      [
        baseDraft({
          quantity: null,
          quantityOrigin: "invalid",
          issues: [
            {
              code: "invalid_quantity",
              severity: "error",
              message: "bad",
              field: "quantity",
            },
          ],
        }),
      ],
      actor,
    );
    expect(result.canCommit).toBe(false);
  });

  it("empty row remains ERROR", () => {
    const result = engine.validate(
      [
        baseDraft({
          trackingCode: null,
          addressRaw: null,
          issues: [
            {
              code: "empty_row",
              severity: "error",
              message: "empty row",
              rowIndex: 1,
            },
          ],
        }),
      ],
      actor,
    );
    expect(result.issues.some((i) => i.code === "empty_row")).toBe(true);
    expect(result.canCommit).toBe(false);
  });

  it("column mismatch short is ERROR", () => {
    const result = engine.validate(
      [
        baseDraft({
          columnMismatch: "short",
          issues: [
            {
              code: "column_count_mismatch",
              severity: "error",
              message: "short",
              rowIndex: 1,
              metadata: { expectedColumns: 3, actualColumns: 2 },
            },
          ],
        }),
      ],
      actor,
    );
    expect(result.canCommit).toBe(false);
  });

  it("same tracking same source → DUPLICATE_TRACKING_IN_BATCH", () => {
    const result = engine.validate(
      [
        baseDraft({ rowIndex: 1, trackingCode: "SAME" }),
        baseDraft({ rowIndex: 2, trackingCode: "SAME" }),
      ],
      actor,
    );
    expect(
      result.issues.some((i) => i.code === "duplicate_tracking_in_batch"),
    ).toBe(true);
    expect(result.canCommit).toBe(false);
    assertNoPii(result.issues);
  });

  it("same tracking different source → not duplicate", () => {
    const result = engine.validate(
      [
        baseDraft({
          rowIndex: 1,
          trackingCode: "SAME",
          sourceId: SRC_A.id,
        }),
        baseDraft({
          rowIndex: 2,
          trackingCode: "SAME",
          sourceId: SRC_B.id,
        }),
      ],
      {
        actorDriverId: "driver-1",
        actorCompanyIds: [SRC_A.companyId!, SRC_B.companyId!],
      },
    );
    expect(
      result.issues.some((i) => i.code === "duplicate_tracking_in_batch"),
    ).toBe(false);
    expect(result.canCommit).toBe(true);
  });

  it("same externalId same source → duplicate", () => {
    const result = engine.validate(
      [
        baseDraft({ rowIndex: 1, trackingCode: "T1", externalId: "EXT-1" }),
        baseDraft({ rowIndex: 2, trackingCode: "T2", externalId: "EXT-1" }),
      ],
      actor,
    );
    expect(
      result.issues.some((i) => i.code === "duplicate_external_id_in_batch"),
    ).toBe(true);
  });

  it("same externalId different source → not duplicate", () => {
    const result = engine.validate(
      [
        baseDraft({
          rowIndex: 1,
          trackingCode: "T1",
          externalId: "EXT-1",
          sourceId: SRC_A.id,
        }),
        baseDraft({
          rowIndex: 2,
          trackingCode: "T2",
          externalId: "EXT-1",
          sourceId: SRC_B.id,
        }),
      ],
      {
        actorDriverId: "driver-1",
        actorCompanyIds: [SRC_A.companyId!, SRC_B.companyId!],
      },
    );
    expect(
      result.issues.some((i) => i.code === "duplicate_external_id_in_batch"),
    ).toBe(false);
  });

  it("duplicate raw row → DUPLICATE_ROW_IN_BATCH warning (no auto-delete)", () => {
    const row = baseDraft({
      rowIndex: 1,
      trackingCode: "R1",
      addressRaw: "Same Addr",
      addressNormalized: "Same Addr",
    });
    const result = engine.validate(
      [row, { ...row, rowIndex: 2, issues: [] }],
      actor,
    );
    expect(
      result.issues.some((i) => i.code === "duplicate_row_in_batch"),
    ).toBe(true);
    // Also tracking duplicate since same source + tracking
    expect(result.drafts).toHaveLength(2);
    assertNoPii(result.issues);
  });

  it("unresolved source namespace → error, no false global tracking duplicate", () => {
    const emptyResolver = new ImportValidationEngine(
      new FakeImportContextResolver([]),
    );
    const result = emptyResolver.validate(
      [
        baseDraft({
          rowIndex: 1,
          trackingCode: "SAME",
          sourceId: "99999999-9999-4999-8999-999999999999",
        }),
        baseDraft({
          rowIndex: 2,
          trackingCode: "SAME",
          sourceId: "99999999-9999-4999-8999-999999999999",
        }),
      ],
      { actorDriverId: "driver-1", actorCompanyIds: [] },
    );
    expect(
      result.issues.some((i) => i.code === "source_not_found"),
    ).toBe(true);
    expect(
      result.issues.some((i) => i.code === "duplicate_tracking_in_batch"),
    ).toBe(false);
    expect(result.canCommit).toBe(false);
  });

  it("company/source mismatch", () => {
    const result = engine.validate(
      [
        baseDraft({
          companyId: SRC_B.companyId,
          sourceId: SRC_A.id,
        }),
      ],
      {
        actorDriverId: "driver-1",
        actorCompanyIds: [SRC_A.companyId!, SRC_B.companyId!],
      },
    );
    expect(
      result.issues.some((i) => i.code === "company_source_mismatch"),
    ).toBe(true);
    expect(result.canCommit).toBe(false);
  });

  it("unauthorized source (company not in actor list)", () => {
    const result = engine.validate([baseDraft({})], {
      actorDriverId: "driver-1",
      actorCompanyIds: [SRC_B.companyId!],
      batchSourceId: SRC_A.id,
    });
    expect(
      result.issues.some((i) => i.code === "source_not_allowed"),
    ).toBe(true);
  });

  it("source type not importable for CSV", () => {
    const result = engine.validate([baseDraft({})], {
      actorDriverId: "driver-1",
      actorCompanyIds: [SRC_A.companyId!],
      batchSourceId: SRC_API.id,
    });
    expect(
      result.issues.some((i) => i.code === "source_type_not_importable"),
    ).toBe(true);
  });

  it("personal source owner mismatch", () => {
    const result = engine.validate(
      [baseDraft({ sourceId: SRC_PERSONAL.id })],
      {
        actorDriverId: "other-driver",
        actorCompanyIds: [],
      },
      { importFormat: "manual" },
    );
    expect(
      result.issues.some((i) => i.code === "personal_source_owner_mismatch"),
    ).toBe(true);
  });

  it("warning-only batch canCommit", () => {
    const result = engine.validate(
      [
        baseDraft({
          quantityOrigin: "defaulted",
          issues: [
            {
              code: "default_quantity_applied",
              severity: "warning",
              message: "defaulted",
              field: "quantity",
            },
          ],
        }),
      ],
      actor,
    );
    expect(result.canCommit).toBe(true);
    expect(result.errorRows).toBe(0);
    expect(result.warningRows).toBe(1);
  });

  it("error batch cannotCommit", () => {
    const result = engine.validate(
      [baseDraft({ trackingCode: null })],
      actor,
    );
    expect(result.canCommit).toBe(false);
  });

  it("invalid service date", () => {
    const result = engine.validate(
      [baseDraft({ serviceDate: "2026-13-40" })],
      actor,
    );
    expect(
      result.issues.some((i) => i.code === "invalid_service_date"),
    ).toBe(true);
  });

  it("mixed 300-row batch reports partial validity", () => {
    const drafts: NormalizedDeliveryDraft[] = [];
    for (let i = 0; i < 300; i += 1) {
      if (i < 15) {
        drafts.push(
          baseDraft({
            rowIndex: i + 1,
            trackingCode: null,
            addressRaw: `Addr-${i}`,
          }),
        );
      } else {
        drafts.push(
          baseDraft({
            rowIndex: i + 1,
            trackingCode: `OK-${i}`,
            addressRaw: `Addr-${i}`,
          }),
        );
      }
    }
    const result = engine.validate(drafts, actor);
    expect(result.totalRows).toBe(300);
    expect(result.errorRows).toBe(15);
    expect(result.validRows + result.warningRows).toBe(285);
    expect(result.canCommit).toBe(false);
    expect(result.rowStatuses.filter((s) => s === "error")).toHaveLength(15);
  });

  it("1000-row validation smoke", () => {
    const drafts = Array.from({ length: IMPORT_SMOKE_ROW_TARGET }, (_, i) =>
      baseDraft({
        rowIndex: i + 1,
        trackingCode: `SMK-${i}`,
        addressRaw: `Addr-${i}`,
      }),
    );
    const started = Date.now();
    const result = engine.validate(drafts, actor);
    const elapsed = Date.now() - started;
    expect(result.totalRows).toBe(IMPORT_SMOKE_ROW_TARGET);
    expect(result.canCommit).toBe(true);
    expect(elapsed).toBeLessThan(5000);
  });

  it("no PII in issues metadata", () => {
    const result = engine.validate(
      [
        baseDraft({
          rowIndex: 1,
          trackingCode: "TRACK-SECRET",
          customerName: "고객홍길동",
          addressRaw: "Seoul Gangnam Secret",
          deliveryMemo: "memo-private",
        }),
        baseDraft({
          rowIndex: 2,
          trackingCode: "TRACK-SECRET",
          customerName: "고객홍길동",
          addressRaw: "Seoul Gangnam Secret",
          deliveryMemo: "memo-private",
        }),
      ],
      actor,
    );
    assertNoPii(result.issues);
  });

  it("formula warning preserves original value on draft", () => {
    const result = engine.validate(
      [
        baseDraft({
          addressRaw: "=1+1",
          issues: [
            {
              code: "formula_injection_risk",
              severity: "warning",
              message: "formula risk",
              field: "address",
              rowIndex: 1,
            },
          ],
        }),
      ],
      actor,
    );
    expect(result.drafts[0].addressRaw).toBe("=1+1");
    expect(result.canCommit).toBe(true);
    assertNoPii(result.issues);
  });

  it("source_required when no batch/row source", () => {
    const result = engine.validate(
      [baseDraft({ sourceId: null, sourceKey: null })],
      { actorDriverId: "driver-1", actorCompanyIds: [SRC_A.companyId!] },
    );
    expect(result.issues.some((i) => i.code === "source_required")).toBe(
      true,
    );
    expect(result.canCommit).toBe(false);
  });
});

describe("C2 pipeline with CSV normalize", () => {
  const parser = new CsvParseAdapter();
  const normalize = new ImportNormalizeService(parser);
  const resolver = new FakeImportContextResolver([SRC_A]);
  const engine = new ImportValidationEngine(resolver);

  it("malformed parser error remains parser error (not validation)", async () => {
    const csv = 'tracking_code,address\n"T-BAD,Addr\n';
    await expect(normalize.parseAndNormalizeCsv(csv)).rejects.toMatchObject({
      code: expect.stringMatching(/CSV|PARSE|MALFORMED/i),
    });
  });

  it("end-to-end: normalize then validate", async () => {
    const csv =
      "tracking_code,address,quantity\n" +
      "T-OK,Seoul Mapo,2\n" +
      "T-OK,Seoul Mapo,2\n";
    const { drafts } = await normalize.parseAndNormalizeCsv(csv);
    const result = engine.validate(drafts, {
      actorDriverId: "driver-1",
      actorCompanyIds: [SRC_A.companyId!],
      batchSourceId: SRC_A.id,
    });
    expect(result.totalRows).toBe(2);
    expect(
      result.issues.some((i) => i.code === "duplicate_tracking_in_batch"),
    ).toBe(true);
    assertNoPii(result.issues);
  });

  it("whitespace-only / separator row surfaces empty_row", async () => {
    const csv = "tracking_code,address\n,\n";
    const { drafts } = await normalize.parseAndNormalizeCsv(csv);
    expect(drafts[0].issues.some((i) => i.code === "empty_row")).toBe(true);
    const result = engine.validate(drafts, {
      actorDriverId: "driver-1",
      actorCompanyIds: [SRC_A.companyId!],
      batchSourceId: SRC_A.id,
    });
    expect(result.canCommit).toBe(false);
  });
});
