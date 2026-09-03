/**
 * Research-only live fetchers for TRACK A full pilot.
 * Never logs credentials, Authorization headers, or raw responses.
 */

import {
  buildBrTitleInfoUrl,
  decodeServiceKeyOnce,
} from "./building-hub-client.mjs";

const VWORLD_WFS_BASE = "https://api.vworld.kr/req/wfs";

export function createLiveBuildingHubFetcher(serviceKey, fetchFn = fetch) {
  const key = decodeServiceKeyOnce(serviceKey);
  return async function fetchBuildingHubPage(parcel, pageNo) {
    const url = buildBrTitleInfoUrl(parcel, key, pageNo);
    const res = await fetchFn(url.toString());
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { httpStatus: res.status, body };
  };
}

export function createLiveVworldFetcher(apiKey, fetchFn = fetch) {
  const key = apiKey.trim();
  return async function fetchVworldGetFeature(params) {
    const url = new URL(VWORLD_WFS_BASE);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value);
    }
    url.searchParams.set("key", key);
    const res = await fetchFn(url.toString());
    const text = await res.text();
    if (text.toUpperCase().includes("SERVICEEXCEPTION")) {
      return { httpStatus: res.status, text: "", serviceError: true };
    }
    return { httpStatus: res.status, text };
  };
}
