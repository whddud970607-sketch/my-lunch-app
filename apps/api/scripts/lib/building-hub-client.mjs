/**
 * Research-only BuildingHUB client helpers.
 * Network fetch is isolated — dry-run orchestrator does not invoke it.
 */

export const DEFAULT_PAGE_SIZE = 100;

export function decodeServiceKeyOnce(rawKey) {
  if (!rawKey) return null;
  try {
    return decodeURIComponent(rawKey.trim());
  } catch {
    return rawKey.trim();
  }
}

export function paginationPlan(totalCount, numOfRows = DEFAULT_PAGE_SIZE) {
  const total = Number(totalCount) || 0;
  if (total <= 0) return { pageCount: 0, pages: [] };
  const pageCount = Math.ceil(total / numOfRows);
  const pages = [];
  for (let pageNo = 1; pageNo <= pageCount; pageNo++) {
    pages.push({ pageNo, numOfRows });
  }
  return { pageCount, pages, totalCount: total };
}

export function normalizeRegisterItem(item) {
  if (!item || typeof item !== "object") return item;
  const pick = (...names) => {
    for (const name of names) {
      if (item[name] != null && String(item[name]).trim() !== "") return item[name];
    }
    const entries = Object.entries(item);
    for (const name of names) {
      const hit = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
      if (hit && hit[1] != null && String(hit[1]).trim() !== "") return hit[1];
    }
    return null;
  };
  return {
    ...item,
    dongNm: pick("dongNm", "DONG_NM", "dong_nm"),
    bldNm: pick("bldNm", "BLD_NM", "bld_nm"),
    platPlc: pick("platPlc", "PLAT_PLC", "plat_plc"),
    newPlatPlc: pick("newPlatPlc", "NEW_PLAT_PLC", "new_plat_plc"),
  };
}

export function extractRegisterItems(body) {
  const items =
    body?.response?.body?.items?.item ??
    body?.response?.body?.items ??
    body?.body?.items?.item ??
    [];
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list.map(normalizeRegisterItem);
}

export function extractRegisterHeader(body) {
  const header = body?.response?.header ?? body?.header ?? {};
  const resultCode = header.resultCode ?? header.resultcode ?? null;
  const resultMsg = header.resultMsg ?? header.resultmsg ?? null;
  const totalCount =
    body?.response?.body?.totalCount ??
    body?.response?.body?.totalcount ??
    null;
  return { resultCode, resultMsg, totalCount: totalCount != null ? Number(totalCount) : null };
}

export function classifyBuildingHubResponse(httpStatus, body) {
  const { resultCode, resultMsg, totalCount } = extractRegisterHeader(body);
  if (httpStatus === 401 || httpStatus === 403) {
    return { kind: "AUTH_ERROR", resultCode, resultMsg, totalCount };
  }
  if (httpStatus >= 500) {
    return { kind: "HTTP_ERROR", resultCode, resultMsg, totalCount };
  }
  if (httpStatus !== 200) {
    return { kind: "HTTP_ERROR", resultCode, resultMsg, totalCount };
  }
  const okCode = resultCode === "00" || resultCode === "0" || resultCode === "NORMAL_CODE";
  if (!okCode) {
    return { kind: "API_ERROR", resultCode, resultMsg, totalCount };
  }
  return { kind: "OK", resultCode, resultMsg, totalCount };
}

export function buildBrTitleInfoUrl(parcel, serviceKey, pageNo = 1, numOfRows = DEFAULT_PAGE_SIZE) {
  const base = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";
  const url = new URL(base);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("sigunguCd", parcel.sigunguCd);
  url.searchParams.set("bjdongCd", parcel.bjdongCd);
  url.searchParams.set("platGbCd", parcel.platGbCd);
  url.searchParams.set("bun", parcel.bun);
  url.searchParams.set("ji", parcel.ji);
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("_type", "json");
  return url;
}

/**
 * Aggregate all pages — for unit tests and live runner.
 * @param {(pageNo:number)=>Promise<{httpStatus:number, body:object}>} fetchPage
 * @param {{ totalCountHint?: number|null, maxPages?: number, pageSize?: number }} [options]
 */
export async function fetchAllRegisterPages(fetchPage, options = {}) {
  const {
    totalCountHint = null,
    maxPages = Infinity,
    pageSize = DEFAULT_PAGE_SIZE,
  } = typeof options === "number" ? { totalCountHint: options } : options;

  const allItems = [];
  let totalCount = totalCountHint;
  let pageNo = 1;
  let lastKind = "OK";

  while (true) {
    if (pageNo > maxPages) {
      return {
        ok: false,
        kind: "BUDGET_EXCEEDED",
        reason: "NETWORK_BUDGET_EXCEEDED",
        items: allItems,
        pageNo,
        totalCount,
        requiredPages: totalCount != null ? paginationPlan(totalCount, pageSize).pageCount : null,
        maxPages,
      };
    }

    const { httpStatus, body } = await fetchPage(pageNo);
    const classified = classifyBuildingHubResponse(httpStatus, body);
    lastKind = classified.kind;
    if (classified.kind !== "OK") {
      return { ok: false, kind: classified.kind, items: allItems, pageNo, resultCode: classified.resultCode };
    }
    const items = extractRegisterItems(body);
    if (totalCount == null) totalCount = classified.totalCount ?? items.length;

    const plan = paginationPlan(totalCount, pageSize);
    if (plan.pageCount > maxPages) {
      return {
        ok: false,
        kind: "BUDGET_EXCEEDED",
        reason: "NETWORK_BUDGET_EXCEEDED",
        items: allItems,
        pageNo,
        totalCount,
        requiredPages: plan.pageCount,
        maxPages,
      };
    }

    allItems.push(...items);
    if (pageNo >= plan.pageCount || items.length === 0) break;
    pageNo += 1;
  }

  return { ok: true, kind: lastKind, items: allItems, totalCount, pageCount: pageNo };
}
