import type { SupabaseClient } from "@supabase/supabase-js";
import { DeliverySourceRepository } from "./delivery-source.repository";
import { SupabaseImportContextAuthority } from "./supabase-import-context.authority";

describe("SupabaseImportContextAuthority", () => {
  const userClient = {} as SupabaseClient;

  it("resolves batch source from DB row via user JWT client", async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({
        id: "src-1",
        companyId: "co-1",
        ownerDriverId: null,
        sourceType: "csv_import",
        sourceKey: "k",
        isActive: true,
      }),
    } as unknown as DeliverySourceRepository;

    const authority = new SupabaseImportContextAuthority(repo);
    const result = await authority.resolve(userClient, {
      batchSourceId: "src-1",
      actorCompanyIds: ["co-1"],
      importFormat: "csv",
    });

    expect(result.status).toBe("resolved");
    expect(repo.findById).toHaveBeenCalledWith(userClient, "src-1");
  });

  it("returns source_not_found when RLS hides row", async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as DeliverySourceRepository;

    const authority = new SupabaseImportContextAuthority(repo);
    const result = await authority.resolve(userClient, {
      batchSourceId: "missing",
      actorCompanyIds: ["co-1"],
      importFormat: "csv",
    });

    expect(result.status).toBe("source_not_found");
  });
});
