/**
 * End-to-end mock fixtures for TRACK A pipeline pre-flight (NETWORK=0).
 */

import { resolveFromKakaoAddressResponse } from "../kakao-address-parcel.adapter.mjs";
import { buildMockFixtureMap } from "./kakao-parcel-track-a-fixtures.mjs";

function hubBody(items, totalCount = items.length) {
  return {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE" },
      body: { totalCount, items: { item: items } },
    },
  };
}

function hubRow(dongNm, bldNm) {
  return { dongNm, bldNm };
}

function squareMultiPolygon() {
  return {
    type: "MultiPolygon",
    coordinates: [[[[126.74, 37.42], [126.741, 37.42], [126.741, 37.421], [126.74, 37.421], [126.74, 37.42]]]],
  };
}

function vworldBody(pnu, buldNm, buldNmDc, geometry = squareMultiPolygon()) {
  return JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { pnu, buld_nm: buldNm, buld_nm_dc: buldNmDc },
        geometry,
      },
    ],
  });
}

export const TRACK_A_PIPELINE_FIXTURES = {
  R01: {
    kakao: buildMockFixtureMap()["인천광역시 남동구 서창남순환로 55"],
    buildingHubPages: {
      1: hubBody([hubRow("504동", "서창센트럴푸르지오")]),
    },
    pnu: "2820010500106820000",
    vworldText: vworldBody("2820010500106820000", "서창센트럴푸르지오", "504동"),
  },
  R02: {
    kakao: buildMockFixtureMap()["인천광역시 남동구 소래역남로 40"],
    buildingHubPages: {
      1: hubBody([hubRow("A동", "에코메트로3차 더타워")]),
    },
    pnu: "2820011000107510001",
    vworldText: vworldBody("2820011000107510001", "에코메트로3차 더타워", "A동"),
  },
  R03: {
    kakao: buildMockFixtureMap()["인천광역시 남동구 호구포로 803"],
    buildingHubPages: {
      1: hubBody([hubRow("2301동", "롯데캐슬골드")]),
    },
    pnu: "2820010100100240000",
    vworldText: vworldBody("2820010100100240000", "롯데캐슬골드", "2301동"),
  },
};

export function createTrackAPipelineMockDeps(targetId, kakaoFixtures = buildMockFixtureMap()) {
  const fx = TRACK_A_PIPELINE_FIXTURES[targetId];
  if (!fx) throw new Error(`Unknown target fixture: ${targetId}`);

  const kakaoByRoad = kakaoFixtures;

  return {
    parcelResolver: {
      id: "mock-kakao",
      async resolve(roadAddress) {
        const fixture = kakaoByRoad[roadAddress] ?? { httpStatus: 200, body: { documents: [] } };
        return resolveFromKakaoAddressResponse(fixture.httpStatus, fixture.body);
      },
    },
    fetchBuildingHubPage: async (_parcel, pageNo) => ({
      httpStatus: 200,
      body: fx.buildingHubPages[pageNo] ?? hubBody([]),
    }),
    fetchVworldGetFeature: async (_params) => ({
      httpStatus: 200,
      text: fx.vworldText,
    }),
  };
}
