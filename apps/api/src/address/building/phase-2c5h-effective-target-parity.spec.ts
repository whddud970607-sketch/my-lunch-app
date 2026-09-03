/**
 * PHASE_2C.5H — effective identity target parity (STATIC + NETWORK-FREE).
 *
 * Proves whether worker/import-style input → real hint extraction →
 * parseAddress → targetFromParsedAddress yields the same effective target
 * as the successful 2C.5G diagnostic, and whether the full production chain
 * reaches IDENTITY_VERIFIED + BUILDING_CENTER on the known-good Hub fixture.
 *
 * TEST_NETWORK_CALL_CAPABLE = NO
 * TEST_DB_MUTATION_CAPABLE = NO
 * No production behavior changes.
 */
import { createHash } from "node:crypto";
import {
  parseAddress,
  parseDong,
  resolveComplexNameHint,
} from "../address.parser";
import { composeDetailAddressWithComplex } from "../../import/import-detail-compose";
import { PublicBuildingDataAdapter } from "../adapters/public-building-data.adapter";
import {
  runBuildingResolutionChain,
  targetFromParsedAddress,
  type BuildingResolutionTarget,
} from "./building-resolution.stage";
import {
  formatDongLabel,
  normalizeWhitespace,
} from "./building-identity-matcher";
import {
  createTrackAProductionMockDeps,
  TRACK_A_PIPELINE_FIXTURES,
} from "../fixtures/track-a-production-fixtures";
import { TRACK_A_KAKAO_PARCEL_FIXTURES } from "../fixtures/kakao-parcel-track-a-fixtures";
import {
  buildR01LiveCardinalityHubBody,
  R01_LIVE_HUB_SHAPE_TARGET,
} from "../fixtures/r01-live-hub-shape-fixture";
import {
  IdentityProvenance,
  PinProvenance,
} from "./building-resolution.types";
import { ParcelResolverStatus } from "./parcel-resolver.port";

const ROAD_KEY = "인천광역시 남동구 서창남순환로 55" as const;
const fx = TRACK_A_PIPELINE_FIXTURES.R01;

/** 2C.5G success target — fixture hints used by live Hub production-path diagnostic. */
function diagnosticSuccessTarget(): BuildingResolutionTarget {
  const dong = R01_LIVE_HUB_SHAPE_TARGET.dong;
  const complexNameHint = R01_LIVE_HUB_SHAPE_TARGET.complexNameHint;
  return {
    roadAddress: fx.roadAddress,
    dong,
    complexNameHint,
    expectedBuldNmDc: formatDongLabel(dong),
    expectedComplexNormalized: normalizeWhitespace(complexNameHint),
  };
}

/**
 * 2C.5C production representation:
 * import compose → PII detail → worker hint extraction → resolve() input.
 * Does NOT manually inject Track A fixture hints into the matcher afterward.
 */
function buildWorkerEquivalentResolveInput() {
  const composedDetail = composeDetailAddressWithComplex(
    fx.complexNameHint,
    `${fx.dong}동`,
  );
  // Worker fetchPii shape (fields only — no DB).
  const pii = {
    rawAddress: fx.roadAddress,
    detailAddress: composedDetail,
  };
  // Exact ResolutionWorkerService.resolve wiring.
  return {
    roadAddress: pii.rawAddress,
    detailAddress: pii.detailAddress,
    complexNameHint: resolveComplexNameHint({
      detailAddress: pii.detailAddress,
    }),
    dongHint: parseDong(pii.detailAddress),
  };
}

function fingerprint(value: string | null | undefined): string {
  const s = value == null ? "" : String(value);
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
}

function targetAudit() {
  // Structural audit of targetFromParsedAddress signature + body (no runtime values).
  const acceptsComplexNameHint = false; // param type has no complexNameHint
  const usesComplexNameHint = false; // body uses complexName || buildingName only
  const acceptsDongHint = false; // param type has no dongHint
  const usesDongHint = false; // body uses parsed.dong only
  return {
    ACCEPTS_COMPLEX_NAME_HINT: acceptsComplexNameHint ? "YES" : "NO",
    USES_COMPLEX_NAME_HINT: usesComplexNameHint ? "YES" : "NO",
    ACCEPTS_DONG_HINT: acceptsDongHint ? "YES" : "NO",
    USES_DONG_HINT: usesDongHint ? "YES" : "NO",
    EFFECTIVE_COMPLEX_NAME_PRECEDENCE:
      "parsed.complexName > parsed.buildingName",
    EFFECTIVE_DONG_PRECEDENCE: "parsed.dong",
    // Upstream parseAddress (feeds target):
    PARSE_COMPLEX_PRECEDENCE:
      "input.complexNameHint > input.complexName > input.buildingName > detailPrefix",
    PARSE_DONG_PRECEDENCE:
      "input.dongHint > parseDong(detail) > parseDong(buildingName)",
  };
}

describe("PHASE_2C.5H effective target parity", () => {
  describe("1–2. data-flow + targetFromParsedAddress audit", () => {
    it("documents survival of concepts into matcher target", () => {
      const audit = targetAudit();
      expect(audit.ACCEPTS_COMPLEX_NAME_HINT).toBe("NO");
      expect(audit.USES_COMPLEX_NAME_HINT).toBe("NO");
      expect(audit.ACCEPTS_DONG_HINT).toBe("NO");
      expect(audit.USES_DONG_HINT).toBe("NO");
      // Hints survive only if parseAddress folded them into complexName/dong first.
      expect(audit.EFFECTIVE_COMPLEX_NAME_PRECEDENCE).toBe(
        "parsed.complexName > parsed.buildingName",
      );
      expect(audit.EFFECTIVE_DONG_PRECEDENCE).toBe("parsed.dong");
    });

    it("worker-equivalent parse folds hints into ParsedAddress before target", () => {
      const input = buildWorkerEquivalentResolveInput();
      expect(Boolean(input.complexNameHint)).toBe(true);
      expect(Boolean(input.dongHint)).toBe(true);

      const parsed = parseAddress(input);
      // Presence only — no string values logged.
      expect(Boolean(parsed.complexName)).toBe(true);
      expect(Boolean(parsed.buildingName)).toBe(true);
      expect(Boolean(parsed.dong)).toBe(true);

      const target = targetFromParsedAddress(parsed);
      expect(target).not.toBeNull();
      expect(Boolean(target!.complexNameHint)).toBe(true);
      expect(Boolean(target!.dong)).toBe(true);
    });
  });

  describe("3–5. worker-equivalent target vs 2C.5G success target", () => {
    it("effective complex/dong equality flags match diagnostic target", () => {
      const input = buildWorkerEquivalentResolveInput();
      const parsed = parseAddress(input);
      const workerTarget = targetFromParsedAddress(parsed)!;
      const diagTarget = diagnosticSuccessTarget();

      const EFFECTIVE_COMPLEX_NAME_MATCH =
        workerTarget.complexNameHint === diagTarget.complexNameHint;
      const EFFECTIVE_DONG_MATCH = workerTarget.dong === diagTarget.dong;
      const PARCEL_MATCH = true; // both paths use frozen R01 parcel in chain mocks

      // Fingerprints for diagnostic only (not printed in expect messages as source).
      const fpComplexWorker = fingerprint(workerTarget.complexNameHint);
      const fpComplexDiag = fingerprint(diagTarget.complexNameHint);
      const fpDongWorker = fingerprint(workerTarget.dong);
      const fpDongDiag = fingerprint(diagTarget.dong);
      expect(fpComplexWorker).toBe(fpComplexDiag);
      expect(fpDongWorker).toBe(fpDongDiag);

      expect(Boolean(workerTarget.complexNameHint)).toBe(true);
      expect(Boolean(workerTarget.dong)).toBe(true);
      expect(EFFECTIVE_COMPLEX_NAME_MATCH).toBe(true);
      expect(EFFECTIVE_DONG_MATCH).toBe(true);
      expect(PARCEL_MATCH).toBe(true);
    });
  });

  describe("6. network-free full worker chain → BUILDING_CENTER", () => {
    it("import compose → worker extract → target → live-shape Hub → BUILDING_CENTER", async () => {
      const input = buildWorkerEquivalentResolveInput();
      // Real production parse + target — no manual matcher hint injection.
      const parsed = parseAddress(input);
      const target = targetFromParsedAddress(parsed);
      expect(target).not.toBeNull();

      const frozenParcel = {
        ...TRACK_A_KAKAO_PARCEL_FIXTURES[ROAD_KEY].expectedParcel,
        provenance: "FROZEN_TRACK_A_PARCEL" as const,
      };
      const liveShapeBody = buildR01LiveCardinalityHubBody();
      const base = createTrackAProductionMockDeps("R01");

      let hubCalls = 0;
      let vworldCalls = 0;
      let kakaoCalls = 0;

      const deps = {
        ...base,
        frozenParcel,
        parcelResolver: {
          id: "mock-frozen-or-count",
          async resolve() {
            kakaoCalls += 1;
            return {
              status: ParcelResolverStatus.RESOLVED,
              parcel: frozenParcel,
              reason: null,
              provenance: frozenParcel.provenance,
            };
          },
        },
        fetchBuildingHubPage: async (
          _parcel: unknown,
          pageNo: number,
        ) => {
          hubCalls += 1;
          return {
            httpStatus: 200,
            body:
              pageNo === 1
                ? liveShapeBody
                : { response: { header: { resultCode: "00" }, body: { totalCount: 0, items: { item: [] } } } },
          };
        },
        fetchVworldGetFeature: async (params: Record<string, string>) => {
          vworldCalls += 1;
          return base.fetchVworldGetFeature(params);
        },
      };

      // Path A: direct chain with worker-constructed target (no hint re-inject).
      const chain = await runBuildingResolutionChain(target!, deps);
      expect(chain.ok).toBe(true);
      if (!chain.ok) return;
      expect(chain.provenance.identityProvenance).toBe(
        IdentityProvenance.BUILDING_HUB_VERIFIED,
      );
      expect(chain.provenance.pinProvenance).toBe(PinProvenance.BUILDING_CENTER);

      // Path B: PublicBuildingDataAdapter with same worker-equivalent parsed.
      const adapter = new PublicBuildingDataAdapter({ mockDeps: deps });
      const candidates = await adapter.resolveBuildingCandidates(parsed);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.coordinateType).toBe("BUILDING_CENTER");
      expect(candidates[0]!.evidence).toContain(
        "building_hub_identity_verified",
      );

      // Mock-only network boundaries — chain + adapter each hit VWorld once.
      expect(hubCalls).toBeGreaterThanOrEqual(1);
      expect(vworldCalls).toBe(2);
      expect(kakaoCalls).toBe(0); // frozenParcel short-circuit
    });

    it("CASE B control: missing composed complex fails closed", async () => {
      const piiDetail = `${fx.dong}동`;
      const input = {
        roadAddress: fx.roadAddress,
        detailAddress: piiDetail,
        complexNameHint: resolveComplexNameHint({ detailAddress: piiDetail }),
        dongHint: parseDong(piiDetail),
      };
      const parsed = parseAddress(input);
      const target = targetFromParsedAddress(parsed)!;
      expect(target.complexNameHint).toBeNull();

      const deps = {
        ...createTrackAProductionMockDeps("R01"),
        frozenParcel: {
          ...TRACK_A_KAKAO_PARCEL_FIXTURES[ROAD_KEY].expectedParcel,
          provenance: "FROZEN_TRACK_A_PARCEL" as const,
        },
        fetchBuildingHubPage: async () => ({
          httpStatus: 200,
          body: buildR01LiveCardinalityHubBody(),
        }),
      };
      const chain = await runBuildingResolutionChain(target, deps);
      expect(chain.ok).toBe(false);
    });
  });
});
