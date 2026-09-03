/**
 * PHASE_2C.5D — network-free Kakao parcel selection vs frozen R01.
 *
 * TEST_NETWORK_CALL_CAPABLE = NO
 * TEST_DB_MUTATION_CAPABLE = NO
 *
 * Does not import Nest adapters that construct live fetchers.
 * Does not call BuildingHUB / Kakao / VWorld / Naver.
 */
import {
  mapStructuredAddressToParcel,
  resolveFromKakaoAddressResponse,
} from "./kakao-parcel.mapper";
import { TRACK_A_KAKAO_PARCEL_FIXTURES } from "../fixtures/kakao-parcel-track-a-fixtures";
import { TRACK_A_PIPELINE_FIXTURES } from "../fixtures/track-a-production-fixtures";
import { buildPnu } from "./pnu-builder";

const R01_ROAD = "인천광역시 남동구 서창남순환로 55" as const;

describe("kakao-parcel-selection-r01 (network-free)", () => {
  const frozen = TRACK_A_KAKAO_PARCEL_FIXTURES[R01_ROAD];

  it("frozen R01 Kakao fixture maps to expected parcel fields", () => {
    const result = resolveFromKakaoAddressResponse(
      frozen.httpStatus,
      frozen.body as never,
    );
    expect(result.status).toBe("RESOLVED");
    expect(result.parcel).toEqual({
      ...frozen.expectedParcel,
      provenance: "KAKAO_STRUCTURED_ADDRESS",
    });
  });

  it("selection rule: exactly one document → index 0; multi → no auto-select", () => {
    const singleDocs = frozen.body.documents;
    expect(singleDocs).toHaveLength(1);

    const multi = resolveFromKakaoAddressResponse(200, {
      documents: [singleDocs[0], singleDocs[0]],
    });
    expect(multi.status).toBe("AMBIGUOUS");
    expect(multi.reason).toBe("MULTI_DOCUMENT_NO_AUTO_SELECT");
    expect(multi.parcel).toBeNull();
  });

  it("parcel uses address block bun/ji — not road_address building numbers", () => {
    const address = frozen.body.documents[0]!.address as Record<
      string,
      unknown
    >;
    const mapped = mapStructuredAddressToParcel(address);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    // Structural: bun derives from main_address_no (lot), padded.
    expect(mapped.parcel.bun).toBe(frozen.expectedParcel.bun);
    expect(mapped.parcel.ji).toBe(frozen.expectedParcel.ji);
    expect(mapped.parcel.sigunguCd).toBe(frozen.expectedParcel.sigunguCd);
    expect(mapped.parcel.bjdongCd).toBe(frozen.expectedParcel.bjdongCd);
    expect(mapped.parcel.platGbCd).toBe(frozen.expectedParcel.platGbCd);
  });

  it("divergent b_code yields structural parcel inequality vs frozen R01", () => {
    const address = {
      ...(frozen.body.documents[0]!.address as Record<string, unknown>),
      b_code: "2820011000", // different legal dong vs frozen 10500
    };
    const mapped = mapStructuredAddressToParcel(address);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;

    expect(mapped.parcel.sigunguCd === frozen.expectedParcel.sigunguCd).toBe(
      true,
    );
    expect(mapped.parcel.bjdongCd === frozen.expectedParcel.bjdongCd).toBe(
      false,
    );
    expect(mapped.parcel.platGbCd === frozen.expectedParcel.platGbCd).toBe(
      true,
    );

    const frozenPnu = buildPnu(frozen.expectedParcel);
    const divergentPnu = buildPnu(mapped.parcel);
    expect(frozenPnu.ok && divergentPnu.ok).toBe(true);
    if (frozenPnu.ok && divergentPnu.ok) {
      expect(divergentPnu.pnu === frozenPnu.pnu).toBe(false);
    }
  });

  it("frozen R01 PNU matches Track A production fixture PNU", () => {
    const pnu = buildPnu(frozen.expectedParcel);
    expect(pnu.ok).toBe(true);
    if (!pnu.ok) return;
    expect(pnu.pnu).toBe(TRACK_A_PIPELINE_FIXTURES.R01.pnu);
  });
});
