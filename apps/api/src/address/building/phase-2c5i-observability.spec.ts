/**
 * PHASE_2C.5I — network-free observability + security redaction tests.
 *
 * TEST_NETWORK_CALL_CAPABLE = NO
 * TEST_DB_MUTATION_CAPABLE = NO
 */
import {
  parseAddress,
  parseDong,
  resolveComplexNameHint,
} from "../address.parser";
import { composeDetailAddressWithComplex } from "../../import/import-detail-compose";
import {
  runBuildingResolutionChain,
  targetFromParsedAddress,
} from "./building-resolution.stage";
import {
  DiagnosticStage,
  ResolutionDiagnosticCollector,
  emitDiagnostic,
} from "./resolution-diagnostic-trace";
import {
  createTrackAProductionMockDeps,
  TRACK_A_PIPELINE_FIXTURES,
} from "../fixtures/track-a-production-fixtures";
import { TRACK_A_KAKAO_PARCEL_FIXTURES } from "../fixtures/kakao-parcel-track-a-fixtures";
import { buildR01LiveCardinalityHubBody } from "../fixtures/r01-live-hub-shape-fixture";
import {
  IdentityProvenance,
  PinProvenance,
} from "./building-resolution.types";

const ROAD_KEY = "인천광역시 남동구 서창남순환로 55" as const;
const fx = TRACK_A_PIPELINE_FIXTURES.R01;

const SENTINELS = {
  address: "SENTINEL_RAW_ADDRESS_XYZ_금지누출",
  detail: "SENTINEL_DETAIL_ADDR_ABC_금지누출",
  customer: "SENTINEL_CUSTOMER_NAME_금지",
  phone: "010-9999-8888",
  memo: "SENTINEL_MEMO_출입비밀번호_1234",
  accessSecret: "SENTINEL_ACCESS_SECRET_VALUE",
  jwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.SENTINEL_PAYLOAD.SIG",
  apiKey: "KakaoAK SENTINEL_API_KEY_VALUE_12345678",
  serviceKey: "serviceKey=SENTINEL_SERVICE_KEY_ABCDEF",
};

function workerEquivalentInput() {
  const composed = composeDetailAddressWithComplex(
    fx.complexNameHint,
    `${fx.dong}동`,
  );
  return {
    roadAddress: fx.roadAddress,
    detailAddress: composed,
    complexNameHint: resolveComplexNameHint({ detailAddress: composed }),
    dongHint: parseDong(composed),
  };
}

function mockDepsWithLiveShape(trace: ResolutionDiagnosticCollector | null) {
  const frozenParcel = {
    ...TRACK_A_KAKAO_PARCEL_FIXTURES[ROAD_KEY].expectedParcel,
    provenance: "FROZEN_TRACK_A_PARCEL" as const,
  };
  const base = createTrackAProductionMockDeps("R01");
  const liveBody = buildR01LiveCardinalityHubBody();
  return {
    ...base,
    frozenParcel,
    diagnosticTrace: trace,
    fetchBuildingHubPage: async (_p: unknown, pageNo: number) => ({
      httpStatus: 200,
      body:
        pageNo === 1
          ? liveBody
          : {
              response: {
                header: { resultCode: "00" },
                body: { totalCount: 0, items: { item: [] } },
              },
            },
    }),
  };
}

describe("PHASE_2C.5I runtime observability gate", () => {
  describe("network-free stage trace", () => {
    it("emits required stages through BUILDING_CENTER without changing result", async () => {
      const input = workerEquivalentInput();
      emitDiagnostic(null, DiagnosticStage.INPUT_RECEIVED, {}); // no-op sanity

      const parsed = parseAddress(input);
      const target = targetFromParsedAddress(parsed)!;

      const withTrace = new ResolutionDiagnosticCollector();
      withTrace.emit(DiagnosticStage.INPUT_RECEIVED, {
        hasComplexNameHint: Boolean(input.complexNameHint),
        hasDongHint: Boolean(input.dongHint),
      });
      withTrace.emit(DiagnosticStage.HINTS_EXTRACTED, {
        hasComplexNameHint: Boolean(input.complexNameHint),
        hasDongHint: Boolean(input.dongHint),
      });
      withTrace.emit(DiagnosticStage.ADDRESS_PARSED, {
        hasParsedComplexName: Boolean(parsed.complexName),
        hasParsedDong: Boolean(parsed.dong),
      });

      const traced = await runBuildingResolutionChain(
        target,
        mockDepsWithLiveShape(withTrace),
      );
      const plain = await runBuildingResolutionChain(
        target,
        mockDepsWithLiveShape(null),
      );

      expect(traced.ok).toBe(true);
      expect(plain.ok).toBe(true);
      if (!traced.ok || !plain.ok) return;

      expect(traced.provenance.identityProvenance).toBe(
        IdentityProvenance.BUILDING_HUB_VERIFIED,
      );
      expect(traced.provenance.pinProvenance).toBe(PinProvenance.BUILDING_CENTER);
      expect(traced.ok).toBe(plain.ok);
      expect(traced.latitude).toBe(plain.latitude);
      expect(traced.longitude).toBe(plain.longitude);
      expect(traced.pnu).toBe(plain.pnu);
      expect(traced.failureReason).toBe(plain.failureReason);

      const stages = withTrace.stagesSeen();
      expect(stages).toContain(DiagnosticStage.HINTS_EXTRACTED);
      expect(stages).toContain(DiagnosticStage.ADDRESS_PARSED);
      expect(stages).toContain(DiagnosticStage.PARCEL_RESOLVED);
      expect(stages).toContain(DiagnosticStage.BUILDING_HUB_RESPONSE_CLASSIFIED);
      expect(stages).toContain(DiagnosticStage.REGISTER_CANDIDATES_NORMALIZED);
      expect(stages).toContain(DiagnosticStage.REGISTER_IDENTITY_MATCHED);
      expect(stages).toContain(DiagnosticStage.PNU_BUILT);
      expect(stages).toContain(DiagnosticStage.VWORLD_GEOMETRY_RESULT);
      expect(stages).toContain(DiagnosticStage.INTERIOR_POINT_RESULT);
      expect(stages).toContain(DiagnosticStage.FINAL_RESOLUTION_DECISION);

      const identityEvt = withTrace
        .toSafeReport()
        .stages.find(
          (s) => s.stage === DiagnosticStage.REGISTER_IDENTITY_MATCHED,
        );
      expect(identityEvt?.payload.identityVerified).toBe(true);
      expect(withTrace.fingerprintStable("parcel")).toBe(true);
      expect(withTrace.fingerprintStable("complex")).toBe(true);
      expect(withTrace.fingerprintStable("dong")).toBe(true);

      const json = withTrace.serializeSafeJson();
      // Stability flags may mention "Fingerprint" in key names; digests must not appear.
      expect(json).not.toMatch(/"[a-f0-9]{64}"/);
      expect(json).not.toContain(fx.complexNameHint);
      expect(json).not.toContain(fx.roadAddress);
    });

    it("TRACE_CHANGES_RESOLUTION_RESULT = NO when collector absent vs present", async () => {
      const input = workerEquivalentInput();
      const target = targetFromParsedAddress(parseAddress(input))!;
      const a = await runBuildingResolutionChain(
        target,
        mockDepsWithLiveShape(new ResolutionDiagnosticCollector()),
      );
      const b = await runBuildingResolutionChain(
        target,
        mockDepsWithLiveShape(null),
      );
      expect(JSON.stringify({ ok: a.ok, pnu: a.ok ? a.pnu : null, fr: a.failureReason })).toBe(
        JSON.stringify({ ok: b.ok, pnu: b.ok ? b.pnu : null, fr: b.failureReason }),
      );
    });
  });

  describe("security redaction", () => {
    it("serialized trace never contains sentinel PII/secrets/provider bodies", () => {
      const collector = new ResolutionDiagnosticCollector();

      // Attempt to smuggle forbidden keys — sanitizer must drop them.
      collector.emit(DiagnosticStage.INPUT_RECEIVED, {
        hasComplexNameHint: true,
        address: SENTINELS.address,
        roadAddress: SENTINELS.address,
        detailAddress: SENTINELS.detail,
        complexName: SENTINELS.customer,
        dong: "504",
        customerName: SENTINELS.customer,
        phone: SENTINELS.phone,
        memo: SENTINELS.memo,
        accessSecret: SENTINELS.accessSecret,
        jwt: SENTINELS.jwt,
        apiKey: SENTINELS.apiKey,
        serviceKey: SENTINELS.serviceKey,
        latitude: 37.5,
        longitude: 126.7,
        body: { response: { items: [{ bldNm: SENTINELS.customer }] } },
        raw: SENTINELS.detail,
        url: `https://example.com?${SENTINELS.serviceKey}`,
        fingerprint: "should_not_appear",
      });

      collector.recordFingerprint("complex", SENTINELS.customer);
      collector.recordFingerprint("dong", SENTINELS.phone);
      collector.recordFingerprint("parcel", SENTINELS.address);

      const json = collector.serializeSafeJson();

      for (const value of Object.values(SENTINELS)) {
        expect(json).not.toContain(value);
      }
      expect(json).not.toContain("010-9999");
      expect(json).not.toContain("KakaoAK");
      expect(json).not.toContain("serviceKey=");
      expect(json).not.toContain("eyJhbGciOi");
      expect(json).not.toContain("37.5");
      expect(json).not.toContain("126.7");
      expect(json).not.toContain("bldNm");
      expect(json).not.toContain("should_not_appear");

      // Fingerprint digests must not leak into safe report.
      expect(json).not.toMatch(/"[a-f0-9]{64}"/);
      expect(collector.toSafeReport().stages[0]!.payload).toEqual({
        hasComplexNameHint: true,
      });
    });

    it("worker-equivalent happy path serialize excludes fixture complex/dong literals", async () => {
      const input = workerEquivalentInput();
      const target = targetFromParsedAddress(parseAddress(input))!;
      const collector = new ResolutionDiagnosticCollector();
      collector.emit(DiagnosticStage.INPUT_RECEIVED, {
        hasComplexNameHint: true,
        hasDongHint: true,
      });
      await runBuildingResolutionChain(
        target,
        mockDepsWithLiveShape(collector),
      );
      const json = collector.serializeSafeJson();
      expect(json).not.toContain(fx.complexNameHint);
      expect(json).not.toContain(fx.roadAddress);
      expect(json).not.toContain("504동");
      expect(json).not.toContain(fx.dong);
    });
  });
});
