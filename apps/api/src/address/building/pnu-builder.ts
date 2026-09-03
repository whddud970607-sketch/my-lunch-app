import type { ParcelIdentity } from "./building-resolution.types";

export function mapPlatGbToPnuField(platGbCd: string | number) {
  if (platGbCd === "0" || platGbCd === 0) {
    return {
      ok: true as const,
      pnuField: "1",
      mapping: "BuildingHUB platGbCd 0 (non-mountain) -> PNU field 1 (general land)",
    };
  }
  if (platGbCd === "1" || platGbCd === 1) {
    return {
      ok: true as const,
      pnuField: "2",
      mapping: "BuildingHUB platGbCd 1 (mountain) -> PNU field 2 (mountain land)",
    };
  }
  return { ok: false as const, reason: "UNSUPPORTED_PLATGBCD" };
}

export type PnuBuildResult =
  | { ok: true; pnu: string; legalDong: string; pnuLandField: string; mappingNote: string; rule: string }
  | { ok: false; reason: string; pnu?: string };

export function buildPnu(parcel: Partial<ParcelIdentity>): PnuBuildResult {
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
