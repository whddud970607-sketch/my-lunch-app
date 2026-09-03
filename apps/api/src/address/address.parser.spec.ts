import {
  normalizeAddressWhitespace,
  normalizeDongHint,
  parseAddress,
  parseBuildingFromDetail,
  parseDong,
  parseHo,
  resolveComplexNameHint,
} from "./address.parser";
import { composeDetailAddressWithComplex } from "../import/import-detail-compose";
import {
  runBuildingResolutionChain,
  targetFromParsedAddress,
} from "./building/building-resolution.stage";
import {
  createTrackAProductionMockDeps,
  TRACK_A_PIPELINE_FIXTURES,
  type TrackAFixtureId,
} from "./fixtures/track-a-production-fixtures";
import {
  IdentityProvenance,
  PinProvenance,
} from "./building/building-resolution.types";
import { PublicBuildingDataAdapter } from "./adapters/public-building-data.adapter";

const RESEARCH_COMPLEX: Record<TrackAFixtureId, string> = {
  R01: "서창센트럴푸르지오",
  R02: "에코메트로3차 더타워",
  R03: "롯데캐슬골드",
};

describe("address.parser — production input normalization", () => {
  it("normalizes whitespace", () => {
    expect(normalizeAddressWhitespace("  서울   강남  ")).toBe("서울 강남");
  });

  it("parses numeric dong and ho", () => {
    expect(parseDong("609동 503호")).toBe("609");
    expect(parseHo("609동 503호")).toBe("503");
    expect(normalizeDongHint("504동")).toBe("504");
    expect(normalizeDongHint("504")).toBe("504");
  });

  it("parses letter dong (A동 / B동)", () => {
    expect(parseDong("A동")).toBe("A");
    expect(parseDong("a동 502호")).toBe("A");
    expect(parseDong("에코메트로3차 더타워 B동")).toBe("B");
    expect(normalizeDongHint("A동")).toBe("A");
    expect(normalizeDongHint("A")).toBe("A");
  });

  it("rejects mixed invalid / empty dong", () => {
    expect(parseDong(null)).toBeNull();
    expect(parseDong("")).toBeNull();
    expect(parseDong("동만있음")).toBeNull();
    expect(parseDong("남동구")).toBeNull();
    expect(normalizeDongHint("아파트")).toBeNull();
    expect(normalizeDongHint(null)).toBeNull();
  });

  it("extracts building/complex prefix before numeric or letter dong", () => {
    expect(parseBuildingFromDetail("서창센트럴푸르지오 504동")).toBe(
      "서창센트럴푸르지오",
    );
    expect(parseBuildingFromDetail("에코메트로3차 더타워 A동 502호")).toBe(
      "에코메트로3차 더타워",
    );
    expect(parseBuildingFromDetail("504동")).toBeNull();
  });

  it("complexNameHint precedence is deterministic", () => {
    expect(
      resolveComplexNameHint({
        complexNameHint: "HINT",
        complexName: "COMPLEX",
        buildingName: "BUILDING",
        detailAddress: "DETAIL 1동",
      }),
    ).toBe("HINT");
    expect(
      resolveComplexNameHint({
        complexName: "COMPLEX",
        buildingName: "BUILDING",
        detailAddress: "DETAIL 1동",
      }),
    ).toBe("COMPLEX");
    expect(
      resolveComplexNameHint({
        buildingName: "BUILDING",
        detailAddress: "DETAIL 1동",
      }),
    ).toBe("BUILDING");
    expect(
      resolveComplexNameHint({
        detailAddress: "서창센트럴푸르지오 504동",
      }),
    ).toBe("서창센트럴푸르지오");
    expect(resolveComplexNameHint({ detailAddress: "504동" })).toBeNull();
  });

  it("parseAddress wires explicit hints", () => {
    const parsed = parseAddress({
      roadAddress: "인천광역시 남동구 서창남순환로 55",
      detailAddress: "1201호",
      complexNameHint: "서창센트럴푸르지오",
      dongHint: "504",
    });
    expect(parsed.complexName).toBe("서창센트럴푸르지오");
    expect(parsed.dong).toBe("504");
  });

  it("parseAddress ecoavenue fixture still works", () => {
    const parsed = parseAddress({
      roadAddress: "인천광역시 남동구 서창남순환로 190-100",
      detailAddress: "609동 503호",
      complexName: "에코에비뉴",
    });
    expect(parsed.dong).toBe("609");
    expect(parsed.ho).toBe("503");
    expect(parsed.complexName).toBe("에코에비뉴");
  });
});

describe("import detail compose — complex folded into detail_address", () => {
  it("composes without double prefix", () => {
    expect(
      composeDetailAddressWithComplex("서창센트럴푸르지오", "504동"),
    ).toBe("서창센트럴푸르지오 504동");
    expect(
      composeDetailAddressWithComplex(
        "서창센트럴푸르지오",
        "서창센트럴푸르지오 504동",
      ),
    ).toBe("서창센트럴푸르지오 504동");
    expect(composeDetailAddressWithComplex(null, "504동")).toBe("504동");
    expect(composeDetailAddressWithComplex("단지", null)).toBe("단지");
  });
});

describe("Track A production parity via composed detail / hints", () => {
  it.each<TrackAFixtureId>(["R01", "R02", "R03"])(
    "%s identity verified from composed detail_address",
    async (id) => {
      const fx = TRACK_A_PIPELINE_FIXTURES[id];
      const detail = composeDetailAddressWithComplex(
        RESEARCH_COMPLEX[id],
        `${fx.dong}동`,
      );
      const parsed = parseAddress({
        roadAddress: fx.roadAddress,
        detailAddress: detail,
      });
      const target = targetFromParsedAddress(parsed);
      expect(target?.dong).toBe(fx.dong);
      expect(target?.complexNameHint).toBe(RESEARCH_COMPLEX[id]);

      const result = await runBuildingResolutionChain(
        target!,
        createTrackAProductionMockDeps(id),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.provenance.identityProvenance).toBe(
        IdentityProvenance.BUILDING_HUB_VERIFIED,
      );
      expect(result.provenance.pinProvenance).toBe(PinProvenance.BUILDING_CENTER);
    },
  );

  it("R02 MODEL B MISSING preserved with letter dong hint", async () => {
    const parsed = parseAddress({
      roadAddress: TRACK_A_PIPELINE_FIXTURES.R02.roadAddress,
      detailAddress: "A동",
      complexNameHint: RESEARCH_COMPLEX.R02,
      dongHint: "A",
    });
    expect(parsed.dong).toBe("A");
    const result = await runBuildingResolutionChain(
      targetFromParsedAddress(parsed)!,
      createTrackAProductionMockDeps("R02"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provenance.complexCorroboration).toBe("MISSING");
  });

  it("missing complexNameHint remains fail-closed", async () => {
    const parsed = parseAddress({
      roadAddress: TRACK_A_PIPELINE_FIXTURES.R01.roadAddress,
      detailAddress: "504동",
    });
    expect(parsed.complexName).toBeNull();
    const adapter = new PublicBuildingDataAdapter({
      mockDeps: createTrackAProductionMockDeps("R01"),
    });
    await expect(adapter.resolveBuildingCandidates(parsed)).resolves.toEqual(
      [],
    );
  });
});
