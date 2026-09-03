/**
 * Mock Kakao address.json fixtures — derived from Track A live validation.
 */

function roadDoc(input: {
  bCode: string;
  mountainYn: string;
  mainNo: string;
  subNo: string;
  roadName: string;
  mainBuildingNo: string;
  subBuildingNo?: string;
}) {
  const {
    bCode,
    mountainYn,
    mainNo,
    subNo,
    roadName,
    mainBuildingNo,
    subBuildingNo = "",
  } = input;
  return {
    address_type: "ROAD_ADDR",
    address: {
      b_code: bCode,
      mountain_yn: mountainYn,
      main_address_no: mainNo,
      sub_address_no: subNo,
    },
    road_address: {
      address_name: `인천광역시 남동구 ${roadName} ${mainBuildingNo}${subBuildingNo ? `-${subBuildingNo}` : ""}`,
      road_name: roadName,
      main_building_no: mainBuildingNo,
      sub_building_no: subBuildingNo,
      region_1depth_name: "인천광역시",
      region_2depth_name: "남동구",
    },
  };
}

export const TRACK_A_KAKAO_PARCEL_FIXTURES = {
  "인천광역시 남동구 서창남순환로 55": {
    httpStatus: 200,
    body: {
      documents: [
        roadDoc({
          bCode: "2820010500",
          mountainYn: "N",
          mainNo: "682",
          subNo: "",
          roadName: "서창남순환로",
          mainBuildingNo: "55",
        }),
      ],
    },
    expectedParcel: {
      sigunguCd: "28200",
      bjdongCd: "10500",
      platGbCd: "0",
      bun: "0682",
      ji: "0000",
    },
  },
  "인천광역시 남동구 소래역남로 40": {
    httpStatus: 200,
    body: {
      documents: [
        roadDoc({
          bCode: "2820011000",
          mountainYn: "N",
          mainNo: "751",
          subNo: "1",
          roadName: "소래역남로",
          mainBuildingNo: "40",
        }),
      ],
    },
    expectedParcel: {
      sigunguCd: "28200",
      bjdongCd: "11000",
      platGbCd: "0",
      bun: "0751",
      ji: "0001",
    },
  },
  "인천광역시 남동구 호구포로 803": {
    httpStatus: 200,
    body: {
      documents: [
        roadDoc({
          bCode: "2820010100",
          mountainYn: "N",
          mainNo: "24",
          subNo: "",
          roadName: "호구포로",
          mainBuildingNo: "803",
        }),
      ],
    },
    expectedParcel: {
      sigunguCd: "28200",
      bjdongCd: "10100",
      platGbCd: "0",
      bun: "0024",
      ji: "0000",
    },
  },
} as const;

export function buildMockFixtureMap(): Record<
  string,
  { httpStatus: number; body: object }
> {
  const map: Record<string, { httpStatus: number; body: object }> = {};
  for (const [roadAddress, entry] of Object.entries(TRACK_A_KAKAO_PARCEL_FIXTURES)) {
    map[roadAddress] = { httpStatus: entry.httpStatus, body: entry.body };
  }
  return map;
}
