import {
  normalizeAddressWhitespace,
  parseAddress,
  parseDong,
  parseHo,
} from "./address.parser";

describe("address.parser", () => {
  it("normalizes whitespace", () => {
    expect(normalizeAddressWhitespace("  서울   강남  ")).toBe("서울 강남");
  });

  it("parses dong and ho from detail", () => {
    expect(parseDong("609동 503호")).toBe("609");
    expect(parseHo("609동 503호")).toBe("503");
  });

  it("parses ecoavenue 609 fixture", () => {
    const parsed = parseAddress({
      roadAddress: "인천광역시 남동구 서창남순환로 190-100",
      detailAddress: "609동 503호",
      complexName: "에코에비뉴",
    });
    expect(parsed.dong).toBe("609");
    expect(parsed.ho).toBe("503");
    expect(parsed.complexName).toBe("에코에비뉴");
    expect(parsed.buildingName).toBe("에코에비뉴");
  });
});
