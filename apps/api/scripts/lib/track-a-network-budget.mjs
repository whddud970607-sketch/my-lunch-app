/**
 * Research-only TRACK A network request budget (pre-flight, no network).
 */

import { DEFAULT_PAGE_SIZE } from "./building-hub-client.mjs";
import { TRACK_A_TARGETS } from "./track-a-manifest.mjs";

/** Operational pilot cap — not an API schema maximum. */
export const BUILDING_HUB_OPERATIONAL_MAX_PAGES_PER_TARGET = 5;
export const BUILDING_HUB_OPERATIONAL_MAX_ROWS_PER_TARGET =
  BUILDING_HUB_OPERATIONAL_MAX_PAGES_PER_TARGET * DEFAULT_PAGE_SIZE;

export const TRACK_A_TOTAL_NETWORK_BUDGET = 21;

export const KAKAO_REQUESTS_PER_TARGET = 1;
export const VWORLD_REQUESTS_PER_TARGET = 1;

export function buildingHubMaxPagesPerTarget(
  maxRows = BUILDING_HUB_OPERATIONAL_MAX_ROWS_PER_TARGET,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  if (maxRows <= 0) return 0;
  return Math.ceil(maxRows / pageSize);
}

export function computeTrackANetworkBudget({
  targetCount = TRACK_A_TARGETS.length,
  maxHubRowsPerTarget = BUILDING_HUB_OPERATIONAL_MAX_ROWS_PER_TARGET,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  const maxHubPages = buildingHubMaxPagesPerTarget(maxHubRowsPerTarget, pageSize);
  const kakao = targetCount * KAKAO_REQUESTS_PER_TARGET;
  const buildingHubMax = targetCount * maxHubPages;
  const vworld = targetCount * VWORLD_REQUESTS_PER_TARGET;

  return {
    targetCount,
    kakaoRequestsPerTarget: KAKAO_REQUESTS_PER_TARGET,
    buildingHubMaxPagesPerTarget: maxHubPages,
    buildingHubPageSize: pageSize,
    buildingHubMaxRowsAssumption: maxHubRowsPerTarget,
    vworldRequestsPerTarget: VWORLD_REQUESTS_PER_TARGET,
    EXPECTED_KAKAO_REQUESTS: kakao,
    EXPECTED_BUILDING_HUB_REQUESTS_MAX: buildingHubMax,
    EXPECTED_VWORLD_REQUESTS: vworld,
    TOTAL_NETWORK_REQUEST_UPPER_BOUND: kakao + buildingHubMax + vworld,
    BUILDING_HUB_PAGINATION_NOTE:
      "BuildingHUB getBrTitleInfo uses pageNo/numOfRows; page count = ceil(totalCount/100). " +
      "totalCount is unknown pre-flight; operational pilot cap is 5 pages (500 rows) per target.",
  };
}

export function computePerTargetNetworkBudget(
  maxHubRowsPerTarget = BUILDING_HUB_OPERATIONAL_MAX_ROWS_PER_TARGET,
) {
  const maxHubPages = buildingHubMaxPagesPerTarget(maxHubRowsPerTarget);
  return {
    KAKAO_REQUESTS: KAKAO_REQUESTS_PER_TARGET,
    BUILDING_HUB_REQUESTS_MAX: maxHubPages,
    VWORLD_REQUESTS: VWORLD_REQUESTS_PER_TARGET,
    TOTAL_MAX_REQUESTS: KAKAO_REQUESTS_PER_TARGET + maxHubPages + VWORLD_REQUESTS_PER_TARGET,
  };
}
