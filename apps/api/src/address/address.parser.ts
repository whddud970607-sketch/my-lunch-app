import type { AddressResolutionInput, ParsedAddress } from "./address.types";

const DONG_RE = /(\d+)\s*동/;
const HO_RE = /(\d+)\s*호/;
const BUILDING_BEFORE_DONG_RE = /^(.+?)\s+\d+\s*동/;

/** Collapse whitespace — aligned with import.normalizer address handling. */
export function normalizeAddressWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function parseDong(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(DONG_RE);
  return match ? match[1] : null;
}

export function parseHo(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(HO_RE);
  return match ? match[1] : null;
}

export function parseBuildingFromDetail(
  detail: string | null | undefined,
): string | null {
  if (!detail) return null;
  const match = String(detail).match(BUILDING_BEFORE_DONG_RE);
  return match ? match[1].trim() : null;
}

/**
 * REUSE: string-level parsing only — no geocode calls.
 * EXTEND: dong/ho/complex extraction for resolution pipeline.
 */
export function parseAddress(input: AddressResolutionInput): ParsedAddress {
  const road = normalizeAddressWhitespace(input.roadAddress);
  const detail = input.detailAddress
    ? normalizeAddressWhitespace(input.detailAddress)
    : null;
  const complexName = input.complexName
    ? normalizeAddressWhitespace(input.complexName)
    : null;
  const buildingName =
    (input.buildingName && normalizeAddressWhitespace(input.buildingName)) ||
    parseBuildingFromDetail(detail) ||
    complexName;

  const dong = parseDong(detail) ?? parseDong(buildingName);
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
