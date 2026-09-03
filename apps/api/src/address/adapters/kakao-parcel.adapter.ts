import type { ConfigService } from "@nestjs/config";
import {
  createKakaoAddressParcelAdapter,
  createMockKakaoAddressParcelAdapter,
} from "../building/kakao-parcel.mapper";
import type { ParcelResolver } from "../building/parcel-resolver.port";

export function createLiveKakaoParcelResolver(
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): ParcelResolver {
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

export function createMockKakaoParcelResolver(
  fixtureByRoad: Record<string, { httpStatus: number; body: object | null }>,
): ParcelResolver {
  return createMockKakaoAddressParcelAdapter(fixtureByRoad);
}

export function isKakaoParcelConfigured(config: ConfigService): boolean {
  return Boolean(config.get<string>("KAKAO_REST_API_KEY")?.trim());
}
