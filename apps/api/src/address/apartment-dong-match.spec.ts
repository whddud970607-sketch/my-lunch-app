import {
  apartmentIdentityMatches,
  classifyPlaceSemantic,
  hasExactDongToken,
  normalizeCanonicalDong,
  selectExactApartmentDongHit,
} from "./apartment-dong-match";

const APT = "샘플아파트";

describe("apartment dong exact matcher", () => {
  it("normalizes 504 / 504동 / spaced input to 504동", () => {
    expect(normalizeCanonicalDong("504")).toBe("504동");
    expect(normalizeCanonicalDong("504동")).toBe("504동");
    expect(normalizeCanonicalDong(" 504 동 ")).toBe("504동");
  });

  it("accepts OO아파트 504동 for input 504동", () => {
    const hit = selectExactApartmentDongHit({
      buildingName: APT,
      dong: "504동",
      documents: [
        {
          place_name: `${APT} 504동`,
          address_name: "인천광역시 남동구 샘플로 1",
          road_address_name: "인천광역시 남동구 샘플로 1",
          x: "126.11",
          y: "37.11",
        },
      ],
    });
    expect(hit).toEqual({ latitude: 37.11, longitude: 126.11 });
  });

  it("accepts input 504 against place 504동", () => {
    const hit = selectExactApartmentDongHit({
      buildingName: APT,
      dong: "504",
      documents: [
        {
          place_name: `${APT} 504동`,
          x: "126.11",
          y: "37.11",
        },
      ],
    });
    expect(hit).toEqual({ latitude: 37.11, longitude: 126.11 });
  });

  it("rejects 501동 for requested 504동", () => {
    expect(
      selectExactApartmentDongHit({
        buildingName: APT,
        dong: "504동",
        documents: [
          {
            place_name: `${APT} 501동`,
            category_name: "부동산 > 아파트 동",
            x: "126.10",
            y: "37.10",
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects 1504동 substring for 504동", () => {
    expect(hasExactDongToken(`${APT} 1504동`, "504동")).toBe(false);
    expect(
      selectExactApartmentDongHit({
        buildingName: APT,
        dong: "504동",
        documents: [{ place_name: `${APT} 1504동`, x: "126.12", y: "37.12" }],
      }),
    ).toBeNull();
  });

  it("rejects 504호 and 504번길", () => {
    expect(hasExactDongToken(`${APT} 504호`, "504동")).toBe(false);
    expect(hasExactDongToken("샘플로 504번길", "504동")).toBe(false);
    expect(
      selectExactApartmentDongHit({
        buildingName: APT,
        dong: "504동",
        documents: [
          { place_name: `${APT} 504호`, x: "126.13", y: "37.13" },
          {
            place_name: "샘플로 504번길",
            road_address_name: "샘플로 504번길",
            x: "126.14",
            y: "37.14",
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects exact dong on a different apartment", () => {
    expect(
      apartmentIdentityMatches({
        buildingName: APT,
        placeName: "다른단지 504동",
      }),
    ).toBe(false);
    expect(
      selectExactApartmentDongHit({
        buildingName: APT,
        dong: "504동",
        documents: [
          {
            place_name: "다른단지 504동",
            x: "126.15",
            y: "37.15",
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects first-result 501동 even if category is 아파트 동", () => {
    expect(
      selectExactApartmentDongHit({
        buildingName: APT,
        dong: "504동",
        documents: [
          {
            place_name: `${APT} 501동`,
            category_name: "부동산 > 아파트 동",
            x: "126.10",
            y: "37.10",
          },
          {
            place_name: `${APT}`,
            category_name: "부동산 > 아파트",
            x: "126.101",
            y: "37.101",
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects ambiguous exact matches with different coords", () => {
    expect(
      selectExactApartmentDongHit({
        buildingName: APT,
        dong: "504동",
        documents: [
          {
            place_name: `${APT} 504동`,
            category_name: "부동산 > 아파트 동",
            x: "126.11",
            y: "37.11",
          },
          {
            place_name: `${APT}아파트 504동`,
            category_name: "부동산 > 아파트 동",
            x: "126.19",
            y: "37.19",
          },
        ],
      }),
    ).toBeNull();
  });

  it("503 regression: prefers apartment dong and rejects EV charger", () => {
    const hit = selectExactApartmentDongHit({
      buildingName: "서창센트럴푸르지오",
      dong: "503",
      documents: [
        {
          place_name: "서창센트럴푸르지오아파트 503동",
          category_name: "부동산 > 아파트 동",
          x: "126.74861487206365",
          y: "37.42829218537658",
        },
        {
          place_name: "인천남동 서창센트럴푸르지오 503동 전기차충전소",
          category_name: "교통,수송 > 자동차 > 전기차 충전소",
          x: "126.74813681079378",
          y: "37.429685938501756",
        },
      ],
    });
    expect(hit).toEqual({
      latitude: 37.42829218537658,
      longitude: 126.74861487206365,
    });
  });

  it("classifies semantic types for facility vs apartment dong", () => {
    expect(
      classifyPlaceSemantic({
        place_name: "서창센트럴푸르지오아파트 503동",
        category_name: "부동산 > 아파트 동",
      }),
    ).toBe("APARTMENT_DONG");
    expect(
      classifyPlaceSemantic({
        place_name: "서창센트럴푸르지오 503동 전기차충전소",
        category_name: "교통,수송 > 자동차 > 전기차 충전소",
      }),
    ).toBe("CHARGING_STATION");
    expect(
      classifyPlaceSemantic({
        place_name: "서창센트럴푸르지오 관리사무소",
      }),
    ).toBe("MANAGEMENT_OFFICE");
  });

  it("rejects 501-only / 1503 / 503호 / other apartment for requested 503", () => {
    expect(
      selectExactApartmentDongHit({
        buildingName: "서창센트럴푸르지오",
        dong: "503",
        documents: [
          {
            place_name: "서창센트럴푸르지오아파트 501동",
            category_name: "부동산 > 아파트 동",
            x: "126.1",
            y: "37.1",
          },
        ],
      }),
    ).toBeNull();
    expect(
      selectExactApartmentDongHit({
        buildingName: "서창센트럴푸르지오",
        dong: "503",
        documents: [
          {
            place_name: "서창센트럴푸르지오아파트 1503동",
            category_name: "부동산 > 아파트 동",
            x: "126.1",
            y: "37.1",
          },
        ],
      }),
    ).toBeNull();
    expect(
      selectExactApartmentDongHit({
        buildingName: "서창센트럴푸르지오",
        dong: "503",
        documents: [
          { place_name: "서창센트럴푸르지오 503호", x: "126.1", y: "37.1" },
        ],
      }),
    ).toBeNull();
    expect(
      selectExactApartmentDongHit({
        buildingName: "서창센트럴푸르지오",
        dong: "503",
        documents: [
          {
            place_name: "다른아파트 503동",
            category_name: "부동산 > 아파트 동",
            x: "126.1",
            y: "37.1",
          },
        ],
      }),
    ).toBeNull();
  });
});
