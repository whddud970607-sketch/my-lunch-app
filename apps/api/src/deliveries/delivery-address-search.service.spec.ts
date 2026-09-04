import { DeliveryAddressSearchService } from "./delivery-address-search.service";
import {
  addressSearchHaystackMatches,
  normalizeAddressSearchQuery,
} from "./delivery-address-search.service";

describe("DeliveryAddressSearchService", () => {
  const driverA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const driverB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const jobA = "33333333-3333-3333-3333-333333333333";
  const jobB = "44444444-4444-4444-4444-444444444444";
  const jobDraft = "55555555-5555-5555-5555-555555555555";
  const jobOther = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const pointA = "66666666-6666-6666-6666-666666666666";
  const pointB = "77777777-7777-7777-7777-777777777777";
  const pointDone = "88888888-8888-8888-8888-888888888888";
  const pointForeign = "99999999-9999-9999-9999-999999999999";
  const pointUnassigned = "aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa";

  function mockClient(tables: {
    jobs?: unknown[];
    points?: unknown[];
    pii?: unknown[];
  }) {
    return {
      from: (table: string) => {
        const rows =
          table === "delivery_jobs"
            ? (tables.jobs ?? [])
            : table === "delivery_points"
              ? (tables.points ?? [])
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

  function tables() {
    return {
      jobs: [
        {
          id: jobA,
          driver_id: driverA,
          status: "active",
          service_date: "2026-09-04",
        },
        {
          id: jobB,
          driver_id: driverA,
          status: "active",
          service_date: "2026-09-04",
        },
        {
          id: jobDraft,
          driver_id: driverA,
          status: "draft",
          service_date: "2026-09-04",
        },
        {
          id: jobOther,
          driver_id: driverB,
          status: "active",
          service_date: "2026-09-04",
        },
      ],
      points: [
        {
          id: pointA,
          job_id: jobA,
          driver_id: driverA,
          display_label: "테스트표시",
          status: "pending",
          pii_masked_at: null,
          sequence_no: 1,
        },
        {
          id: pointB,
          job_id: jobB,
          driver_id: driverA,
          display_label: "배송지",
          status: "pending",
          pii_masked_at: null,
          sequence_no: 1,
        },
        {
          id: pointDone,
          job_id: jobA,
          driver_id: driverA,
          display_label: "완료표시",
          status: "completed",
          pii_masked_at: "2026-09-04T00:00:00Z",
          sequence_no: 2,
        },
        {
          id: pointForeign,
          job_id: jobOther,
          driver_id: driverB,
          display_label: "타인표시",
          status: "pending",
          pii_masked_at: null,
          sequence_no: 1,
        },
        {
          id: pointUnassigned,
          job_id: jobA,
          driver_id: driverB,
          display_label: "미배정",
          status: "pending",
          pii_masked_at: null,
          sequence_no: 3,
        },
      ],
      pii: [
        {
          point_id: pointA,
          raw_address: "인천광역시 남동구 서창남순환로 55",
          normalized_address: "인천광역시 남동구 서창남순환로 55",
          detail_address: "504동 2003호",
          customer_name: "SECRET_NAME",
          contact_value: "01012345678",
        },
        {
          point_id: pointB,
          raw_address: "인천광역시 남동구 테스트로 10",
          normalized_address: "인천광역시 남동구 테스트로 10",
          detail_address: "101동",
          customer_name: "OTHER_NAME",
          contact_value: "01099999999",
        },
        {
          point_id: pointDone,
          raw_address: "인천광역시 남동구 서창남순환로 55",
          normalized_address: "인천광역시 남동구 서창남순환로 55",
          detail_address: null,
          customer_name: "DONE_NAME",
          contact_value: "01000000000",
        },
        {
          point_id: pointForeign,
          raw_address: "인천광역시 남동구 서창남순환로 55",
          normalized_address: "인천광역시 남동구 서창남순환로 55",
          detail_address: null,
          customer_name: "FOREIGN_NAME",
          contact_value: "01088888888",
        },
        {
          point_id: pointUnassigned,
          raw_address: "인천광역시 남동구 서창남순환로 55",
          normalized_address: "인천광역시 남동구 서창남순환로 55",
          detail_address: null,
          customer_name: "UNASSIGNED_NAME",
          contact_value: "01077777777",
        },
      ],
    };
  }

  it("ADDRESS_SEARCH_WHITESPACE_NORMALIZATION and Korean substring", () => {
    expect(normalizeAddressSearchQuery("  서창  남순환로  ")).toBe(
      "서창 남순환로",
    );
    expect(
      addressSearchHaystackMatches(
        ["인천광역시 남동구 서창남순환로 55"],
        "서창남순환로",
      ),
    ).toBe(true);
  });

  it("ADDRESS_SEARCH_EMPTY_QUERY does not enumerate", async () => {
    const service = new DeliveryAddressSearchService();
    const result = await service.searchToday(mockClient(tables()), {
      driverId: driverA,
      serviceDate: "2026-09-04",
      query: "   ",
    });
    expect(result.results).toEqual([]);
  });

  it("ADDRESS_SEARCH_DISPLAY_LABEL", async () => {
    const service = new DeliveryAddressSearchService();
    const result = await service.searchToday(mockClient(tables()), {
      driverId: driverA,
      serviceDate: "2026-09-04",
      query: "테스트표시",
    });
    expect(result.results.map((r) => r.pointId)).toEqual([pointA]);
  });

  it("ADDRESS_SEARCH_RAW_ADDRESS_AUTHORIZED", async () => {
    const service = new DeliveryAddressSearchService();
    const result = await service.searchToday(mockClient(tables()), {
      driverId: driverA,
      serviceDate: "2026-09-04",
      query: "서창남순환로 55",
    });
    expect(result.results.map((r) => r.pointId)).toEqual([pointA]);
  });

  it("ADDRESS_SEARCH_DETAIL_ADDRESS_AUTHORIZED", async () => {
    const service = new DeliveryAddressSearchService();
    const result = await service.searchToday(mockClient(tables()), {
      driverId: driverA,
      serviceDate: "2026-09-04",
      query: "2003호",
    });
    expect(result.results.map((r) => r.pointId)).toEqual([pointA]);
  });

  it("ADDRESS_SEARCH_KOREAN_SUBSTRING", async () => {
    const service = new DeliveryAddressSearchService();
    const result = await service.searchToday(mockClient(tables()), {
      driverId: driverA,
      serviceDate: "2026-09-04",
      query: "테스트로",
    });
    expect(result.results.map((r) => r.pointId)).toEqual([pointB]);
  });

  it("ADDRESS_SEARCH_CURRENT_DRIVER_ONLY and CROSS_DRIVER denied", async () => {
    const service = new DeliveryAddressSearchService();
    const result = await service.searchToday(mockClient(tables()), {
      driverId: driverA,
      serviceDate: "2026-09-04",
      query: "서창남순환로",
    });
    const ids = result.results.map((r) => r.pointId);
    expect(ids).toContain(pointA);
    expect(ids).not.toContain(pointForeign);
    expect(ids).not.toContain(pointUnassigned);
  });

  it("ADDRESS_SEARCH_CROSS_COMPANY denied (other-driver job)", async () => {
    const service = new DeliveryAddressSearchService();
    const result = await service.searchToday(mockClient(tables()), {
      driverId: driverA,
      serviceDate: "2026-09-04",
      query: "서창남순환로",
    });
    const ids = result.results.map((r) => r.pointId);
    expect(ids).not.toContain(pointForeign);
    const asB = await service.searchToday(mockClient(tables()), {
      driverId: driverB,
      serviceDate: "2026-09-04",
      query: "서창남순환로",
    });
    expect(asB.results.map((r) => r.pointId)).toEqual([pointForeign]);
    expect(asB.results.map((r) => r.pointId)).not.toContain(pointA);
  });

  it("ADDRESS_SEARCH_UNASSIGNED and completed excluded", async () => {
    const service = new DeliveryAddressSearchService();
    const result = await service.searchToday(mockClient(tables()), {
      driverId: driverA,
      serviceDate: "2026-09-04",
      query: "서창남순환로",
    });
    const ids = result.results.map((r) => r.pointId);
    expect(ids).not.toContain(pointDone);
    expect(ids).not.toContain(pointUnassigned);
  });

  it("ADDRESS_SEARCH_NO_PHONE NO_ACCESS_SECRET NO_INTERNAL_ID_LEAK", async () => {
    const service = new DeliveryAddressSearchService();
    const result = await service.searchToday(mockClient(tables()), {
      driverId: driverA,
      serviceDate: "2026-09-04",
      query: "테스트표시",
    });
    expect(result.results).toHaveLength(1);
    const hit = result.results[0];
    expect(Object.keys(hit).sort()).toEqual([
      "addressSnippet",
      "displayLabel",
      "pointId",
      "status",
    ]);
    const blob = JSON.stringify(result);
    expect(blob).not.toMatch(/010|SECRET_NAME|access_secret|customerName|driverId|jobId/i);
    expect(hit).not.toHaveProperty("customerName");
    expect(hit).not.toHaveProperty("contactValue");
    expect(hit).not.toHaveProperty("driverId");
  });

  it("ADDRESS_SEARCH_ZERO_RESULT", async () => {
    const service = new DeliveryAddressSearchService();
    const result = await service.searchToday(mockClient(tables()), {
      driverId: driverA,
      serviceDate: "2026-09-04",
      query: "없는주소XYZ",
    });
    expect(result.results).toEqual([]);
  });
});
