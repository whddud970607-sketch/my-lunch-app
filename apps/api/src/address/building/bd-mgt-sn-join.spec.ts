import { buildBrTitleInfoUrl } from "./building-hub-client";
import { runBuildingResolutionChain } from "./building-resolution.stage";
import { formatDongLabel, normalizeWhitespace } from "./building-identity-matcher";
import {
  buildGetFeatureParams,
  buildOgcFilter,
  classifyGetFeatureResult,
  parseGetFeatureGeoJson,
} from "./vworld-exact-feature";
import {
  createTrackAProductionMockDeps,
  TRACK_A_PIPELINE_FIXTURES,
  type TrackAFixtureId,
} from "../fixtures/track-a-production-fixtures";

describe("bd_mgt_sn join policy", () => {
  const parcel = {
    sigunguCd: "28200",
    bjdongCd: "10500",
    platGbCd: "0",
    bun: "0682",
    ji: "0000",
    provenance: "test",
  };

  it("BuildingHUB URL uses parcel fields only — never bd_mgt_sn", () => {
    const url = buildBrTitleInfoUrl(parcel, "SERVICE_KEY", 1);
    const qs = url.searchParams;
    expect(qs.get("sigunguCd")).toBe("28200");
    expect(qs.get("bjdongCd")).toBe("10500");
    expect(qs.get("platGbCd")).toBe("0");
    expect(qs.get("bun")).toBe("0682");
    expect(qs.get("ji")).toBe("0000");
    expect(url.toString()).not.toMatch(/bd_mgt_sn|bdMgtSn/i);
  });

  it("VWorld OGC filter uses pnu + buld_nm_dc only — never bd_mgt_sn", () => {
    const filter = buildOgcFilter({ pnu: "2820010500106820000", buldNmDc: "504동" });
    expect(filter.ok).toBe(true);
    if (filter.ok) {
      expect(filter.filterXml).toMatch(/pnu/);
      expect(filter.filterXml).toMatch(/buld_nm_dc/);
      expect(filter.filterXml).not.toMatch(/bd_mgt_sn/i);
    }

    const params = buildGetFeatureParams({
      pnu: "2820010500106820000",
      buldNmDc: "504동",
    });
    expect(params.ok).toBe(true);
    if (params.ok) {
      expect(params.params.filter).not.toMatch(/bd_mgt_sn/i);
    }
  });

  it("bd_mgt_sn is stored as diagnostic vworldProviderBuildingId only", () => {
    const parsed = parseGetFeatureGeoJson(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              pnu: "2820010500106820000",
              buld_nm_dc: "504동",
              bd_mgt_sn: "diag-only-sn-999",
            },
            geometry: {
              type: "MultiPolygon",
              coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]],
            },
          },
        ],
      }),
    );
    const result = classifyGetFeatureResult(
      parsed,
      {
        pnu: "2820010500106820000",
        buldNmDc: "504동",
        complexNormalized: "서창센트럴푸르지오",
      },
      { buildingHubIdentityVerified: true },
    );
    expect(result.provenance?.vworldProviderBuildingId).toBe("diag-only-sn-999");
    expect(result.terminal).toBe("READY_FOR_REPRESENTATIVE_POINT");
  });

  it("resolution chain joins BuildingHUB by parcel — bd_mgt_sn absent from hub fetch", async () => {
    const fx = TRACK_A_PIPELINE_FIXTURES.R01;
    const hubParcelKeys: string[][] = [];
    const deps = createTrackAProductionMockDeps("R01");
    const originalFetch = deps.fetchBuildingHubPage;
    deps.fetchBuildingHubPage = async (receivedParcel, pageNo) => {
      hubParcelKeys.push(Object.keys(receivedParcel as object).sort());
      return originalFetch(receivedParcel, pageNo);
    };

    const target = {
      roadAddress: fx.roadAddress,
      dong: fx.dong,
      complexNameHint: fx.complexNameHint,
      expectedBuldNmDc: formatDongLabel(fx.dong),
      expectedComplexNormalized: normalizeWhitespace(fx.complexNameHint),
    };

    const result = await runBuildingResolutionChain(target, deps);
    expect(result.ok).toBe(true);
    expect(hubParcelKeys.length).toBeGreaterThan(0);
    for (const keys of hubParcelKeys) {
      expect(keys).not.toContain("bd_mgt_sn");
      expect(keys).not.toContain("bdMgtSn");
      expect(keys).toEqual(
        expect.arrayContaining(["sigunguCd", "bjdongCd", "platGbCd", "bun", "ji"]),
      );
    }
    if (result.ok) {
      expect(result.provenance.vworldProviderBuildingId).toBe("diag-only-001");
    }
  });

  it.each<TrackAFixtureId>(["R01", "R02", "R03"])(
    "%s succeeds without bd_mgt_sn in BuildingHUB register rows",
    async (targetId) => {
      const fx = TRACK_A_PIPELINE_FIXTURES[targetId];
      const deps = createTrackAProductionMockDeps(targetId);
      const result = await runBuildingResolutionChain(
        {
          roadAddress: fx.roadAddress,
          dong: fx.dong,
          complexNameHint: fx.complexNameHint,
          expectedBuldNmDc: formatDongLabel(fx.dong),
          expectedComplexNormalized: normalizeWhitespace(fx.complexNameHint),
        },
        deps,
      );
      expect(result.ok).toBe(true);
    },
  );
});
