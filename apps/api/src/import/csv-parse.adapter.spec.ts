import { CsvParseAdapter } from "./csv-parse.adapter";
import { ImportDomainError } from "./import.errors";
import { ImportNormalizeService } from "./import-normalize.service";
import { IMPORT_SMOKE_ROW_TARGET } from "./import.limits";

describe("CsvParseAdapter + ImportNormalizeService (C1)", () => {
  const parser = new CsvParseAdapter();
  const service = new ImportNormalizeService(parser);

  async function collect(
    csv: string,
    options?: { maxRows?: number; maxBytes?: number },
  ) {
    return service.parseAndNormalizeCsv(csv, options);
  }

  it("parses normal CSV with English headers", async () => {
    const csv =
      "tracking_code,address,quantity\n" +
      "TRK-001,Seoul Gangnam,2\n";
    const { drafts } = await collect(csv);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].trackingCode).toBe("TRK-001");
    expect(drafts[0].addressRaw).toBe("Seoul Gangnam");
    expect(drafts[0].quantity).toBe(2);
    expect(drafts[0].geocodeStatus).toBe("pending");
    expect(drafts[0].latitude).toBeNull();
  });

  it("strips UTF-8 BOM", async () => {
    const csv = "\uFEFFtracking_code,address\nBOM-1,Address One\n";
    const { drafts } = await collect(csv);
    expect(drafts[0].trackingCode).toBe("BOM-1");
    expect(drafts[0].addressRaw).toBe("Address One");
  });

  it("maps Korean headers via aliases", async () => {
    const csv =
      "송장번호,배송주소,수량,고객명,상세주소\n" +
      "KR-99,서울시 중구 1,3,테스트고객,101호\n";
    const { drafts } = await collect(csv);
    expect(drafts[0].trackingCode).toBe("KR-99");
    expect(drafts[0].addressRaw).toBe("서울시 중구 1");
    expect(drafts[0].quantity).toBe(3);
    expect(drafts[0].customerName).toBe("테스트고객");
    expect(drafts[0].detailAddress).toBe("101호");
  });

  it("handles quoted commas", async () => {
    const csv =
      'tracking_code,address\n"T-1","Seoul, Gangnam-gu, 100"\n';
    const { drafts } = await collect(csv);
    expect(drafts[0].addressRaw).toBe("Seoul, Gangnam-gu, 100");
  });

  it("handles quoted newlines inside fields", async () => {
    const csv =
      'tracking_code,address\n"T-NL","Line1\nLine2"\n';
    const { drafts } = await collect(csv);
    expect(drafts[0].addressRaw).toContain("Line1");
    expect(drafts[0].addressRaw).toContain("Line2");
  });

  it("treats empty cells as null after normalize", async () => {
    const csv =
      "tracking_code,address,customer_name,quantity\n" +
      "T-E,Addr,,\n";
    const { drafts } = await collect(csv);
    expect(drafts[0].customerName).toBeNull();
    expect(drafts[0].quantity).toBe(1);
    expect(drafts[0].quantityOrigin).toBe("defaulted");
    expect(
      drafts[0].issues.some((i) => i.code === "default_quantity_applied"),
    ).toBe(true);
  });

  it("marks explicit quantity=1 as explicit origin", async () => {
    const csv =
      "tracking_code,address,quantity\nT-Q1,Addr,1\n";
    const { drafts } = await collect(csv);
    expect(drafts[0].quantity).toBe(1);
    expect(drafts[0].quantityOrigin).toBe("explicit");
    expect(
      drafts[0].issues.some((i) => i.code === "default_quantity_applied"),
    ).toBe(false);
  });

  it("index-aligns short rows without field shift (ERROR mismatch)", async () => {
    // Header: tracking, address, quantity — row missing quantity only.
    const csv =
      "tracking_code,address,quantity\n" +
      "T-SHORT,Seoul Only\n";
    const { rows, drafts } = await collect(csv);
    expect(rows[0].columnMismatch).toBe("short");
    expect(rows[0].expectedColumnCount).toBe(3);
    expect(rows[0].actualColumnCount).toBe(2);
    // Named columns stay index-aligned — address must not absorb quantity slot.
    expect(drafts[0].trackingCode).toBe("T-SHORT");
    expect(drafts[0].addressRaw).toBe("Seoul Only");
    expect(drafts[0].quantityOrigin).toBe("defaulted");
    expect(
      drafts[0].issues.some((i) => i.code === "column_count_mismatch"),
    ).toBe(true);
    expect(
      drafts[0].issues.find((i) => i.code === "column_count_mismatch")
        ?.severity,
    ).toBe("error");
  });

  it("preserves long-row extras as __extra_N with WARNING mismatch", async () => {
    const csv =
      "tracking_code,address\n" +
      "T-LONG,Addr,EXTRA1,EXTRA2\n";
    const { rows, drafts } = await collect(csv);
    expect(rows[0].columnMismatch).toBe("long");
    expect(rows[0].raw.__extra_0).toBe("EXTRA1");
    expect(rows[0].raw.__extra_1).toBe("EXTRA2");
    expect(drafts[0].trackingCode).toBe("T-LONG");
    expect(drafts[0].addressRaw).toBe("Addr");
    const mismatch = drafts[0].issues.find(
      (i) => i.code === "column_count_mismatch",
    );
    expect(mismatch?.severity).toBe("warning");
  });

  it("does not silently shift fields when middle value missing via short row", async () => {
    // If we had object-mode pad wrongly, address could become quantity.
    const csv =
      "tracking_code,address,quantity\n" +
      "T-MID,OnlyTwoCols\n";
    const { drafts } = await collect(csv);
    expect(drafts[0].addressRaw).toBe("OnlyTwoCols");
    expect(drafts[0].quantity).toBe(1);
    expect(drafts[0].quantityOrigin).toBe("defaulted");
  });

  it("accepts CRLF line endings", async () => {
    const csv = "tracking_code,address\r\nT-CRLF,Addr CRLF\r\n";
    const { drafts } = await collect(csv);
    expect(drafts[0].trackingCode).toBe("T-CRLF");
  });

  it("surfaces missing required fields as draft issues (not crash)", async () => {
    const csv = "quantity\n2\n";
    const { drafts } = await collect(csv);
    expect(drafts).toHaveLength(1);
    const codes = drafts[0].issues.map((i) => i.code);
    expect(codes).toContain("missing_required_field");
  });

  it("warns on unknown headers without dropping raw row", async () => {
    const csv =
      "tracking_code,address,weird_col\nT-U,Addr,keep\n";
    const { rows, drafts } = await collect(csv);
    expect(rows[0].raw.weird_col).toBe("keep");
    expect(drafts[0].issues.some((i) => i.severity === "warning")).toBe(true);
  });

  it("normalizes whitespace and tracking identifiers", async () => {
    const csv =
      "tracking_code,address\n" +
      "  TRK  001  ,  Seoul   City  \n";
    const { drafts } = await collect(csv);
    expect(drafts[0].trackingCode).toBe("TRK001");
    expect(drafts[0].addressNormalized).toBe("Seoul City");
  });

  it("rejects invalid quantity with field-safe issue", async () => {
    const csv =
      "tracking_code,address,quantity\nT-Q,Addr,abc\n";
    const { drafts } = await collect(csv);
    const issue = drafts[0].issues.find((i) => i.code === "invalid_quantity");
    expect(issue?.field).toBe("quantity");
    expect(JSON.stringify(issue)).not.toMatch(/abc/i);
  });

  it("keeps duplicate-looking tracking codes (source-scoped later)", async () => {
    const csv =
      "tracking_code,address,source_id\n" +
      "SAME,Addr A,src-a\n" +
      "SAME,Addr B,src-b\n";
    const { drafts } = await collect(csv);
    expect(drafts).toHaveLength(2);
    expect(drafts[0].trackingCode).toBe("SAME");
    expect(drafts[1].trackingCode).toBe("SAME");
    expect(drafts[0].sourceId).toBe("src-a");
    expect(drafts[1].sourceId).toBe("src-b");
  });

  it("flags formula-like cells as warning without stripping", async () => {
    const csv =
      'tracking_code,address\nT-F,"=1+1"\n';
    const { drafts } = await collect(csv);
    expect(drafts[0].addressRaw).toBe("=1+1");
    const issue = drafts[0].issues.find(
      (i) => i.code === "formula_injection_risk",
    );
    expect(issue?.severity).toBe("warning");
    expect(issue?.field).toBe("address");
    expect(JSON.stringify(issue)).not.toContain("=1+1");
  });

  it("enforces row limit with safe error meta", async () => {
    const body = Array.from(
      { length: 5 },
      (_, i) => `T-${i},Addr ${i}`,
    ).join("\n");
    const csv = `tracking_code,address\n${body}\n`;
    await expect(collect(csv, { maxRows: 3 })).rejects.toBeInstanceOf(
      ImportDomainError,
    );
    try {
      await collect(csv, { maxRows: 3 });
    } catch (e) {
      const err = e as ImportDomainError;
      expect(err.code).toBe("ROW_LIMIT_EXCEEDED");
      const meta = JSON.stringify(err.toLogMeta());
      expect(meta).not.toMatch(/Addr/);
      expect(meta).not.toMatch(/T-/);
    }
  });

  it("enforces byte limit", async () => {
    const csv = "tracking_code,address\n" + "X".repeat(100) + ",Y\n";
    await expect(collect(csv, { maxBytes: 20 })).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });
  });

  it("1000-row smoke within hard safety limit", async () => {
    const lines = ["tracking_code,address,quantity"];
    for (let i = 0; i < IMPORT_SMOKE_ROW_TARGET; i += 1) {
      lines.push(`SMK-${i},Synthetic Address ${i},1`);
    }
    const { drafts } = await collect(lines.join("\n"));
    expect(drafts).toHaveLength(IMPORT_SMOKE_ROW_TARGET);
    expect(drafts[999].trackingCode).toBe("SMK-999");
  });

  it("does not put sensitive values into ImportDomainError message", async () => {
    const big =
      "tracking_code,address\n" +
      Array.from({ length: 4 }, (_, i) => `SEC-${i},SecretAddr${i}`).join(
        "\n",
      ) +
      "\n";
    try {
      await collect(big, { maxRows: 2 });
      fail("expected error");
    } catch (e) {
      const err = e as ImportDomainError;
      expect(err.message).not.toMatch(/SecretAddr/);
      expect(err.message).not.toMatch(/SEC-/);
      expect(err.toLogMeta().code).toBe("ROW_LIMIT_EXCEEDED");
    }
  });

  it("malformed quoted CSV yields domain error without crashing process", async () => {
    // Unclosed quote — csv-parse should error; we wrap safely.
    const csv = 'tracking_code,address\n"T-BAD,Addr\n';
    await expect(collect(csv)).rejects.toBeInstanceOf(ImportDomainError);
  });
});
