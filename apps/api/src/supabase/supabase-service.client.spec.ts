import { ConfigService } from "@nestjs/config";
import { SupabaseServiceClient } from "./supabase-service.client";

describe("SupabaseServiceClient eager-init audit", () => {
  it("missing service-role config → client stays null (normal API boot path)", () => {
    const config = {
      get: (key: string) => {
        if (key === "SUPABASE_URL") return "https://example.supabase.co";
        if (key === "SUPABASE_SERVICE_ROLE_KEY") return undefined;
        return undefined;
      },
    } as unknown as ConfigService;

    const client = new SupabaseServiceClient(config);
    client.onModuleInit();
    expect(client.getOrNull()).toBeNull();
  });

  it("missing URL → client stays null", () => {
    const config = {
      get: (key: string) => {
        if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-role-key";
        return undefined;
      },
    } as unknown as ConfigService;

    const client = new SupabaseServiceClient(config);
    expect(client.getOrNull()).toBeNull();
  });

  it("quoted/padded service-role env still initializes a client", () => {
    const config = {
      get: (key: string) => {
        if (key === "SUPABASE_URL") return '  "https://example.supabase.co"  ';
        if (key === "SUPABASE_SERVICE_ROLE_KEY") return '  "test-role-key-not-real"  ';
        return undefined;
      },
    } as unknown as ConfigService;

    const client = new SupabaseServiceClient(config);
    expect(client.getOrNull()).not.toBeNull();
  });

  it("both URL and service-role present → client object created without network I/O", () => {
    const config = {
      get: (key: string) => {
        if (key === "SUPABASE_URL") return "https://example.supabase.co";
        if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-role-key-not-real";
        return undefined;
      },
    } as unknown as ConfigService;

    const client = new SupabaseServiceClient(config);
    // createClient is local object construction — no fetch invoked here.
    expect(client.getOrNull()).not.toBeNull();
  });
});
