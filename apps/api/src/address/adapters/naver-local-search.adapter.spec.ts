import { NaverLocalSearchAdapter } from "./naver-local-search.adapter";

const APT = "샘플아파트";

describe("NaverLocalSearchAdapter exact dong fixtures", () => {
  function adapterWithItems(items: unknown[]) {
    const fetchFn = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ items }),
    });
    return new NaverLocalSearchAdapter("id", "secret", fetchFn);
  }

  it("accepts OO아파트 503동 with WGS84 mapx/mapy / 1e7", async () => {
    const adapter = adapterWithItems([
      {
        title: `<b>${APT}</b> 503동`,
        address: "인천광역시 남동구 샘플동 1",
        roadAddress: "인천광역시 남동구 샘플로 1",
        mapx: "1267486148",
        mapy: "374282921",
      },
    ]);
    const hits = await adapter.lookupExactDongCandidates({
      buildingName: APT,
      dong: "503",
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].sourceType).toBe("naver_local_exact_dong");
    expect(hits[0].matchedDong).toBe("503동");
    expect(hits[0].latitude).toBeCloseTo(37.4282921, 5);
    expect(hits[0].longitude).toBeCloseTo(126.7486148, 5);
  });

  it("rejects 501동 / 1503동 / 503호 / other complex / office", async () => {
    const adapter = adapterWithItems([
      { title: `${APT} 501동`, mapx: "1267486148", mapy: "374282921" },
      { title: `${APT} 1503동`, mapx: "1267486148", mapy: "374282921" },
      { title: `${APT} 503호`, mapx: "1267486148", mapy: "374282921" },
      { title: `다른아파트 503동`, mapx: "1267486148", mapy: "374282921" },
      {
        title: `${APT} 관리사무소`,
        mapx: "1267486148",
        mapy: "374282921",
      },
    ]);
    const hits = await adapter.lookupExactDongCandidates({
      buildingName: APT,
      dong: "503동",
    });
    expect(hits).toEqual([]);
  });

  it("MISS when empty — does not invent exact dong", async () => {
    const adapter = adapterWithItems([]);
    await expect(
      adapter.lookupExactDongCandidates({
        buildingName: APT,
        dong: "503동",
      }),
    ).resolves.toEqual([]);
  });

  it("uses NAVER API HUB path and APIGW auth headers", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ items: [] }),
    });
    const adapter = new NaverLocalSearchAdapter("hub-id", "hub-secret", fetchFn);
    await adapter.lookupExactDongCandidates({
      buildingName: APT,
      dong: "503동",
    });
    expect(fetchFn).toHaveBeenCalled();
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain(
      "https://naverapihub.apigw.ntruss.com/search/v1/local",
    );
    expect(String(url)).not.toContain("openapi.naver.com");
    expect(init.method).toBe("GET");
    expect(init.headers["X-NCP-APIGW-API-KEY-ID"]).toBe("hub-id");
    expect(init.headers["X-NCP-APIGW-API-KEY"]).toBe("hub-secret");
    expect(init.headers["X-Naver-Client-Id"]).toBeUndefined();
    expect(init.headers["X-Naver-Client-Secret"]).toBeUndefined();
  });

  it("does not promote geocode-style base into exact (adapter returns none)", async () => {
    // Local Search adapter never emits naver_base_geocode.
    const adapter = adapterWithItems([
      {
        title: APT,
        mapx: "1267481369",
        mapy: "374296855",
      },
    ]);
    const hits = await adapter.lookupExactDongCandidates({
      buildingName: APT,
      dong: "503동",
    });
    expect(hits.every((h) => h.sourceType === "naver_local_exact_dong")).toBe(
      true,
    );
    expect(hits).toHaveLength(0);
  });
});
