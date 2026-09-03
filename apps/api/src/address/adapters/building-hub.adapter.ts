import type { ConfigService } from "@nestjs/config";
import {
  buildBrTitleInfoUrl,
  decodeServiceKeyOnce,
  extractRegisterItems,
} from "../building/building-hub-client";
import { sanitizeOperationalError } from "../building/diagnostic-redaction";
import type { ParcelIdentity } from "../building/building-resolution.types";

export type BuildingHubFetchPage = (
  parcel: ParcelIdentity,
  pageNo: number,
) => Promise<{ httpStatus: number; body: unknown }>;

export function createBuildingHubFetchPage(
  serviceKey: string,
  fetchFn: typeof fetch = fetch,
): BuildingHubFetchPage {
  const key = decodeServiceKeyOnce(serviceKey);
  if (!key) {
    throw new Error("BuildingHUB service key is required");
  }

  return async (parcel, pageNo) => {
    const url = buildBrTitleInfoUrl(parcel, key, pageNo);
    try {
      const res = await fetchFn(url.toString());
      const body = await res.json().catch(() => null);
      return { httpStatus: res.status, body };
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch_failed";
      throw new Error(
        JSON.stringify(
          sanitizeOperationalError({
            provider: "building_hub",
            message,
            url: url.origin + url.pathname,
          }),
        ),
      );
    }
  };
}

export function createMockBuildingHubFetchPage(
  pagesByTarget: Record<number, unknown>,
): BuildingHubFetchPage {
  return async (_parcel, pageNo) => ({
    httpStatus: 200,
    body: pagesByTarget[pageNo] ?? { response: { header: { resultCode: "00" }, body: { totalCount: 0, items: { item: [] } } } },
  });
}

/**
 * Canonical Nest BuildingHUB service key resolution.
 * Prefer DATA_GO_KR_SERVICE_KEY (Track A / .env.example); fall back to
 * legacy DATA_GO_SERVICE_KEY only. Never log or return via diagnostics.
 */
export function getBuildingHubServiceKey(
  config: ConfigService,
): string | null {
  const canonical = config.get<string>("DATA_GO_KR_SERVICE_KEY")?.trim();
  if (canonical) return canonical;
  const legacy = config.get<string>("DATA_GO_SERVICE_KEY")?.trim();
  if (legacy) return legacy;
  return null;
}

export function isBuildingHubConfigured(config: ConfigService): boolean {
  return getBuildingHubServiceKey(config) != null;
}

export { extractRegisterItems };
