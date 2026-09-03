/**
 * Compose import complex/building name into detail_address for persistence.
 * No new DB column — detail_address carries structured "{complex} {dong…}".
 * Never uses delivery memo.
 */

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

/**
 * Fold explicit complexName into detailAddress without double-prefixing.
 */
export function composeDetailAddressWithComplex(
  complexName: string | null | undefined,
  detailAddress: string | null | undefined,
): string | null {
  const complex = emptyToNull(complexName);
  const detail = emptyToNull(detailAddress);
  if (!complex && !detail) return null;
  if (!complex) return detail;
  if (!detail) return complex;

  const nComplex = complex.replace(/\s+/g, "");
  const nDetail = detail.replace(/\s+/g, "");
  if (nDetail.startsWith(nComplex)) return detail;
  return `${complex} ${detail}`;
}
