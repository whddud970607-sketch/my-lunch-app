/**
 * Explicit header alias → canonical field mapping.
 * No auto-inference engine; unknown headers preserved on ImportRow.raw.
 */

export type CanonicalImportField =
  | "trackingCode"
  | "externalId"
  | "customerName"
  | "address"
  | "addressDetail"
  | "complexName"
  | "quantity"
  | "companyId"
  | "sourceId"
  | "sourceKey"
  | "serviceDate"
  | "deliveryMemo"
  | "displayLabel"
  | "barcodeRaw";

/** Required for a useful draft; missing → validation issue (not parser crash). */
export const REQUIRED_CANONICAL_FIELDS: CanonicalImportField[] = [
  "address",
  "trackingCode",
];

const ALIASES: Record<CanonicalImportField, readonly string[]> = {
  trackingCode: [
    "tracking_code",
    "trackingcode",
    "tracking",
    "송장번호",
    "운송장번호",
    "운송장",
    "송장",
  ],
  externalId: [
    "external_id",
    "externalid",
    "ext_id",
    "외부id",
    "외부아이디",
  ],
  customerName: [
    "customer_name",
    "customername",
    "customer",
    "recipient",
    "수령인",
    "고객명",
    "받는분",
  ],
  address: [
    "address",
    "addr",
    "주소",
    "배송주소",
    "도로명주소",
  ],
  addressDetail: [
    "address_detail",
    "addressdetail",
    "detail_address",
    "detail",
    "상세주소",
    "동호수",
  ],
  complexName: [
    "complex_name",
    "complexname",
    "building_name",
    "buildingname",
    "apartment_name",
    "apartmentname",
    "단지명",
    "아파트명",
    "건물명",
    "단지",
  ],
  quantity: [
    "quantity",
    "qty",
    "수량",
    "개수",
  ],
  companyId: [
    "company_id",
    "companyid",
    "company",
    "회사id",
  ],
  sourceId: [
    "source_id",
    "sourceid",
  ],
  sourceKey: [
    "source_key",
    "sourcekey",
    "source",
    "소스",
  ],
  serviceDate: [
    "service_date",
    "servicedate",
    "date",
    "배송일",
    "작업일",
  ],
  deliveryMemo: [
    "delivery_memo",
    "deliverymemo",
    "memo",
    "note",
    "배송메모",
    "메모",
    "요청사항",
  ],
  displayLabel: [
    "display_label",
    "displaylabel",
    "label",
    "표시명",
    "상품명",
  ],
  barcodeRaw: [
    "barcode_raw",
    "barcoderaw",
    "barcode",
    "바코드",
  ],
};

function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "");
}

/** Build lookup: normalized header → canonical field (first alias wins per field). */
export function buildHeaderLookup(
  customAliases?: Partial<Record<CanonicalImportField, readonly string[]>>,
): Map<string, CanonicalImportField> {
  const map = new Map<string, CanonicalImportField>();
  const fields = Object.keys(ALIASES) as CanonicalImportField[];
  for (const field of fields) {
    const list = [
      ...(ALIASES[field] ?? []),
      ...(customAliases?.[field] ?? []),
    ];
    for (const alias of list) {
      const key = normalizeHeaderKey(alias);
      if (!map.has(key)) map.set(key, field);
    }
  }
  return map;
}

export type MappedImportFields = Partial<
  Record<CanonicalImportField, string | null>
>;

export type HeaderMappingResult = {
  mapped: MappedImportFields;
  unknownHeaders: string[];
  missingRequired: CanonicalImportField[];
  /** Headers that mapped to a canonical field. */
  resolvedHeaders: string[];
};

/**
 * Map a raw CSV object (original header keys) onto canonical fields.
 * Unknown headers stay available on ImportRow.raw; listed here for warnings.
 */
export function mapHeaders(
  raw: Record<string, string | null>,
  lookup: Map<string, CanonicalImportField> = buildHeaderLookup(),
): HeaderMappingResult {
  const mapped: MappedImportFields = {};
  const unknownHeaders: string[] = [];
  const resolvedHeaders: string[] = [];
  const usedFields = new Set<CanonicalImportField>();

  for (const [header, value] of Object.entries(raw)) {
    const field = lookup.get(normalizeHeaderKey(header));
    if (!field) {
      unknownHeaders.push(header);
      continue;
    }
    resolvedHeaders.push(header);
    if (!usedFields.has(field)) {
      mapped[field] = value;
      usedFields.add(field);
    }
  }

  const missingRequired = REQUIRED_CANONICAL_FIELDS.filter(
    (f) => mapped[f] == null || String(mapped[f]).trim() === "",
  );

  return { mapped, unknownHeaders, missingRequired, resolvedHeaders };
}
