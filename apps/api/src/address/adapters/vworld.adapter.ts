import type { ConfigService } from "@nestjs/config";
import { buildGetFeatureParams } from "../building/vworld-exact-feature";
import { sanitizeOperationalError } from "../building/diagnostic-redaction";

export type VworldFetchFeature = (
  params: Record<string, string>,
) => Promise<{ httpStatus: number; text: string }>;

export function createVworldFetchFeature(
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): VworldFetchFeature {
  const key = apiKey.trim();
  if (!key) throw new Error("VWorld API key is required");

  return async (params) => {
    const url = new URL("https://api.vworld.kr/req/wfs");
    url.searchParams.set("key", key);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    try {
      const res = await fetchFn(url.toString());
      const text = await res.text();
      return { httpStatus: res.status, text };
    } catch (err) {
      const message = err instanceof Error ? err.message : "fetch_failed";
      throw new Error(
        JSON.stringify(
          sanitizeOperationalError({
            provider: "vworld",
            message,
            url: url.origin + url.pathname,
          }),
        ),
      );
    }
  };
}

export function createMockVworldFetchFeature(textByPnu: Record<string, string>): VworldFetchFeature {
  return async (params) => {
    const built = buildGetFeatureParams({
      pnu: params.filter?.match(/<Literal>(\d{19})<\/Literal>/)?.[1] ?? "",
      buldNmDc: "",
    });
    void built;
    const pnuMatch = params.filter?.match(/<Literal>(\d{19})<\/Literal>/);
    const pnu = pnuMatch?.[1] ?? "";
    return {
      httpStatus: 200,
      text: textByPnu[pnu] ?? JSON.stringify({ type: "FeatureCollection", features: [] }),
    };
  };
}

export function isVworldConfigured(config: ConfigService): boolean {
  return Boolean(config.get<string>("VWORLD_API_KEY")?.trim());
}
