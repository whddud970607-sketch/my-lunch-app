import {
  formatDongLabel,
  normalizeWhitespace,
} from "./building-identity-matcher";
import {
  runBuildingResolutionChain,
  type BuildingResolutionTarget,
} from "./building-resolution.stage";
import {
  ResolutionStageStatus,
  PinProvenance,
  IdentityProvenance,
  GeometryProvenance,
} from "./building-resolution.types";
import {
  createTrackAProductionMockDeps,
  TRACK_A_PIPELINE_FIXTURES,
  type TrackAFixtureId,
} from "../fixtures/track-a-production-fixtures";

function targetFromFixture(id: TrackAFixtureId): BuildingResolutionTarget {
  const fx = TRACK_A_PIPELINE_FIXTURES[id];
  return {
    roadAddress: fx.roadAddress,
    dong: fx.dong,
    complexNameHint: fx.complexNameHint,
    expectedBuldNmDc: formatDongLabel(fx.dong),
    expectedComplexNormalized: normalizeWhitespace(fx.complexNameHint),
  };
}

describe("track-a-production-fixtures", () => {
  describe.each<TrackAFixtureId>(["R01", "R02", "R03"])("%s full chain", (targetId) => {
    it("resolves end-to-end via runBuildingResolutionChain with mock deps", async () => {
      const target = targetFromFixture(targetId);
      const deps = createTrackAProductionMockDeps(targetId);
      const result = await runBuildingResolutionChain(target, deps);

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.latitude).toBeDefined();
      expect(result.longitude).toBeDefined();
      expect(result.pnu).toBe(TRACK_A_PIPELINE_FIXTURES[targetId].pnu);
      expect(result.stages.addressNormalized).toBe(ResolutionStageStatus.VERIFIED);
      expect(result.stages.buildingIdentityVerified).toBe(ResolutionStageStatus.VERIFIED);
      expect(result.stages.buildingGeometryVerified).toBe(ResolutionStageStatus.VERIFIED);
      expect(result.stages.buildingCenter).toBe(ResolutionStageStatus.VERIFIED);
      expect(result.provenance.identityProvenance).toBe(
        IdentityProvenance.BUILDING_HUB_VERIFIED,
      );
      expect(result.provenance.geometryProvenance).toBe(
        GeometryProvenance.VWORLD_EXACT_PNU_DONG_FEATURE,
      );
      expect(result.provenance.pinProvenance).toBe(PinProvenance.BUILDING_CENTER);
    });
  });

  it("R02 MODEL B — missing buld_nm with verified BuildingHUB identity", async () => {
    const target = targetFromFixture("R02");
    const deps = createTrackAProductionMockDeps("R02");
    const result = await runBuildingResolutionChain(target, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.provenance.complexCorroboration).toBe("MISSING");
    expect(result.provenance.identityProvenance).toBe(
      IdentityProvenance.BUILDING_HUB_VERIFIED,
    );
    expect(result.provenance.geometryProvenance).toBe(
      GeometryProvenance.VWORLD_EXACT_PNU_DONG_FEATURE,
    );
    expect(result.provenance.pinProvenance).toBe(PinProvenance.BUILDING_CENTER);
  });
});
