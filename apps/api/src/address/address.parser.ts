import type { AddressResolutionInput, ParsedAddress } from "./address.types";

/** Numeric dong: 504동 → 504 */
const NUMERIC_DONG_RE = /(\d+)\s*동/;
/**
 * Letter dong only (A–Z): A동 → A.
 * Avoid \\b after 한글 "동" (JS word-boundary is ASCII-centric).
 */
const LETTER_DONG_RE = /(?:^|[^A-Za-z0-9])([A-Za-z])\s*동(?=\s|$|[^가-힣A-Za-z])/;
const HO_RE = /(\d+)\s*호/;
/** "{complex name} {dong}동" — numeric or single Latin letter dong. */
const BUILDING_BEFORE_DONG_RE = /^(.+?)\s+(?:\d+|[A-Za-z])\s*동/;

/** Collapse whitespace — aligned with import.normalizer address handling. */
export function normalizeAddressWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = normalizeAddressWhitespace(value);
  return t === "" ? null : t;
}

/**
 * Parse dong token from detail/building text.
 * Supports deterministic forms only: 504동 → 504, A동 → A.
 */
export function parseDong(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = String(value);
  const numeric = text.match(NUMERIC_DONG_RE);
  if (numeric) return numeric[1]!;
  const letter = text.match(LETTER_DONG_RE);
  if (letter) return letter[1]!.toUpperCase();
  return null;
}

/**
 * Normalize an explicit dong hint: "504" | "504동" | "A" | "A동" → token.
 */
export function normalizeDongHint(
  value: string | null | undefined,
): string | null {
  const raw = emptyToNull(value);
  if (!raw) return null;
  const fromLabel = parseDong(raw);
  if (fromLabel) return fromLabel;
  if (/^\d+$/.test(raw)) return raw;
  if (/^[A-Za-z]$/.test(raw)) return raw.toUpperCase();
  return null;
}

export function parseHo(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(HO_RE);
  return match ? match[1]! : null;
}

export function parseBuildingFromDetail(
  detail: string | null | undefined,
): string | null {
  if (!detail) return null;
  const match = String(detail).match(BUILDING_BEFORE_DONG_RE);
  return match ? match[1]!.trim() : null;
}

/**
 * Deterministic complex-name hint precedence (address/building metadata only):
 * 1. complexNameHint (explicit Track A / import hint)
 * 2. complexName (legacy explicit field)
 * 3. buildingName (explicit)
 * 4. structured prefix extracted from detailAddress ("{name} {dong}동")
 *
 * Never uses delivery memo, customer name, or provider responses.
 */
export function resolveComplexNameHint(
  input: Pick<
    AddressResolutionInput,
    "complexNameHint" | "complexName" | "buildingName" | "detailAddress"
  >,
): string | null {
  return (
    emptyToNull(input.complexNameHint) ??
    emptyToNull(input.complexName) ??
    emptyToNull(input.buildingName) ??
    parseBuildingFromDetail(
      input.detailAddress
        ? normalizeAddressWhitespace(input.detailAddress)
        : null,
    )
  );
}

/**
 * REUSE: string-level parsing only — no geocode calls.
 * EXTEND: letter dong + complexNameHint / dongHint production parity.
 */
export function parseAddress(input: AddressResolutionInput): ParsedAddress {
  const road = normalizeAddressWhitespace(input.roadAddress);
  const detail = input.detailAddress
    ? normalizeAddressWhitespace(input.detailAddress)
    : null;

  const fromDetail = parseBuildingFromDetail(detail);
  const complexName = resolveComplexNameHint({
    complexNameHint: input.complexNameHint,
    complexName: input.complexName,
    buildingName: input.buildingName,
    detailAddress: detail,
  });
  const buildingName =
    emptyToNull(input.buildingName) ?? fromDetail ?? complexName;

  const dong =
    normalizeDongHint(input.dongHint) ??
    parseDong(detail) ??
    parseDong(buildingName);

  const ho = parseHo(detail);

  const normalizedAddress = [road, detail].filter(Boolean).join(" ").trim();

  return {
    originalAddress: normalizedAddress,
    roadAddress: road || null,
    lotAddress: null,
    complexName,
    buildingName: buildingName || null,
    dong,
    ho,
    postalCode: null,
    normalizedAddress,
    detailAddress: detail,
  };
}
