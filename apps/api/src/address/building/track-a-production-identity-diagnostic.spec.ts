/**
 * PHASE_2C.5A — production vs research Track A identity input diagnostic.
 * NETWORK=0. No credentials. No raw provider bodies in assertions beyond fixture counts.
 */
import { parseAddress } from "../address.parser";
import { PublicBuildingDataAdapter } from "../adapters/public-building-data.adapter";
import {
  matchBuildingRegisterIdentity,
  formatDongLabel,
  normalizeWhitespace,
} from "./building-identity-matcher";
import {
  runBuildingResolutionChain,
  targetFromParsedAddress,
  type BuildingResolutionTarget,
} from "./building-resolution.stage";
import { buildBrTitleInfoUrl } from "./building-hub-client";
import {
  createTrackAProductionMockDeps,
  TRACK_A_PIPELINE_FIXTURES,
  type TrackAFixtureId,
} from "../fixtures/track-a-production-fixtures";
import { IdentityProvenance, PinProvenance } from "./building-resolution.types";

/** Research frozen complex hints (structural — same as track-a-frozen-ground-truth). */
const RESEARCH_COMPLEX_HINT: Record<TrackAFixtureId, string> = {
  R01: "서창센트럴푸르지오",
  R02: "에코메트로3차 더타워",
  R03: "롯데캐슬골드",
};

/** Mimics Phase 2C.5 smoke PII: road + dong-only detail, no complexName. */
function workerSmokeParsed(fixtureId: TrackAFixtureId) {
  const fx = TRACK_A_PIPELINE_FIXTURES[fixtureId];
  return parseAddress({
    roadAddress: fx.roadAddress,
    detailAddress: `${fx.dong}동`,
  });
}

/** Research-equivalent production input: explicit complexName + dong detail. */
function researchEquivalentParsed(fixtureId: TrackAFixtureId) {
  const fx = TRACK_A_PIPELINE_FIXTURES[fixtureId];
  return parseAddress({
    roadAddress: fx.roadAddress,
    detailAddress: `${fx.dong}동`,
    complexName: RESEARCH_COMPLEX_HINT[fixtureId],
  });
}

function researchTarget(fixtureId: TrackAFixtureId): BuildingResolutionTarget {
  const fx = TRACK_A_PIPELINE_FIXTURES[fixtureId];
  return {
    roadAddress: fx.roadAddress,
    dong: fx.dong,
    complexNameHint: RESEARCH_COMPLEX_HINT[fixtureId],
    expectedBuldNmDc: formatDongLabel(fx.dong),
    expectedComplexNormalized: normalizeWhitespace(
      RESEARCH_COMPLEX_HINT[fixtureId],
    ),
  };
}

describe("PHASE_2C.5A Track A production identity diagnostic", () => {
  describe("R01 research vs production input structure", () => {
    it("worker smoke-style parse loses complexNameHint (root divergence)", () => {
      const parsed = workerSmokeParsed("R01");
      const target = targetFromParsedAddress(parsed);

      expect(parsed.dong).toBe("504");
      expect(parsed.complexName).toBeNull();
      expect(parsed.buildingName).toBeNull();
      expect(target).not.toBeNull();
      expect(target!.complexNameHint).toBeNull();
      expect(target!.expectedBuldNmDc).toBe("504동");
      expect(target!.expectedComplexNormalized).toBeNull();
    });

    it("research-equivalent parse preserves complexNameHint", () => {
      const parsed = researchEquivalentParsed("R01");
      const target = targetFromParsedAddress(parsed);

      expect(parsed.dong).toBe("504");
      expect(parsed.complexName).toBe(RESEARCH_COMPLEX_HINT.R01);
      expect(target!.complexNameHint).toBe(RESEARCH_COMPLEX_HINT.R01);
      expect(target!.expectedComplexNormalized).toBe(
        normalizeWhitespace(RESEARCH_COMPLEX_HINT.R01),
      );
    });

    it("BuildingHUB URL structural params match research getBrTitleInfo shape", () => {
      const parcel = {
        sigunguCd: "28200",
        bjdongCd: "10500",
        platGbCd: "0",
        bun: "0682",
        ji: "0000",
      };
      const url = buildBrTitleInfoUrl(parcel, "PLACEHOLDER_KEY", 1, 100);
      expect(url.pathname).toContain("/getBrTitleInfo");
      expect(url.searchParams.get("sigunguCd")).toBe("28200");
      expect(url.searchParams.get("bjdongCd")).toBe("10500");
      expect(url.searchParams.get("platGbCd")).toBe("0");
      expect(url.searchParams.get("bun")).toBe("0682");
      expect(url.searchParams.get("ji")).toBe("0000");
      expect(url.searchParams.get("pageNo")).toBe("1");
      expect(url.searchParams.get("numOfRows")).toBe("100");
      expect(url.searchParams.get("_type")).toBe("json");
      // Never assert service key value beyond presence of the param name.
      expect(url.searchParams.has("serviceKey")).toBe(true);
    });
  });

  describe("R01 identity matcher predicate", () => {
    const hubRows = [
      { dongNm: "504동", bldNm: "서창센트럴푸르지오" },
    ];

    it("EXACT_IDENTITY_FAILURE_REASON = complexNameMatch UNKNOWN when hint missing", () => {
      const identity = matchBuildingRegisterIdentity(hubRows, {
        dong: "504",
        complexNameHint: null,
      });

      expect(identity.dongMatch).toBe("YES");
      expect(identity.matches).toHaveLength(1);
      expect(identity.complexNameMatch).toBe("UNKNOWN");
      expect(identity.identityVerified).toBe(false);
      // Failing predicate: isSuccessfulComplexMatch("UNKNOWN") === false
      expect(identity.failureReason).toBeNull();
    });

    it("identity_verified when research complex hint is supplied", () => {
      const identity = matchBuildingRegisterIdentity(hubRows, {
        dong: "504",
        complexNameHint: RESEARCH_COMPLEX_HINT.R01,
      });

      expect(identity.dongMatch).toBe("YES");
      expect(identity.complexNameMatch).toBe("EXACT_NORMALIZED");
      expect(identity.identityVerified).toBe(true);
      expect(identity.failureReason).toBeNull();
    });
  });

  describe("R01 production chain control flow (mock deps)", () => {
    it("missing complex hint → chain fails before VWorld (BUILDING_HUB_RESULT present)", async () => {
      const parsed = workerSmokeParsed("R01");
      const target = targetFromParsedAddress(parsed)!;
      const deps = createTrackAProductionMockDeps("R01");
      let vworldCalls = 0;
      let hubCalls = 0;
      const wrapped = {
        ...deps,
        fetchBuildingHubPage: async (
          parcel: Parameters<typeof deps.fetchBuildingHubPage>[0],
          pageNo: number,
        ) => {
          hubCalls += 1;
          return deps.fetchBuildingHubPage(parcel, pageNo);
        },
        fetchVworldGetFeature: async (params: Record<string, string>) => {
          vworldCalls += 1;
          return deps.fetchVworldGetFeature(params);
        },
      };

      const result = await runBuildingResolutionChain(target, wrapped);

      expect(hubCalls).toBeGreaterThanOrEqual(1);
      expect(vworldCalls).toBe(0);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failureReason).toBe("REGISTER_IDENTITY_UNRESOLVED");
      expect(result.stages.buildingIdentityVerified).toBe("FAILED");
    });

    it("research-equivalent target → identity_verified → VWorld → BUILDING_CENTER", async () => {
      const target = researchTarget("R01");
      const deps = createTrackAProductionMockDeps("R01");
      let vworldCalls = 0;
      const wrapped = {
        ...deps,
        fetchVworldGetFeature: async (params: Record<string, string>) => {
          vworldCalls += 1;
          return deps.fetchVworldGetFeature(params);
        },
      };

      const result = await runBuildingResolutionChain(target, wrapped);

      expect(result.ok).toBe(true);
      expect(vworldCalls).toBe(1);
      if (!result.ok) return;
      expect(result.provenance.identityProvenance).toBe(
        IdentityProvenance.BUILDING_HUB_VERIFIED,
      );
      expect(result.provenance.pinProvenance).toBe(PinProvenance.BUILDING_CENTER);
    });

    it("PublicBuildingDataAdapter with worker-style parsed address returns zero candidates", async () => {
      const parsed = workerSmokeParsed("R01");
      const adapter = new PublicBuildingDataAdapter({
        mockDeps: createTrackAProductionMockDeps("R01"),
      });
      const candidates = await adapter.resolveBuildingCandidates(parsed);
      expect(candidates).toEqual([]);
    });

    it("PublicBuildingDataAdapter with research-equivalent complexName returns BUILDING_CENTER", async () => {
      const parsed = researchEquivalentParsed("R01");
      const adapter = new PublicBuildingDataAdapter({
        mockDeps: createTrackAProductionMockDeps("R01"),
      });
      const candidates = await adapter.resolveBuildingCandidates(parsed);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.coordinateType).toBe("BUILDING_CENTER");
      expect(candidates[0]!.provider).toBe("public_building");
    });
  });

  describe.each<TrackAFixtureId>(["R01", "R02", "R03"])(
    "%s research-equivalent production path",
    (fixtureId) => {
      it("full mock chain identity_verified", async () => {
        const result = await runBuildingResolutionChain(
          researchTarget(fixtureId),
          createTrackAProductionMockDeps(fixtureId),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.provenance.identityProvenance).toBe(
          IdentityProvenance.BUILDING_HUB_VERIFIED,
        );
        expect(result.provenance.pinProvenance).toBe(
          PinProvenance.BUILDING_CENTER,
        );
      });
    },
  );

  it("R02 MODEL B still holds with research-equivalent complex hint", async () => {
    const result = await runBuildingResolutionChain(
      researchTarget("R02"),
      createTrackAProductionMockDeps("R02"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.provenance.complexCorroboration).toBe("MISSING");
  });

  it("CONTROL_FLOW: letter dong A동 is now parseable for R02-style detail", () => {
    const r02 = parseAddress({
      roadAddress: TRACK_A_PIPELINE_FIXTURES.R02.roadAddress,
      detailAddress: "A동",
    });
    expect(r02.dong).toBe("A");
    expect(r02.complexName).toBeNull();
  });
});
