/**
 * Kakao address.json → canonical parcel identity (structured block only).
 * Never uses road_address building numbers for bun/ji.
 */

import {
  ParcelResolverStatus,
  type ParcelResolverResult,
} from "./parcel-resolver.port";

export const KAKAO_PARCEL_PROVENANCE = "KAKAO_STRUCTURED_ADDRESS";

export function pad4(value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return "0000";
  if (!/^\d+$/.test(s)) return null;
  return s.padStart(4, "0");
}

export function mapStructuredAddressToParcel(address: Record<string, unknown> | null) {
  if (!address) {
    return { ok: false as const, reason: "ADDRESS_BLOCK_MISSING" };
  }

  const bCode = address.b_code ? String(address.b_code).trim() : "";
  if (!/^\d{10}$/.test(bCode)) {
    return { ok: false as const, reason: "INVALID_B_CODE" };
  }

  const mountainYn = address.mountain_yn ?? null;
  if (mountainYn !== "Y" && mountainYn !== "N") {
    return { ok: false as const, reason: "INVALID_MOUNTAIN_YN" };
  }

  const mainNo = address.main_address_no;
  if (mainNo == null || String(mainNo).trim() === "") {
    return { ok: false as const, reason: "MAIN_ADDRESS_NO_MISSING" };
  }

  const bun = pad4(mainNo);
  if (bun == null) {
    return { ok: false as const, reason: "INVALID_MAIN_ADDRESS_NO" };
  }

  if (!("sub_address_no" in address)) {
    return { ok: false as const, reason: "SUB_ADDRESS_NO_MISSING" };
  }

  const subNo = address.sub_address_no;
  const ji = pad4(subNo === "" ? "0" : subNo);
  if (ji == null) {
    return { ok: false as const, reason: "INVALID_SUB_ADDRESS_NO" };
  }

  return {
    ok: true as const,
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

export function resolveFromKakaoAddressResponse(
  httpStatus: number,
  body: { documents?: Array<{ address?: Record<string, unknown> }> } | null,
): ParcelResolverResult {
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

export type KakaoAddressParcelAdapterOptions = {
  fetchAddressSearch: (
    roadAddress: string,
  ) => Promise<{ httpStatus: number; body: object | null }>;
};

export function createKakaoAddressParcelAdapter({
  fetchAddressSearch,
}: KakaoAddressParcelAdapterOptions) {
  if (typeof fetchAddressSearch !== "function") {
    throw new Error("fetchAddressSearch is required");
  }

  return {
    id: "kakao-address-parcel-adapter",
    async resolve(roadAddress: string): Promise<ParcelResolverResult> {
      try {
        const { httpStatus, body } = await fetchAddressSearch(roadAddress);
        return resolveFromKakaoAddressResponse(httpStatus, body as never);
      } catch {
        return {
          status: ParcelResolverStatus.PROVIDER_ERROR,
          parcel: null,
          reason: "FETCH_ERROR",
          provenance: null,
        };
      }
    },
  };
}

export function createMockKakaoAddressParcelAdapter(
  fixtureByRoadAddress: Record<string, { httpStatus: number; body: object | null }>,
) {
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
