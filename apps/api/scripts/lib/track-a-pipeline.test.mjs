import assert from "node:assert/strict";
import test from "node:test";
import {
  createKakaoAddressParcelAdapter,
  createLiveKakaoAddressParcelAdapter,
  createMockKakaoAddressParcelAdapter,
} from "./kakao-address-parcel.adapter.mjs";
import { TerminalState } from "./benchmark-report.mjs";
import { fetchAllRegisterPages } from "./building-hub-client.mjs";
import { buildGetFeatureParams } from "./vworld-exact-feature.mjs";
import { TRACK_A_TARGETS } from "./track-a-manifest.mjs";
import {
  buildBuildingHubUrlForParcel,
  manifestToPipelineTarget,
  parcelToBuildingHubQuery,
  runTrackAPipeline,
} from "./track-a-pipeline.mjs";
import {
  computePerTargetNetworkBudget,
  computeTrackANetworkBudget,
} from "./track-a-network-budget.mjs";
import {
  createTrackAPipelineMockDeps,
  TRACK_A_PIPELINE_FIXTURES,
} from "./fixtures/track-a-pipeline-fixtures.mjs";
import { buildMockFixtureMap } from "./fixtures/kakao-parcel-track-a-fixtures.mjs";

test("mock and live adapters share resolve interface", () => {
  const mock = createMockKakaoAddressParcelAdapter({});
  const live = createLiveKakaoAddressParcelAdapter({ apiKey: "test-key", fetchFn: async () => ({ status: 200, json: async () => ({ documents: [] }) }) });
  assert.equal(typeof mock.resolve, "function");
  assert.equal(typeof live.resolve, "function");
  assert.equal(mock.id, "kakao-address-parcel-adapter");
  assert.equal(live.id, "kakao-address-parcel-adapter");
});

test("manifest fields propagate to pipeline target", () => {
  for (const t of TRACK_A_TARGETS) {
    const m = manifestToPipelineTarget(t);
    assert.equal(m.roadAddress, t.roadAddress);
    assert.equal(m.parsedDong, t.parsedDong);
    assert.equal(m.expectedBuldNmDc, t.expectedBuldNmDc);
    assert.equal(m.complexNameHint, t.complexNameHint);
    assert.equal(m.expectedComplexNormalized, t.expectedComplexNormalized);
  }
});

test("parcel maps to BuildingHUB query fields", () => {
  const parcel = {
    sigunguCd: "28200",
    bjdongCd: "10500",
    platGbCd: "0",
    bun: "0682",
    ji: "0000",
  };
  const q = parcelToBuildingHubQuery(parcel);
  assert.deepEqual(q, parcel);

  const url = buildBuildingHubUrlForParcel(parcel, "SERVICE_KEY", 1);
  assert.match(url.toString(), /sigunguCd=28200/);
  assert.match(url.toString(), /bjdongCd=10500/);
  assert.match(url.toString(), /platGbCd=0/);
  assert.match(url.toString(), /bun=0682/);
  assert.match(url.toString(), /ji=0000/);
  assert.match(url.toString(), /pageNo=1/);
});

test("BuildingHUB pagination collects all pages", async () => {
  const calls = [];
  const result = await fetchAllRegisterPages(async (pageNo) => {
    calls.push(pageNo);
    if (pageNo === 1) {
      return {
        httpStatus: 200,
        body: {
          response: {
            header: { resultCode: "00" },
            body: { totalCount: 250, items: { item: [{ dongNm: "101동" }] } },
          },
        },
      };
    }
    return {
      httpStatus: 200,
      body: {
        response: {
          header: { resultCode: "00" },
          body: { totalCount: 250, items: { item: [{ dongNm: `P${pageNo}` }] } },
        },
      },
    };
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 3);
  assert.equal(result.items.length, 3);
});

test("dong identity and complex evidence are separated", async () => {
  const deps = createTrackAPipelineMockDeps("R01");
  deps.fetchBuildingHubPage = async () => ({
    httpStatus: 200,
    body: {
      response: {
        header: { resultCode: "00" },
        body: {
          totalCount: 1,
          items: { item: [{ dongNm: "504동", bldNm: "다른단지" }] },
        },
      },
    },
  });
  const target = TRACK_A_TARGETS.find((t) => t.targetId === "R01");
  const r = await runTrackAPipeline(target, deps);
  assert.equal(r.identity.dongMatch, "YES");
  assert.equal(r.identity.complexNameMatch, "MISMATCH");
  assert.equal(r.identity.identityVerified, false);
  assert.equal(r.counters.vworldRequests, 0);
});

test("Building identity unresolved blocks VWorld", async () => {
  const deps = createTrackAPipelineMockDeps("R02");
  deps.fetchBuildingHubPage = async () => ({
    httpStatus: 200,
    body: {
      response: {
        header: { resultCode: "00" },
        body: { totalCount: 0, items: { item: [] } },
      },
    },
  });
  let vworldCalled = false;
  deps.fetchVworldGetFeature = async () => {
    vworldCalled = true;
    return { httpStatus: 200, text: "{}" };
  };
  const target = TRACK_A_TARGETS.find((t) => t.targetId === "R02");
  const r = await runTrackAPipeline(target, deps);
  assert.equal(vworldCalled, false);
  assert.equal(r.counters.vworldRequests, 0);
  assert.equal(r.pipelineBlockedAt, "BUILDING_IDENTITY");
});

test("parcel unresolved blocks BuildingHUB and VWorld", async () => {
  const deps = createTrackAPipelineMockDeps("R03");
  deps.parcelResolver = {
    async resolve() {
      return { status: "UNRESOLVED", parcel: null, reason: "NO_DOCUMENTS" };
    },
  };
  let hubCalled = false;
  deps.fetchBuildingHubPage = async () => {
    hubCalled = true;
    return { httpStatus: 200, body: {} };
  };
  const target = TRACK_A_TARGETS.find((t) => t.targetId === "R03");
  const r = await runTrackAPipeline(target, deps);
  assert.equal(hubCalled, false);
  assert.equal(r.counters.buildingHubRequests, 0);
  assert.equal(r.counters.vworldRequests, 0);
});

test("VWorld query restricted to exact PNU and dong", () => {
  const p = buildGetFeatureParams({ pnu: "2820010500106820000", buldNmDc: "504동" });
  assert.equal(p.ok, true);
  assert.match(p.params.filter, /2820010500106820000/);
  assert.match(p.params.filter, /504동/);
  assert.match(p.params.filter, /buld_nm_dc/);
  assert.doesNotMatch(p.params.filter, /bbox/i);
});

test("VWorld feature count != 1 does not reach geometry verification", async () => {
  const deps = createTrackAPipelineMockDeps("R01");
  deps.fetchVworldGetFeature = async () => ({
    httpStatus: 200,
    text: JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { pnu: TRACK_A_PIPELINE_FIXTURES.R01.pnu, buld_nm_dc: "504동" }, geometry: {} },
        { type: "Feature", properties: { pnu: TRACK_A_PIPELINE_FIXTURES.R01.pnu, buld_nm_dc: "504동" }, geometry: {} },
      ],
    }),
  });
  const target = TRACK_A_TARGETS.find((t) => t.targetId === "R01");
  const r = await runTrackAPipeline(target, deps);
  assert.equal(r.featureCount, 2);
  assert.equal(r.terminal, TerminalState.AMBIGUOUS);
  assert.equal(r.buildingCenter, undefined);
});

test("exact matched feature geometry only reaches representative gate", async () => {
  const deps = createTrackAPipelineMockDeps("R01");
  const target = TRACK_A_TARGETS.find((t) => t.targetId === "R01");
  const r = await runTrackAPipeline(target, deps);
  assert.equal(r.terminal, TerminalState.BUILDING_CENTER_VERIFIED);
  assert.equal(r.buildingCenter.verified, true);
  assert.equal(r.buildingCenter.selectedMethod, "CUSTOM_INTERIOR_POINT");
});

test("R01/R02/R03 mock pipeline ready end-to-end", async () => {
  for (const targetId of ["R01", "R02", "R03"]) {
    const target = TRACK_A_TARGETS.find((t) => t.targetId === targetId);
    const deps = createTrackAPipelineMockDeps(targetId, buildMockFixtureMap());
    const r = await runTrackAPipeline(target, deps);
    assert.equal(r.terminal, TerminalState.BUILDING_CENTER_VERIFIED, targetId);
    assert.equal(r.counters.kakaoRequests, 1, targetId);
    assert.equal(r.counters.buildingHubRequests, 1, targetId);
    assert.equal(r.counters.vworldRequests, 1, targetId);
    assert.equal(r.hubQuery.sigunguCd, r.parcelResult.parcel.sigunguCd, targetId);
  }
});

test("network budget upper bound", () => {
  const b = computeTrackANetworkBudget();
  assert.equal(b.EXPECTED_KAKAO_REQUESTS, 3);
  assert.equal(b.EXPECTED_VWORLD_REQUESTS, 3);
  assert.equal(b.EXPECTED_BUILDING_HUB_REQUESTS_MAX, 15);
  assert.equal(b.TOTAL_NETWORK_REQUEST_UPPER_BOUND, 21);

  const per = computePerTargetNetworkBudget();
  assert.equal(per.TOTAL_MAX_REQUESTS, 7);
});

test("live adapter uses injected fetch without reading env", async () => {
  let capturedUrl = null;
  let capturedHeaders = null;
  const adapter = createLiveKakaoAddressParcelAdapter({
    apiKey: "injected-key",
    fetchFn: async (url, init) => {
      capturedUrl = url;
      capturedHeaders = init.headers;
      return { status: 200, json: async () => ({ documents: [] }) };
    },
  });
  await adapter.resolve("인천광역시 남동구 서창남순환로 55");
  assert.match(capturedUrl, /dapi\.kakao\.com/);
  assert.match(capturedHeaders.Authorization, /KakaoAK injected-key/);
  assert.doesNotMatch(capturedUrl, /injected-key/);
});

test("createKakaoAddressParcelAdapter requires fetchAddressSearch", () => {
  assert.throws(() => createKakaoAddressParcelAdapter({}), /fetchAddressSearch/);
});

test("MODEL B — R02 missing buld_nm with verified BuildingHUB => BUILDING_CENTER", async () => {
  const deps = createTrackAPipelineMockDeps("R02");
  deps.fetchBuildingHubPage = async () => ({
    httpStatus: 200,
    body: {
      response: {
        header: { resultCode: "00" },
        body: {
          totalCount: 1,
          items: {
            item: [{
              dongNm: "A",
              bldNm: "인천 소래논현구역 C10블록 에코메트로 3차 더 타워",
            }],
          },
        },
      },
    },
  });
  deps.fetchVworldGetFeature = async () => ({
    httpStatus: 200,
    text: JSON.stringify({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {
          pnu: TRACK_A_PIPELINE_FIXTURES.R02.pnu,
          buld_nm_dc: "A동",
          bd_mgt_sn: "282001100010751000100000001",
        },
        geometry: {
          type: "MultiPolygon",
          coordinates: [[[[126.74, 37.42], [126.741, 37.42], [126.741, 37.421], [126.74, 37.421], [126.74, 37.42]]]],
        },
      }],
    }),
  });
  const target = TRACK_A_TARGETS.find((t) => t.targetId === "R02");
  const r = await runTrackAPipeline(target, deps);
  assert.equal(r.identity.identityVerified, true);
  assert.equal(r.identity.complexNameMatch, "REGISTER_STRUCTURED_PREFIX_CORE_MATCH");
  assert.equal(r.vworldClass.evaluations[0].vworldComplexEvidence, "MISSING");
  assert.equal(r.terminal, TerminalState.BUILDING_CENTER_VERIFIED);
  assert.equal(r.provenance.identityProvenance, "BUILDING_HUB_VERIFIED");
  assert.equal(r.provenance.geometryProvenance, "VWORLD_EXACT_PNU_DONG_FEATURE");
  assert.equal(r.provenance.complexCorroboration, "MISSING");
  assert.equal(r.provenance.pinProvenance, "BUILDING_CENTER");
});

test("MODEL B — contradictory VWorld complex blocks geometry", async () => {
  const deps = createTrackAPipelineMockDeps("R02");
  deps.fetchVworldGetFeature = async () => ({
    httpStatus: 200,
    text: JSON.stringify({
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {
          pnu: TRACK_A_PIPELINE_FIXTURES.R02.pnu,
          buld_nm: "완전히다른단지",
          buld_nm_dc: "A동",
        },
        geometry: {
          type: "MultiPolygon",
          coordinates: [[[[126.74, 37.42], [126.741, 37.42], [126.741, 37.421], [126.74, 37.421], [126.74, 37.42]]]],
        },
      }],
    }),
  });
  const target = TRACK_A_TARGETS.find((t) => t.targetId === "R02");
  const r = await runTrackAPipeline(target, deps);
  assert.equal(r.failureReason, "VWORLD_CONTRADICTORY_COMPLEX");
  assert.equal(r.buildingCenter, undefined);
  assert.equal(r.provenance, undefined);
});
