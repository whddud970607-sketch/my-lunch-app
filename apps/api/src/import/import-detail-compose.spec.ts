import { composeDetailAddressWithComplex } from "./import-detail-compose";
import { draftsToCommitRpcRows } from "./import-commit.mapper";
import type { NormalizedDeliveryDraft } from "./import.types";
import { buildHeaderLookup, mapHeaders } from "./import.header-mapping";

function baseDraft(
  overrides: Partial<NormalizedDeliveryDraft> = {},
): NormalizedDeliveryDraft {
  return {
    rowIndex: 0,
    companyId: null,
    sourceId: null,
    sourceKey: null,
    serviceDate: null,
    trackingCode: "T1",
    externalId: null,
    quantity: 1,
    quantityOrigin: "explicit",
    customerName: null,
    addressRaw: "인천광역시 남동구 서창남순환로 55",
    addressNormalized: "인천광역시 남동구 서창남순환로 55",
    detailAddress: "504동",
    complexName: null,
    deliveryMemo: null,
    displayLabel: null,
    barcodeRaw: null,
    latitude: null,
    longitude: null,
    geocodeConfidence: null,
    geocodeProvider: null,
    geocodeStatus: "pending",
    issues: [],
    ...overrides,
  };
}

describe("import complexName → detail_address fold", () => {
  it("maps 아파트명 / 단지명 headers to complexName", () => {
    const lookup = buildHeaderLookup();
    const mapped = mapHeaders(
      {
        주소: "도로",
        송장번호: "1",
        아파트명: "서창센트럴푸르지오",
        상세주소: "504동",
      },
      lookup,
    );
    expect(mapped.mapped.complexName).toBe("서창센트럴푸르지오");
    expect(mapped.mapped.addressDetail).toBe("504동");
  });

  it("commit mapper folds complexName into detailAddress", () => {
    const rows = draftsToCommitRpcRows([
      baseDraft({
        complexName: "서창센트럴푸르지오",
        detailAddress: "504동",
      }),
    ]);
    expect(rows[0]!.detailAddress).toBe("서창센트럴푸르지오 504동");
    expect(
      composeDetailAddressWithComplex("서창센트럴푸르지오", "504동"),
    ).toBe(rows[0]!.detailAddress);
  });
});
