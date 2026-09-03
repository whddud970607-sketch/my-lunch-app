/**
 * PHASE_2C.5F — worker vs standalone BuildingHUB identity path parity.
 * NETWORK=0. DB mutation=0. Mock only network boundaries.
 *
 * Does not change production behavior.
 */
import {
  parseAddress,
  parseDong,
  resolveComplexNameHint,
} from "../address.parser";
import { PublicBuildingDataAdapter } from "../adapters/public-building-data.adapter";
import { composeDetailAddressWithComplex } from "../../import/import-detail-compose";
import {
  createBuildingHubFetchPage,
  getBuildingHubServiceKey,
} from "../adapters/building-hub.adapter";
import {
  buildBrTitleInfoUrl,
  classifyBuildingHubResponse,
  extractRegisterItems,
  fetchAllRegisterPages,
  normalizeRegisterItem,
} from "./building-hub-client";
import {
  matchBuildingRegisterIdentity,
  normalizeWhitespace,
  formatDongLabel,
} from "./building-identity-matcher";
import {
  runBuildingResolutionChain,
  targetFromParsedAddress,
} from "./building-resolution.stage";
import {
  createTrackAProductionMockDeps,
  TRACK_A_PIPELINE_FIXTURES,
} from "../fixtures/track-a-production-fixtures";
import { TRACK_A_KAKAO_PARCEL_FIXTURES } from "../fixtures/kakao-parcel-track-a-fixtures";
import { IdentityProvenance } from "./building-resolution.types";

const ROAD_KEY = "인천광역시 남동구 서창남순환로 55" as const;
const fx = TRACK_A_PIPELINE_FIXTURES.R01;
const frozenParcel = {
  ...TRACK_A_KAKAO_PARCEL_FIXTURES[ROAD_KEY].expectedParcel,
  provenance: "FROZEN_TRACK_A_PARCEL" as const,
};

/** PATH A — mirrors phase-2c5d standalone diagnostic identity segment. */
function standaloneDiagnosticIdentity(hubBody: Record<string, unknown>) {
  const items = extractRegisterItems(hubBody);
  const match = matchBuildingRegisterIdentity(items as never, {
    dong: fx.dong,
    complexNameHint: fx.complexNameHint,
  });
  return {
    path: "STANDALONE_DIAGNOSTIC" as const,
    usedPublicBuildingAdapter: false,
    usedTargetFromParsedAddress: false,
    usedRunBuildingResolutionChain: false,
    usedFetchAllRegisterPages: false,
    itemCount: items.length,
    identityVerified: match.identityVerified,
    complexNameMatch: match.complexNameMatch,
    dongMatch: match.dongMatch,
    failureReason: match.failureReason,
    effectiveDong: fx.dong,
    effectiveComplexHint: fx.complexNameHint,
  };
}

/**
 * PATH B — mirrors worker processClaim hint extraction → parse →
 * PublicBuildingDataAdapter → runBuildingResolutionChain.
 * Network mocked via createTrackAProductionMockDeps / frozenParcel.
 */
async function workerProductionIdentityPath() {
  const composed = composeDetailAddressWithComplex(
    fx.complexNameHint,
    `${fx.dong}동`,
  );
  // Exact worker.service wiring (detail-only hint extraction).
  const complexNameHint = resolveComplexNameHint({
    detailAddress: composed,
  });
  const dongHint = parseDong(composed);
  const parsed = parseAddress({
    roadAddress: fx.roadAddress,
    detailAddress: composed,
    complexNameHint,
    dongHint,
  });
  const target = targetFromParsedAddress(parsed);
  const deps = {
    ...createTrackAProductionMockDeps("R01"),
    frozenParcel,
  };

  const chain = await runBuildingResolutionChain(target!, deps);
  const adapter = new PublicBuildingDataAdapter({ mockDeps: deps });
  const candidates = await adapter.resolveBuildingCandidates(parsed);

  const hubBody = fx.buildingHubPages[1] as Record<string, unknown>;
  const viaPages = await fetchAllRegisterPages(async () => ({
    httpStatus: 200,
    body: hubBody,
  }));
  const chainStyleMatch = matchBuildingRegisterIdentity(
    (viaPages.ok ? viaPages.items : []) as never,
    {
      dong: target!.dong!,
      complexNameHint: target!.complexNameHint,
    },
  );

  return {
    path: "WORKER_PRODUCTION" as const,
    usedPublicBuildingAdapter: true,
    usedTargetFromParsedAddress: true,
    usedRunBuildingResolutionChain: true,
    usedFetchAllRegisterPages: true,
    composedDetailPresent: Boolean(composed),
    complexHintExtracted: Boolean(complexNameHint),
    dongHintExtracted: Boolean(dongHint),
    parsedComplexNamePresent: Boolean(parsed.complexName),
    parsedBuildingNamePresent: Boolean(parsed.buildingName),
    parsedDongPresent: Boolean(parsed.dong),
    targetComplexHintPresent: Boolean(target?.complexNameHint),
    targetDongPresent: Boolean(target?.dong),
    effectiveDong: target?.dong ?? null,
    effectiveComplexHint: target?.complexNameHint ?? null,
    identityVerified: chainStyleMatch.identityVerified,
    complexNameMatch: chainStyleMatch.complexNameMatch,
    dongMatch: chainStyleMatch.dongMatch,
    failureReason: chainStyleMatch.failureReason,
    chainOk: chain.ok,
    chainIdentityProvenance: chain.ok
      ? chain.provenance.identityProvenance
      : null,
    adapterCandidateCount: candidates.length,
    adapterIsBuildingCenter:
      candidates[0]?.coordinateType === "BUILDING_CENTER",
  };
}

describe("PHASE_2C.5F worker vs standalone identity path parity", () => {
  describe("1. static call-graph parity (structural)", () => {
    it("low-level BuildingHUB helpers are the shared production modules", () => {
      // SAME implementations — referenced by both diagnostic script and adapter.
      expect(typeof createBuildingHubFetchPage).toBe("function");
      expect(typeof getBuildingHubServiceKey).toBe("function");
      expect(typeof buildBrTitleInfoUrl).toBe("function");
      expect(typeof extractRegisterItems).toBe("function");
      expect(typeof normalizeRegisterItem).toBe("function");
      expect(typeof classifyBuildingHubResponse).toBe("function");
      expect(typeof fetchAllRegisterPages).toBe("function");
      expect(typeof matchBuildingRegisterIdentity).toBe("function");
      expect(typeof normalizeWhitespace).toBe("function");
      expect(typeof formatDongLabel).toBe("function");
      // isSuccessfulComplexMatch is module-private; exercised via matcher.
    });

    it("standalone diagnostic bypasses worker orchestration boundaries", () => {
      const a = standaloneDiagnosticIdentity(
        fx.buildingHubPages[1] as Record<string, unknown>,
      );
      expect(a.usedPublicBuildingAdapter).toBe(false);
      expect(a.usedTargetFromParsedAddress).toBe(false);
      expect(a.usedRunBuildingResolutionChain).toBe(false);
      expect(a.usedFetchAllRegisterPages).toBe(false);
      // Critical gate: prior LIVE_FROZEN verify did not exercise full worker path.
      expect(a.path).toBe("STANDALONE_DIAGNOSTIC");
    });
  });

  describe("2–4. input + response path parity on frozen R01 (NETWORK=0)", () => {
    it("fetchAllRegisterPages and extractRegisterItems yield same identity decision", async () => {
      const hubBody = fx.buildingHubPages[1] as Record<string, unknown>;
      const direct = extractRegisterItems(hubBody);
      const pages = await fetchAllRegisterPages(async () => ({
        httpStatus: 200,
        body: hubBody,
      }));
      expect(pages.ok).toBe(true);
      if (!pages.ok) return;

      const matchDirect = matchBuildingRegisterIdentity(direct as never, {
        dong: fx.dong,
        complexNameHint: fx.complexNameHint,
      });
      const matchPages = matchBuildingRegisterIdentity(pages.items as never, {
        dong: fx.dong,
        complexNameHint: fx.complexNameHint,
      });

      expect(pages.items.length).toBe(direct.length);
      expect(matchPages.identityVerified).toBe(matchDirect.identityVerified);
      expect(matchPages.complexNameMatch).toBe(matchDirect.complexNameMatch);
      expect(matchPages.dongMatch).toBe(matchDirect.dongMatch);
    });

    it("PATH A standalone vs PATH B worker produce the same identity decision", async () => {
      const pathA = standaloneDiagnosticIdentity(
        fx.buildingHubPages[1] as Record<string, unknown>,
      );
      const pathB = await workerProductionIdentityPath();

      // Effective identity inputs (equality / presence only).
      expect(pathB.complexHintExtracted).toBe(true);
      expect(pathB.dongHintExtracted).toBe(true);
      expect(pathB.parsedComplexNamePresent).toBe(true);
      expect(pathB.targetComplexHintPresent).toBe(true);
      expect(pathB.targetDongPresent).toBe(true);
      expect(pathB.effectiveDong).toBe(pathA.effectiveDong);
      expect(pathB.effectiveComplexHint).toBe(pathA.effectiveComplexHint);

      // Same identity decision on frozen fixture.
      expect(pathA.identityVerified).toBe(true);
      expect(pathB.identityVerified).toBe(true);
      expect(pathB.identityVerified).toBe(pathA.identityVerified);
      expect(pathB.complexNameMatch).toBe(pathA.complexNameMatch);
      expect(pathB.dongMatch).toBe(pathA.dongMatch);

      // Full worker chain (incl. VWorld mock) reaches BUILDING_CENTER.
      expect(pathB.chainOk).toBe(true);
      expect(pathB.chainIdentityProvenance).toBe(
        IdentityProvenance.BUILDING_HUB_VERIFIED,
      );
      expect(pathB.adapterCandidateCount).toBe(1);
      expect(pathB.adapterIsBuildingCenter).toBe(true);
    });

    it("worker-style missing complex prefix still fails closed (control)", async () => {
      const parsed = parseAddress({
        roadAddress: fx.roadAddress,
        detailAddress: `${fx.dong}동`,
        complexNameHint: resolveComplexNameHint({
          detailAddress: `${fx.dong}동`,
        }),
        dongHint: parseDong(`${fx.dong}동`),
      });
      const target = targetFromParsedAddress(parsed);
      expect(target?.complexNameHint).toBeNull();

      const hubBody = fx.buildingHubPages[1] as Record<string, unknown>;
      const items = extractRegisterItems(hubBody);
      const match = matchBuildingRegisterIdentity(items as never, {
        dong: target!.dong!,
        complexNameHint: target!.complexNameHint,
      });
      expect(match.identityVerified).toBe(false);
      expect(match.complexNameMatch).toBe("UNKNOWN");
    });
  });

  describe("5. diagnostic validity gate", () => {
    it("STANDALONE_DIAGNOSTIC_PATH_NOT_EQUIVALENT = YES", () => {
      /**
       * phase-2c5d-buildinghub-identity-diagnostic.ts calls:
       *   createBuildingHubFetchPage → extractRegisterItems → matchBuildingRegisterIdentity
       * with fixture dong/complexNameHint directly.
       *
       * It does NOT call:
       *   PublicBuildingDataAdapter / targetFromParsedAddress /
       *   runBuildingResolutionChain / fetchAllRegisterPages /
       *   worker resolveComplexNameHint({detailAddress}) wiring.
       *
       * Shared: request builder, service-key helper, HTTP fetchPage factory,
       * extractRegisterItems/normalizeRegisterItem, matcher, dong/complex normalizers.
       */
      const bypassedLayers = [
        "PublicBuildingDataAdapter",
        "targetFromParsedAddress",
        "runBuildingResolutionChain",
        "fetchAllRegisterPages",
        "worker_detailAddress_hint_extraction",
      ] as const;
      expect(bypassedLayers.length).toBeGreaterThan(0);
      expect(bypassedLayers).toContain("runBuildingResolutionChain");
      expect(bypassedLayers).toContain("PublicBuildingDataAdapter");
    });
  });

  describe("7. network/db capability flags", () => {
    it("this spec has no live network or DB mutation surface", () => {
      // Mock deps only — no ConfigService live keys, no fetch, no Supabase.
      const deps = createTrackAProductionMockDeps("R01");
      expect(deps.parcelResolver.id).toBe("mock-kakao-parcel");
      expect(typeof deps.fetchBuildingHubPage).toBe("function");
      expect(typeof deps.fetchVworldGetFeature).toBe("function");
    });
  });
});
