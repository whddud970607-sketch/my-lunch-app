import { evaluateImportContextResolution } from "./import-context.evaluator";
import type { ResolvedImportSource } from "./import-context.port";

const COMPANY_SOURCE: ResolvedImportSource = {
  id: "src-1",
  companyId: "co-1",
  ownerDriverId: null,
  sourceType: "csv_import",
  sourceKey: "csv-key",
  isActive: true,
};

describe("evaluateImportContextResolution", () => {
  it("rejects fixture and unknown system sources", () => {
    for (const sourceType of ["fixture", "unknown"] as const) {
      const result = evaluateImportContextResolution(
        { ...COMPANY_SOURCE, sourceType },
        {
          batchSourceId: "src-1",
          actorCompanyIds: ["co-1"],
          importFormat: "csv",
        },
      );
      expect(result.status).toBe("source_not_allowed");
    }
  });

  it("rejects cross-tenant company source", () => {
    const result = evaluateImportContextResolution(COMPANY_SOURCE, {
      batchSourceId: "src-1",
      actorCompanyIds: ["other-co"],
      importFormat: "csv",
    });
    expect(result.status).toBe("source_not_allowed");
  });

  it("rejects personal source owner mismatch", () => {
    const result = evaluateImportContextResolution(
      {
        ...COMPANY_SOURCE,
        companyId: null,
        ownerDriverId: "driver-a",
        sourceType: "driver_manual",
      },
      {
        batchSourceId: "src-1",
        actorDriverId: "driver-b",
        importFormat: "manual",
      },
    );
    expect(result.status).toBe("personal_source_owner_mismatch");
  });
});
