import {
  asExactDongCandidate,
  exactComplexAndDong,
  stripSearchHtml,
  type DongCoordinateCandidate,
} from "../dong-coordinate-candidate";
import { normalizeCanonicalDong } from "../apartment-dong-match";
import { naverLocalMapToWgs84 } from "../naver-local-coord";

export type NaverLocalFetchFn = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

type NaverLocalItem = {
  title?: string;
  address?: string;
  roadAddress?: string;
  category?: string;
  mapx?: string | number;
  mapy?: string | number;
};

/**
 * NAVER API HUB Local Search — place_candidate_source only.
 * Does NOT guarantee every apartment dong exists.
 * Auth: X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY (not Developers X-Naver-*).
 * Endpoint: https://naverapihub.apigw.ntruss.com/search/v1/local
 * Credentials: NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET
 */
export class NaverLocalSearchAdapter {
  readonly providerId = "naver_local" as const;

  constructor(
    private readonly clientId: string | null | undefined,
    private readonly clientSecret: string | null | undefined,
    private readonly fetchFn: NaverLocalFetchFn = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.clientId?.trim() && this.clientSecret?.trim());
  }

  /**
   * Query Local Search for exact dong candidates.
   * B/C (wrong-only or empty) → [] — never promote first hit.
   */
  async lookupExactDongCandidates(args: {
    buildingName: string;
    dong: string;
    roadAddress?: string | null;
  }): Promise<DongCoordinateCandidate[]> {
    if (!this.isConfigured()) return [];
    const building = args.buildingName.trim();
    const requestedDong = normalizeCanonicalDong(args.dong);
    if (!building || !requestedDong) return [];

    const queries = [`${building} ${requestedDong}`];
    const road = args.roadAddress?.trim();
    if (road) queries.push(`${road} ${building} ${requestedDong}`);

    const out: DongCoordinateCandidate[] = [];
    const seen = new Set<string>();

    for (const query of queries) {
      const items = await this.searchLocal(query);
      for (const item of items) {
        const title = stripSearchHtml(item.title);
        const verdict = exactComplexAndDong({
          buildingName: building,
          requestedDong,
          title,
          address: item.address,
          roadAddress: item.roadAddress,
          categoryName: item.category,
        });
        if (!verdict.accepted || !verdict.matchedDong) continue;

        const wgs = naverLocalMapToWgs84(item.mapx, item.mapy);
        if (!wgs) continue;

        const key = `${wgs.latitude.toFixed(7)},${wgs.longitude.toFixed(7)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const candidate = asExactDongCandidate({
          provider: "naver",
          sourceType: "naver_local_exact_dong",
          latitude: wgs.latitude,
          longitude: wgs.longitude,
          requestedDong,
          matchedDong: verdict.matchedDong,
          confidence: 0.8,
          evidence: [
            "naver_api_hub_local_search",
            "exact_dong_and_complex",
            "wgs84_mapxy_div_1e7",
            "NOT_GUARANTEED_ALL_DONGS",
          ],
        });
        if (candidate) out.push(candidate);
      }
      if (out.length > 0) break;
    }
    return out;
  }

  private async searchLocal(query: string): Promise<NaverLocalItem[]> {
    const url = new URL(
      "https://naverapihub.apigw.ntruss.com/search/v1/local",
    );
    url.searchParams.set("query", query);
    url.searchParams.set("display", "5");
    url.searchParams.set("format", "json");
    const res = await this.fetchFn(url.toString(), {
      method: "GET",
      headers: {
        "X-NCP-APIGW-API-KEY-ID": this.clientId!.trim(),
        "X-NCP-APIGW-API-KEY": this.clientSecret!.trim(),
      },
    });
    if (res.status !== 200) return [];
    const body = (await res.json().catch(() => null)) as {
      items?: NaverLocalItem[];
    } | null;
    return body?.items ?? [];
  }
}
