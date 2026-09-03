/**
 * Production mock fixtures for Track A regression (R01/R02/R03). NETWORK=0.
 */

import { resolveFromKakaoAddressResponse } from "../building/kakao-parcel.mapper";
import { buildMockFixtureMap } from "./kakao-parcel-track-a-fixtures";

function hubBody(items: unknown[], totalCount = items.length) {
  return {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE" },
      body: { totalCount, items: { item: items } },
    },
  };
}

function hubRow(dongNm: string, bldNm: string) {
  return { dongNm, bldNm };
}

function squareMultiPolygon() {
  return {
    type: "MultiPolygon" as const,
    coordinates: [
      [
        [
          [126.74, 37.42],
          [126.741, 37.42],
          [126.741, 37.421],
          [126.74, 37.421],
          [126.74, 37.42],
        ],
      ],
    ],
  };
}

function vworldBody(
  pnu: string,
  buldNm: string | null,
  buldNmDc: string,
  geometry = squareMultiPolygon(),
) {
  return JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { pnu, buld_nm: buldNm, buld_nm_dc: buldNmDc, bd_mgt_sn: "diag-only-001" },
        geometry,
      },
    ],
  });
}

export const TRACK_A_PIPELINE_FIXTURES = {
  R01: {
    roadAddress: "인천광역시 남동구 서창남순환로 55",
    dong: "504",
    complexNameHint: "서창센트럴푸르지오",
    kakao: buildMockFixtureMap()["인천광역시 남동구 서창남순환로 55"],
    buildingHubPages: {
      1: hubBody([hubRow("504동", "서창센트럴푸르지오")]),
    },
    pnu: "2820010500106820000",
    vworldText: vworldBody("2820010500106820000", "서창센트럴푸르지오", "504동"),
  },
  R02: {
    roadAddress: "인천광역시 남동구 소래역남로 40",
    dong: "A",
    complexNameHint: "에코메트로3차 더타워",
    kakao: buildMockFixtureMap()["인천광역시 남동구 소래역남로 40"],
    buildingHubPages: {
      1: hubBody([
        hubRow(
          "A동",
          "인천 소래논현구역 C10블록 에코메트로 3차 더 타워",
        ),
      ]),
    },
    pnu: "2820011000107510001",
    vworldText: vworldBody("2820011000107510001", null, "A동"),
  },
  R03: {
    roadAddress: "인천광역시 남동구 호구포로 803",
    dong: "2301",
    complexNameHint: "롯데캐슬골드",
    kakao: buildMockFixtureMap()["인천광역시 남동구 호구포로 803"],
    buildingHubPages: {
      1: hubBody([hubRow("2301동", "롯데캐슬골드")]),
    },
    pnu: "2820010100100240000",
    vworldText: vworldBody("2820010100100240000", "롯데캐슬골드", "2301동"),
  },
} as const;

export type TrackAFixtureId = keyof typeof TRACK_A_PIPELINE_FIXTURES;

export function createTrackAProductionMockDeps(targetId: TrackAFixtureId) {
  const fx = TRACK_A_PIPELINE_FIXTURES[targetId];
  const kakaoByRoad = buildMockFixtureMap();

  return {
    parcelResolver: {
      id: "mock-kakao-parcel",
      async resolve(roadAddress: string) {
        const fixture =
          kakaoByRoad[roadAddress] ?? { httpStatus: 200, body: { documents: [] } };
        return resolveFromKakaoAddressResponse(fixture.httpStatus, fixture.body as never);
      },
    },
    fetchBuildingHubPage: async (_parcel: unknown, pageNo: number) => ({
      httpStatus: 200,
      body:
        fx.buildingHubPages[pageNo as keyof typeof fx.buildingHubPages] ??
        hubBody([]),
    }),
    fetchVworldGetFeature: async (_params: Record<string, string>) => ({
      httpStatus: 200,
      text: fx.vworldText,
    }),
  };
}
