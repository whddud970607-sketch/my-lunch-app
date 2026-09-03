/**
 * Research-only PNU builder (19-digit parcel unique number).
 * platGbCd (BuildingHUB) is NOT the same digit as PNU land-class field.
 */

export function mapPlatGbToPnuField(platGbCd) {
  if (platGbCd === "0" || platGbCd === 0) {
    return {
      ok: true,
      pnuField: "1",
      mapping: "BuildingHUB platGbCd 0 (non-mountain) -> PNU field 1 (general land)",
    };
  }
  if (platGbCd === "1" || platGbCd === 1) {
    return {
      ok: true,
      pnuField: "2",
      mapping: "BuildingHUB platGbCd 1 (mountain) -> PNU field 2 (mountain land)",
    };
  }
  return { ok: false, reason: "UNSUPPORTED_PLATGBCD" };
}

export function buildPnu(parcel) {
  const sigunguCd = String(parcel?.sigunguCd ?? "").trim();
  const bjdongCd = String(parcel?.bjdongCd ?? "").trim();
  const platGbCd = String(parcel?.platGbCd ?? "").trim();
  const bun = String(parcel?.bun ?? "").padStart(4, "0");
  const ji = String(parcel?.ji ?? "").padStart(4, "0");

  if (!/^\d{5}$/.test(sigunguCd)) return { ok: false, reason: "SIGUNGU_FORMAT" };
  if (!/^\d{5}$/.test(bjdongCd)) return { ok: false, reason: "BJDONG_FORMAT" };
  if (!/^\d{4}$/.test(bun)) return { ok: false, reason: "BUN_FORMAT" };
  if (!/^\d{4}$/.test(ji)) return { ok: false, reason: "JI_FORMAT" };

  const mapped = mapPlatGbToPnuField(platGbCd);
  if (!mapped.ok) return { ok: false, reason: mapped.reason };

  const legalDong = `${sigunguCd}${bjdongCd}`;
  const pnu = `${legalDong}${mapped.pnuField}${bun}${ji}`;
  if (pnu.length !== 19 || !/^\d{19}$/.test(pnu)) {
    return { ok: false, reason: "PNU_LENGTH", pnu };
  }

  return {
    ok: true,
    pnu,
    legalDong,
    pnuLandField: mapped.pnuField,
    mappingNote: mapped.mapping,
    rule: "legalDong10 + officialPnuLandField1 + bun4 + ji4 = 19",
  };
}
