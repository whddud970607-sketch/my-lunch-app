import assert from "node:assert/strict";
import test from "node:test";
import {
  createKakaoAddressParcelAdapter,
  createMockKakaoAddressParcelAdapter,
  mapStructuredAddressToParcel,
  pad4,
  resolveFromKakaoAddressResponse,
  KAKAO_PARCEL_PROVENANCE,
} from "./kakao-address-parcel.adapter.mjs";
import { ParcelResolverStatus } from "./parcel-resolver.port.mjs";
import { buildMockFixtureMap, TRACK_A_KAKAO_PARCEL_FIXTURES } from "./fixtures/kakao-parcel-track-a-fixtures.mjs";

function singleDoc(address, roadAddress = {}) {
  return {
    documents: [{ address, road_address: roadAddress }],
  };
}

test("pad4 pads numeric strings", () => {
  assert.equal(pad4("24"), "0024");
  assert.equal(pad4(""), "0000");
});

test("single valid document → RESOLVED", () => {
  const result = resolveFromKakaoAddressResponse(
    200,
    singleDoc({
      b_code: "2820010500",
      mountain_yn: "N",
      main_address_no: "682",
      sub_address_no: "",
    }),
  );
  assert.equal(result.status, ParcelResolverStatus.RESOLVED);
  assert.equal(result.parcel.sigunguCd, "28200");
  assert.equal(result.parcel.bjdongCd, "10500");
  assert.equal(result.parcel.platGbCd, "0");
  assert.equal(result.parcel.bun, "0682");
  assert.equal(result.parcel.ji, "0000");
  assert.equal(result.provenance, KAKAO_PARCEL_PROVENANCE);
});

test("empty documents → UNRESOLVED", () => {
  const result = resolveFromKakaoAddressResponse(200, { documents: [] });
  assert.equal(result.status, ParcelResolverStatus.UNRESOLVED);
  assert.equal(result.reason, "NO_DOCUMENTS");
});

test("multiple documents → AMBIGUOUS", () => {
  const multi = resolveFromKakaoAddressResponse(200, {
    documents: [
      { address: { b_code: "2820010500", mountain_yn: "N", main_address_no: "1", sub_address_no: "" } },
      { address: { b_code: "2820010500", mountain_yn: "N", main_address_no: "2", sub_address_no: "" } },
    ],
  });
  assert.equal(multi.status, ParcelResolverStatus.AMBIGUOUS);
  assert.equal(multi.reason, "MULTI_DOCUMENT_NO_AUTO_SELECT");
});

test("missing address block → UNRESOLVED", () => {
  const result = resolveFromKakaoAddressResponse(200, { documents: [{}] });
  assert.equal(result.status, ParcelResolverStatus.UNRESOLVED);
  assert.equal(result.reason, "ADDRESS_BLOCK_MISSING");
});

test("invalid b_code → UNRESOLVED", () => {
  const result = resolveFromKakaoAddressResponse(
    200,
    singleDoc({
      b_code: "123",
      mountain_yn: "N",
      main_address_no: "682",
      sub_address_no: "",
    }),
  );
  assert.equal(result.status, ParcelResolverStatus.UNRESOLVED);
  assert.equal(result.reason, "INVALID_B_CODE");
});

test("invalid mountain_yn → UNRESOLVED", () => {
  const result = resolveFromKakaoAddressResponse(
    200,
    singleDoc({
      b_code: "2820010500",
      mountain_yn: "X",
      main_address_no: "682",
      sub_address_no: "",
    }),
  );
  assert.equal(result.status, ParcelResolverStatus.UNRESOLVED);
  assert.equal(result.reason, "INVALID_MOUNTAIN_YN");
});

test("missing main_address_no → UNRESOLVED", () => {
  const result = resolveFromKakaoAddressResponse(
    200,
    singleDoc({
      b_code: "2820010500",
      mountain_yn: "N",
      sub_address_no: "",
    }),
  );
  assert.equal(result.status, ParcelResolverStatus.UNRESOLVED);
  assert.equal(result.reason, "MAIN_ADDRESS_NO_MISSING");
});

test("empty sub_address_no → ji 0000", () => {
  const mapped = mapStructuredAddressToParcel({
    b_code: "2820010500",
    mountain_yn: "N",
    main_address_no: "682",
    sub_address_no: "",
  });
  assert.equal(mapped.ok, true);
  assert.equal(mapped.parcel.ji, "0000");
});

test("mountain Y mapping", () => {
  const mapped = mapStructuredAddressToParcel({
    b_code: "2820010500",
    mountain_yn: "Y",
    main_address_no: "10",
    sub_address_no: "3",
  });
  assert.equal(mapped.ok, true);
  assert.equal(mapped.parcel.platGbCd, "1");
  assert.equal(mapped.parcel.bun, "0010");
  assert.equal(mapped.parcel.ji, "0003");
});

test("never maps road building numbers to bun/ji", () => {
  const mapped = mapStructuredAddressToParcel({
    b_code: "2820010500",
    mountain_yn: "N",
    main_address_no: "682",
    sub_address_no: "",
  });
  assert.equal(mapped.parcel.bun, "0682");
  assert.notEqual(mapped.parcel.bun, "0055");
});

test("provider HTTP/auth failure → PROVIDER_ERROR", async () => {
  const auth = resolveFromKakaoAddressResponse(401, null);
  assert.equal(auth.status, ParcelResolverStatus.PROVIDER_ERROR);
  assert.equal(auth.reason, "KAKAO_AUTH_ERROR");

  const http = resolveFromKakaoAddressResponse(500, null);
  assert.equal(http.status, ParcelResolverStatus.PROVIDER_ERROR);
  assert.equal(http.reason, "KAKAO_HTTP_ERROR");

  const adapter = createKakaoAddressParcelAdapter({
    fetchAddressSearch: async () => {
      throw new Error("network down");
    },
  });
  const fetchErr = await adapter.resolve("any");
  assert.equal(fetchErr.status, ParcelResolverStatus.PROVIDER_ERROR);
  assert.equal(fetchErr.reason, "FETCH_ERROR");
});

test("TRACK A mock fixtures resolve R01/R02/R03", async () => {
  const adapter = createMockKakaoAddressParcelAdapter(buildMockFixtureMap());

  for (const [roadAddress, fixture] of Object.entries(TRACK_A_KAKAO_PARCEL_FIXTURES)) {
    const result = await adapter.resolve(roadAddress);
    assert.equal(result.status, ParcelResolverStatus.RESOLVED, roadAddress);
    assert.deepEqual(result.parcel, {
      ...fixture.expectedParcel,
      provenance: KAKAO_PARCEL_PROVENANCE,
    });
  }
});
