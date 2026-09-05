import {
  parseServiceDateParam,
  serviceDateInSeoul,
  TodayWorksetService,
} from "./today-workset.service";
import type { AccessSecretsService } from "../access/access-secrets.service";
import type { SupabaseServiceClient } from "../supabase/supabase-service.client";

describe("TodayWorksetService helpers", () => {
  it("formats Seoul service date as YYYY-MM-DD", () => {
    const d = serviceDateInSeoul(new Date("2026-08-29T16:00:00.000Z"));
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects malformed date params", () => {
    expect(() => parseServiceDateParam("2026/08/30")).toThrow(
      "invalid_service_date",
    );
    expect(() => parseServiceDateParam("not-a-date")).toThrow(
      "invalid_service_date",
    );
  });

  it("accepts valid date and defaults when omitted", () => {
    expect(parseServiceDateParam("2026-08-30")).toBe("2026-08-30");
    expect(parseServiceDateParam(undefined)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("TodayWorksetService.getToday", () => {
  function mockDeps(opts?: {
    accessPointIds?: string[];
    companies?: Array<{ id: string; name: string }>;
  }) {
    const accessSecrets = {
      listPointIdsWithAccessInfo: jest.fn(async () => {
        return new Set(opts?.accessPointIds ?? []);
      }),
    } as unknown as AccessSecretsService;

    const serviceClient = {
      getOrNull: () => ({
        from: (table: string) => {
          if (table !== "companies") {
            return {
              select: () => ({
                in: async () => ({ data: [], error: null }),
              }),
            };
          }
          return {
            select: () => ({
              in: async (_col: string, ids: string[]) => ({
                data: (opts?.companies ?? []).filter((c) => ids.includes(c.id)),
                error: null,
              }),
            }),
          };
        },
      }),
    } as unknown as SupabaseServiceClient;

    return new TodayWorksetService(accessSecrets, serviceClient);
  }

  function mockClient(tables: {
    jobs?: unknown[];
    points?: unknown[];
    shipments?: unknown[];
    sources?: unknown[];
    pii?: unknown[];
  }) {
    return {
      from: (table: string) => {
        const rows =
          table === "delivery_jobs"
            ? (tables.jobs ?? [])
            : table === "delivery_points"
              ? (tables.points ?? [])
              : table === "delivery_shipments"
                ? (tables.shipments ?? [])
                : table === "delivery_sources"
                  ? (tables.sources ?? [])
                  : table === "delivery_point_pii"
                    ? (tables.pii ?? [])
                    : [];
        const state: {
          filters: Array<(r: Record<string, unknown>) => boolean>;
        } = { filters: [] };

        const resolve = () => {
          const data = (rows as Record<string, unknown>[]).filter((r) =>
            state.filters.every((f) => f(r)),
          );
          return { data, error: null };
        };

        const api: Record<string, unknown> = {
          select: () => api,
          eq: (col: string, val: unknown) => {
            state.filters.push((r) => r[col] === val);
            return api;
          },
          in: (col: string, vals: unknown[]) => {
            state.filters.push((r) => vals.includes(r[col]));
            return api;
          },
          order: () => api,
          then: (
            onFulfilled: (v: { data: unknown; error: null }) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) => Promise.resolve(resolve()).then(onFulfilled, onRejected),
        };
        return api;
      },
    } as never;
  }

  const driverA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const driverB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const companyA = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const companyB = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const sourceA = "11111111-1111-1111-1111-111111111111";
  const sourceB = "22222222-2222-2222-2222-222222222222";
  const jobA = "33333333-3333-3333-3333-333333333333";
  const jobB = "44444444-4444-4444-4444-444444444444";
  const jobManual = "55555555-5555-5555-5555-555555555555";
  const pointA = "66666666-6666-6666-6666-666666666666";
  const pointB = "77777777-7777-7777-7777-777777777777";
  const pointM = "88888888-8888-8888-8888-888888888888";
  const pointForeign = "99999999-9999-9999-9999-999999999999";

  function baseTables() {
    return {
      jobs: [
        {
          id: jobA,
          driver_id: driverA,
          company_id: companyA,
          source_id: sourceA,
          status: "active",
          service_date: "2026-08-30",
        },
        {
          id: jobB,
          driver_id: driverA,
          company_id: companyB,
          source_id: sourceB,
          status: "active",
          service_date: "2026-08-30",
        },
        {
          id: jobManual,
          driver_id: driverA,
          company_id: null,
          source_id: null,
          status: "active",
          service_date: "2026-08-30",
        },
        {
          id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
          driver_id: driverB,
          company_id: companyA,
          source_id: sourceA,
          status: "active",
          service_date: "2026-08-30",
        },
      ],
      points: [
        {
          id: pointA,
          job_id: jobA,
          driver_id: driverA,
          display_label: "A",
          quantity: 1,
          status: "pending",
          location: { type: "Point", coordinates: [127.0, 37.5] },
          pin_accuracy: "address",
          pii_masked_at: null,
        },
        {
          id: pointB,
          job_id: jobB,
          driver_id: driverA,
          display_label: "B",
          quantity: 2,
          status: "completed",
          location: null,
          pin_accuracy: "address",
          pii_masked_at: "2026-08-30T00:00:00Z",
        },
        {
          id: pointM,
          job_id: jobManual,
          driver_id: driverA,
          display_label: "M",
          quantity: 1,
          status: "pending",
          location: null,
          pin_accuracy: "address",
          pii_masked_at: null,
        },
        {
          id: pointForeign,
          job_id: jobA,
          driver_id: driverB,
          display_label: "X",
          quantity: 1,
          status: "pending",
          location: null,
          pin_accuracy: "address",
          pii_masked_at: null,
        },
      ],
      shipments: [
        {
          id: "s1",
          point_id: pointA,
          job_id: jobA,
          driver_id: driverA,
          source_id: sourceA,
          external_id: "ext-a",
          sequence_no: 1,
          tracking_code: "TRK-A",
          status: "pending",
        },
        {
          id: "s-foreign",
          point_id: pointForeign,
          job_id: jobA,
          driver_id: driverB,
          source_id: sourceA,
          external_id: null,
          sequence_no: 1,
          tracking_code: "TRK-X",
          status: "pending",
        },
      ],
      sources: [
        {
          id: sourceA,
          company_id: companyA,
          owner_driver_id: null,
          source_type: "company_api",
          source_key: "api",
          display_name: "SameName",
          external_system: null,
          is_active: true,
        },
        {
          id: sourceB,
          company_id: companyB,
          owner_driver_id: null,
          source_type: "excel_import",
          source_key: "excel",
          display_name: "SameName",
          external_system: null,
          is_active: true,
        },
      ],
      pii: [
        {
          point_id: pointA,
          contact_type: "masked_number",
          contact_value: "01012345678",
          contact_purged_at: null,
        },
        {
          point_id: pointB,
          contact_type: "masked_number",
          contact_value: "01099999999",
          contact_purged_at: null,
        },
      ],
    };
  }

  it("aggregates multi company/source and excludes foreign driver rows", async () => {
    const service = mockDeps({
      accessPointIds: [pointA],
      companies: [
        { id: companyA, name: "Alpha Co" },
        { id: companyB, name: "Beta Co" },
        { id: "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz", name: "Other Dir" },
      ],
    });
    const result = await service.getToday(mockClient(baseTables()), {
      driverId: driverA,
      serviceDate: "2026-08-30",
    });

    expect(result.jobs).toHaveLength(3);
    expect(result.points).toHaveLength(3);
    expect(result.points.every((p) => p.pointId !== pointForeign)).toBe(true);
    expect(result.shipments).toHaveLength(1);

    expect(result.companies).toEqual([
      { id: companyA, displayName: "Alpha Co" },
      { id: companyB, displayName: "Beta Co" },
    ]);
    expect(result.companies.map((c) => c.id)).not.toContain(
      "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
    );

    const sameNameSources = result.sources.filter(
      (s) => s.displayName === "SameName",
    );
    expect(sameNameSources).toHaveLength(2);
    expect(new Set(sameNameSources.map((s) => s.id)).size).toBe(2);

    const ptA = result.points.find((p) => p.pointId === pointA)!;
    const ptB = result.points.find((p) => p.pointId === pointB)!;
    const ptM = result.points.find((p) => p.pointId === pointM)!;
    expect(ptA.hasAccessInfo).toBe(true);
    expect(ptA.contactAvailable).toBe(true);
    expect(ptA.shipmentCount).toBe(1);
    expect(ptB.hasAccessInfo).toBe(false); // completed
    expect(ptB.contactAvailable).toBe(false);
    expect(ptM.hasAccessInfo).toBe(false);
    expect(ptM.companyId).toBeNull();
    expect(ptA.latitude).toBe(37.5);
    expect(ptA.longitude).toBe(127.0);
    expect(ptM.latitude).toBeNull();
    expect(ptM.longitude).toBeNull();

    const blob = JSON.stringify(result);
    expect(blob).not.toMatch(
      /password|otp|access_secret|refresh_token|customer_name|raw_address|01012345678|ciphertext/i,
    );
    expect(result.points[0]).not.toHaveProperty("customerName");
    expect(result.points[0]).not.toHaveProperty("accessInfo");
    expect(result.points[0]).not.toHaveProperty("contactValue");
  });

  it("same displayName different company IDs stay distinct", async () => {
    const service = mockDeps({
      companies: [
        { id: companyA, name: "Twin" },
        { id: companyB, name: "Twin" },
      ],
    });
    const result = await service.getToday(mockClient(baseTables()), {
      driverId: driverA,
      serviceDate: "2026-08-30",
    });
    expect(result.companies).toHaveLength(2);
    expect(result.companies.every((c) => c.displayName === "Twin")).toBe(true);
    expect(new Set(result.companies.map((c) => c.id)).size).toBe(2);
  });

  it("returns stored location for a manual point", async () => {
    const tables = baseTables();
    const manual = tables.points.find((p) => p.id === pointM);
    expect(manual).toBeDefined();
    manual!.location = { type: "Point", coordinates: [126.74, 37.42] };
    const service = mockDeps({ accessPointIds: [] });
    const result = await service.getToday(mockClient(tables), {
      driverId: driverA,
      serviceDate: "2026-08-30",
    });
    const ptM = result.points.find((p) => p.pointId === pointM)!;
    expect(ptM.latitude).toBe(37.42);
    expect(ptM.longitude).toBe(126.74);
  });

  it("hasAccessInfo false when secret absent", async () => {
    const service = mockDeps({ accessPointIds: [] });
    const result = await service.getToday(mockClient(baseTables()), {
      driverId: driverA,
      serviceDate: "2026-08-30",
    });
    expect(result.points.every((p) => p.hasAccessInfo === false)).toBe(true);
  });
});
