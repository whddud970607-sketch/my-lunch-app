/**
 * Research-only Kakao address.json → canonical parcel identity adapter.
 * Uses structured address block only — never road_address building numbers for bun/ji.
 */

import { ParcelResolverStatus } from "./parcel-resolver.port.mjs";

export const KAKAO_PARCEL_PROVENANCE = "KAKAO_STRUCTURED_ADDRESS";

export function pad4(value) {
  const s = String(value ?? "").trim();
  if (!s) return "0000";
  if (!/^\d+$/.test(s)) return null;
  return s.padStart(4, "0");
}

/**
 * Map Kakao structured address block to canonical parcel fields.
 * @param {object|null} address
 * @returns {{ ok: boolean, parcel?: object, reason?: string }}
 */
export function mapStructuredAddressToParcel(address) {
  if (!address) {
    return { ok: false, reason: "ADDRESS_BLOCK_MISSING" };
  }

  const bCode = address.b_code ? String(address.b_code).trim() : "";
  if (!/^\d{10}$/.test(bCode)) {
    return { ok: false, reason: "INVALID_B_CODE" };
  }

  const mountainYn = address.mountain_yn ?? null;
  if (mountainYn !== "Y" && mountainYn !== "N") {
    return { ok: false, reason: "INVALID_MOUNTAIN_YN" };
  }

  const mainNo = address.main_address_no;
  if (mainNo == null || String(mainNo).trim() === "") {
    return { ok: false, reason: "MAIN_ADDRESS_NO_MISSING" };
  }

  const bun = pad4(mainNo);
  if (bun == null) {
    return { ok: false, reason: "INVALID_MAIN_ADDRESS_NO" };
  }

  if (!("sub_address_no" in address)) {
    return { ok: false, reason: "SUB_ADDRESS_NO_MISSING" };
  }

  const subNo = address.sub_address_no;
  const ji = pad4(subNo === "" ? "0" : subNo);
  if (ji == null) {
    return { ok: false, reason: "INVALID_SUB_ADDRESS_NO" };
  }

  return {
    ok: true,
    parcel: {
      sigunguCd: bCode.slice(0, 5),
      bjdongCd: bCode.slice(5, 10),
      platGbCd: mountainYn === "Y" ? "1" : "0",
      bun,
      ji,
      provenance: KAKAO_PARCEL_PROVENANCE,
    },
  };
}

/**
 * Pure resolver — no network. Used by adapter and unit tests.
 * @param {number} httpStatus
 * @param {object|null} body
 * @returns {import("./parcel-resolver.port.mjs").ParcelResolverResult}
 */
export function resolveFromKakaoAddressResponse(httpStatus, body) {
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      status: ParcelResolverStatus.PROVIDER_ERROR,
      parcel: null,
      reason: "KAKAO_AUTH_ERROR",
      provenance: null,
    };
  }

  if (httpStatus !== 200) {
    return {
      status: ParcelResolverStatus.PROVIDER_ERROR,
      parcel: null,
      reason: "KAKAO_HTTP_ERROR",
      provenance: null,
    };
  }

  const documents = Array.isArray(body?.documents) ? body.documents : [];

  if (documents.length === 0) {
    return {
      status: ParcelResolverStatus.UNRESOLVED,
      parcel: null,
      reason: "NO_DOCUMENTS",
      provenance: null,
    };
  }

  if (documents.length > 1) {
    return {
      status: ParcelResolverStatus.AMBIGUOUS,
      parcel: null,
      reason: "MULTI_DOCUMENT_NO_AUTO_SELECT",
      provenance: null,
    };
  }

  const mapped = mapStructuredAddressToParcel(documents[0]?.address ?? null);
  if (!mapped.ok) {
    return {
      status: ParcelResolverStatus.UNRESOLVED,
      parcel: null,
      reason: mapped.reason ?? "STRUCTURED_ADDRESS_INCOMPLETE",
      provenance: null,
    };
  }

  return {
    status: ParcelResolverStatus.RESOLVED,
    parcel: mapped.parcel,
    reason: null,
    provenance: KAKAO_PARCEL_PROVENANCE,
  };
}

/**
 * @typedef {object} KakaoAddressParcelAdapterOptions
 * @property {(roadAddress: string) => Promise<{ httpStatus: number, body: object|null }>} fetchAddressSearch
 */

/**
 * @param {KakaoAddressParcelAdapterOptions} options
 */
export function createKakaoAddressParcelAdapter({ fetchAddressSearch }) {
  if (typeof fetchAddressSearch !== "function") {
    throw new Error("fetchAddressSearch is required");
  }

  return {
    id: "kakao-address-parcel-adapter",
    async resolve(roadAddress) {
      let httpStatus;
      let body;
      try {
        ({ httpStatus, body } = await fetchAddressSearch(roadAddress));
      } catch {
        return {
          status: ParcelResolverStatus.PROVIDER_ERROR,
          parcel: null,
          reason: "FETCH_ERROR",
          provenance: null,
        };
      }

      return resolveFromKakaoAddressResponse(httpStatus, body);
    },
  };
}

/**
 * Live Kakao adapter factory — inject apiKey; no .env read in this module.
 * @param {{ apiKey: string, fetchFn?: typeof fetch }} options
 */
export function createLiveKakaoAddressParcelAdapter({ apiKey, fetchFn = fetch }) {
  if (!apiKey?.trim()) {
    throw new Error("apiKey is required for live Kakao adapter");
  }
  const key = apiKey.trim();
  return createKakaoAddressParcelAdapter({
    fetchAddressSearch: async (roadAddress) => {
      const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
      url.searchParams.set("query", roadAddress);
      const res = await fetchFn(url.toString(), {
        headers: { Authorization: `KakaoAK ${key}` },
      });
      const body = await res.json().catch(() => null);
      return { httpStatus: res.status, body };
    },
  });
}

/**
 * Mock/injection adapter for dry-run pipelines — NETWORK=0.
 * @param {Record<string, { httpStatus: number, body: object|null }>} fixtureByRoadAddress
 */
export function createMockKakaoAddressParcelAdapter(fixtureByRoadAddress) {
  return createKakaoAddressParcelAdapter({
    fetchAddressSearch: async (roadAddress) => {
      const fixture = fixtureByRoadAddress[roadAddress];
      if (!fixture) {
        return { httpStatus: 200, body: { documents: [] } };
      }
      return fixture;
    },
  });
}
