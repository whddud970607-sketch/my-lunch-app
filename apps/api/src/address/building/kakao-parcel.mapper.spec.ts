import {
  createKakaoAddressParcelAdapter,
  createMockKakaoAddressParcelAdapter,
  KAKAO_PARCEL_PROVENANCE,
  mapStructuredAddressToParcel,
  pad4,
  resolveFromKakaoAddressResponse,
} from "./kakao-parcel.mapper";
import { ParcelResolverStatus } from "./parcel-resolver.port";
import {
  buildMockFixtureMap,
  TRACK_A_KAKAO_PARCEL_FIXTURES,
} from "../fixtures/kakao-parcel-track-a-fixtures";

function singleDoc(address: Record<string, unknown>, roadAddress: Record<string, unknown> = {}) {
  return {
    documents: [{ address, road_address: roadAddress }],
  };
}

describe("kakao-parcel.mapper", () => {
  describe("pad4", () => {
    it("pads numeric strings", () => {
      expect(pad4("24")).toBe("0024");
      expect(pad4("")).toBe("0000");
    });
  });

  describe("resolveFromKakaoAddressResponse", () => {
    it("single valid document → RESOLVED", () => {
      const result = resolveFromKakaoAddressResponse(
        200,
        singleDoc({
          b_code: "2820010500",
          mountain_yn: "N",
          main_address_no: "682",
          sub_address_no: "",
        }),
      );
      expect(result.status).toBe(ParcelResolverStatus.RESOLVED);
      expect(result.parcel?.sigunguCd).toBe("28200");
      expect(result.parcel?.bjdongCd).toBe("10500");
      expect(result.parcel?.platGbCd).toBe("0");
      expect(result.parcel?.bun).toBe("0682");
      expect(result.parcel?.ji).toBe("0000");
      expect(result.provenance).toBe(KAKAO_PARCEL_PROVENANCE);
    });

    it("empty documents → UNRESOLVED", () => {
      const result = resolveFromKakaoAddressResponse(200, { documents: [] });
      expect(result.status).toBe(ParcelResolverStatus.UNRESOLVED);
      expect(result.reason).toBe("NO_DOCUMENTS");
    });

    it("multiple documents → AMBIGUOUS", () => {
      const multi = resolveFromKakaoAddressResponse(200, {
        documents: [
          {
            address: {
              b_code: "2820010500",
              mountain_yn: "N",
              main_address_no: "1",
              sub_address_no: "",
            },
          },
          {
            address: {
              b_code: "2820010500",
              mountain_yn: "N",
              main_address_no: "2",
              sub_address_no: "",
            },
          },
        ],
      });
      expect(multi.status).toBe(ParcelResolverStatus.AMBIGUOUS);
      expect(multi.reason).toBe("MULTI_DOCUMENT_NO_AUTO_SELECT");
    });

    it("missing address block → UNRESOLVED", () => {
      const result = resolveFromKakaoAddressResponse(200, { documents: [{}] });
      expect(result.status).toBe(ParcelResolverStatus.UNRESOLVED);
      expect(result.reason).toBe("ADDRESS_BLOCK_MISSING");
    });

    it("invalid b_code → UNRESOLVED", () => {
      const result = resolveFromKakaoAddressResponse(
        200,
        singleDoc({
          b_code: "123",
          mountain_yn: "N",
          main_address_no: "682",
          sub_address_no: "",
        }),
      );
      expect(result.status).toBe(ParcelResolverStatus.UNRESOLVED);
      expect(result.reason).toBe("INVALID_B_CODE");
    });

    it("invalid mountain_yn → UNRESOLVED", () => {
      const result = resolveFromKakaoAddressResponse(
        200,
        singleDoc({
          b_code: "2820010500",
          mountain_yn: "X",
          main_address_no: "682",
          sub_address_no: "",
        }),
      );
      expect(result.status).toBe(ParcelResolverStatus.UNRESOLVED);
      expect(result.reason).toBe("INVALID_MOUNTAIN_YN");
    });

    it("missing main_address_no → UNRESOLVED", () => {
      const result = resolveFromKakaoAddressResponse(
        200,
        singleDoc({
          b_code: "2820010500",
          mountain_yn: "N",
          sub_address_no: "",
        }),
      );
      expect(result.status).toBe(ParcelResolverStatus.UNRESOLVED);
      expect(result.reason).toBe("MAIN_ADDRESS_NO_MISSING");
    });

    it("provider HTTP/auth failure → PROVIDER_ERROR", async () => {
      const auth = resolveFromKakaoAddressResponse(401, null);
      expect(auth.status).toBe(ParcelResolverStatus.PROVIDER_ERROR);
      expect(auth.reason).toBe("KAKAO_AUTH_ERROR");

      const http = resolveFromKakaoAddressResponse(500, null);
      expect(http.status).toBe(ParcelResolverStatus.PROVIDER_ERROR);
      expect(http.reason).toBe("KAKAO_HTTP_ERROR");

      const adapter = createKakaoAddressParcelAdapter({
        fetchAddressSearch: async () => {
          throw new Error("network down");
        },
      });
      const fetchErr = await adapter.resolve("any");
      expect(fetchErr.status).toBe(ParcelResolverStatus.PROVIDER_ERROR);
      expect(fetchErr.reason).toBe("FETCH_ERROR");
    });
  });

  describe("mapStructuredAddressToParcel", () => {
    it("empty sub_address_no → ji 0000", () => {
      const mapped = mapStructuredAddressToParcel({
        b_code: "2820010500",
        mountain_yn: "N",
        main_address_no: "682",
        sub_address_no: "",
      });
      expect(mapped.ok).toBe(true);
      if (mapped.ok) expect(mapped.parcel.ji).toBe("0000");
    });

    it("mountain Y mapping", () => {
      const mapped = mapStructuredAddressToParcel({
        b_code: "2820010500",
        mountain_yn: "Y",
        main_address_no: "10",
        sub_address_no: "3",
      });
      expect(mapped.ok).toBe(true);
      if (mapped.ok) {
        expect(mapped.parcel.platGbCd).toBe("1");
        expect(mapped.parcel.bun).toBe("0010");
        expect(mapped.parcel.ji).toBe("0003");
      }
    });

    it("never maps road building numbers to bun/ji", () => {
      const mapped = mapStructuredAddressToParcel({
        b_code: "2820010500",
        mountain_yn: "N",
        main_address_no: "682",
        sub_address_no: "",
      });
      expect(mapped.ok).toBe(true);
      if (mapped.ok) {
        expect(mapped.parcel.bun).toBe("0682");
        expect(mapped.parcel.bun).not.toBe("0055");
      }
    });
  });

  describe("Track A mock fixtures", () => {
    it("R01/R02/R03 resolve via mock adapter", async () => {
      const adapter = createMockKakaoAddressParcelAdapter(buildMockFixtureMap());

      for (const [roadAddress, fixture] of Object.entries(TRACK_A_KAKAO_PARCEL_FIXTURES)) {
        const result = await adapter.resolve(roadAddress);
        expect(result.status).toBe(ParcelResolverStatus.RESOLVED);
        expect(result.parcel).toEqual({
          ...fixture.expectedParcel,
          provenance: KAKAO_PARCEL_PROVENANCE,
        });
      }
    });
  });
});
