/**
 * R02_BUILDING_HUB_HTTP_DIAGNOSTIC — NETWORK limited to R02 BuildingHUB only.
 * No Kakao, VWorld, manifest, ground truth, or matcher changes.
 * Never prints credentials, serviceKey, or secret-bearing URLs.
 */
import path from "path";
import { fileURLToPath } from "url";
import {
  buildBrTitleInfoUrl,
  classifyBuildingHubResponse,
  decodeServiceKeyOnce,
  DEFAULT_PAGE_SIZE,
  extractRegisterHeader,
  extractRegisterItems,
} from "./lib/building-hub-client.mjs";
import { matchBuildingRegisterIdentity, summarizeRegisterDongEvidence } from "./lib/building-identity-matcher.mjs";
import { loadResearchEnv, pickCredential } from "./lib/research-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env");

const R02_FROZEN_PARCEL = {
  sigunguCd: "28200",
  bjdongCd: "11000",
  platGbCd: "0",
  bun: "0751",
  ji: "0001",
};

const R02_FROZEN_IDENTITY = {
  roadAddress: "인천광역시 남동구 소래역남로 40",
  complexNameHint: "에코메트로3차 더타워",
  dong: "A",
};

const R01_REFERENCE_PARCEL = {
  sigunguCd: "28200",
  bjdongCd: "10500",
  platGbCd: "0",
  bun: "0682",
  ji: "0000",
};

const R03_REFERENCE_PARCEL = {
  sigunguCd: "28200",
  bjdongCd: "10100",
  platGbCd: "0",
  bun: "0024",
  ji: "0000",
};

const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function sanitizeRequestParams(parcel, pageNo = 1, numOfRows = DEFAULT_PAGE_SIZE) {
  return {
    sigunguCd: String(parcel.sigunguCd),
    bjdongCd: String(parcel.bjdongCd),
    platGbCd: String(parcel.platGbCd),
    bun: String(parcel.bun),
    ji: String(parcel.ji),
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
    _type: "json",
  };
}

function extractSanitizedParamsFromBuiltUrl(url) {
  const allowed = [
    "sigunguCd",
    "bjdongCd",
    "platGbCd",
    "bun",
    "ji",
    "pageNo",
    "numOfRows",
    "_type",
  ];
  const out = {};
  for (const key of allowed) {
    out[key] = url.searchParams.get(key);
  }
  return out;
}

function compareRequestConstruction(referenceParcel, targetParcel) {
  const refUrl = buildBrTitleInfoUrl(referenceParcel, "SANITIZED_KEY_PLACEHOLDER");
  const tgtUrl = buildBrTitleInfoUrl(targetParcel, "SANITIZED_KEY_PLACEHOLDER");
  const refParams = extractSanitizedParamsFromBuiltUrl(refUrl);
  const tgtParams = extractSanitizedParamsFromBuiltUrl(tgtUrl);
  const structuralKeys = ["pageNo", "numOfRows", "_type"];
  const structuralMatch = structuralKeys.every((k) => refParams[k] === tgtParams[k]);
  return { structuralMatch, refParams, tgtParams };
}

function classifyApiResultMessage(resultCode, resultMsg) {
  if (resultCode == null && resultMsg == null) return "ABSENT";
  const msg = String(resultMsg ?? "").toLowerCase();
  if (resultCode === "00" || resultCode === "0" || resultCode === "NORMAL_CODE") {
    return "NORMAL_SERVICE_OK";
  }
  if (msg.includes("no data") || msg.includes("nodata") || resultCode === "03") {
    return "NO_DATA_RETURNED";
  }
  if (msg.includes("auth") || msg.includes("key") || resultCode === "30") {
    return "AUTH_OR_KEY_RELATED";
  }
  if (msg.includes("limit") || msg.includes("quota") || resultCode === "22") {
    return "RATE_OR_QUOTA";
  }
  if (resultCode != null) return "API_ERROR_CODE_PRESENT";
  return "MESSAGE_PRESENT_NO_CODE";
}

function isTransientAttempt(attempt) {
  if (attempt.transportError) return true;
  if (attempt.httpStatus != null && TRANSIENT_HTTP_STATUSES.has(attempt.httpStatus)) return true;
  if (attempt.classified?.kind === "HTTP_ERROR" && attempt.httpStatus >= 500) return true;
  return false;
}

function classifyError({
  finalAttempt,
  firstAttempt,
  networkCount,
}) {
  const firstTransient = firstAttempt.classified.kind !== "OK" && isTransientAttempt(firstAttempt);
  const resolvedOnRetry = networkCount === 2 && finalAttempt.classified.kind === "OK" && firstTransient;
  if (resolvedOnRetry) return "RESOLVED_ON_EXACT_RETRY";
  if (finalAttempt.classified.kind === "OK") return null;
  if (finalAttempt.transportError) return "KEY_TRANSPORT_BUG";
  if (finalAttempt.classified.kind === "AUTH_ERROR") return "KEY_TRANSPORT_BUG";
  if (isTransientAttempt(finalAttempt)) return "TRANSIENT_PROVIDER_ERROR";
  if (!finalAttempt.jsonParseOk && finalAttempt.httpStatus === 200) {
    return "API_RESPONSE_FORMAT_VARIANT";
  }
  if (finalAttempt.classified.kind === "API_ERROR") {
    const msgClass = classifyApiResultMessage(finalAttempt.resultCode, finalAttempt.resultMsg);
    if (msgClass === "NO_DATA_RETURNED") return "PARCEL_QUERY_NOT_SUPPORTED";
    if (msgClass === "AUTH_OR_KEY_RELATED") return "KEY_TRANSPORT_BUG";
    return "API_RESPONSE_FORMAT_VARIANT";
  }
  if (finalAttempt.classified.kind === "HTTP_ERROR" && finalAttempt.httpStatus < 500) {
    return "REQUEST_CONSTRUCTION_BUG";
  }
  return "UNKNOWN_PROVIDER_ERROR";
}

async function fetchBuildingHubOnce(parcel, serviceKey, fetchFn = fetch) {
  const url = buildBrTitleInfoUrl(parcel, serviceKey, 1, DEFAULT_PAGE_SIZE);
  let transportError = false;
  let httpStatus = 0;
  let body = null;
  let jsonParseOk = false;

  try {
    const res = await fetchFn(url.toString());
    httpStatus = res.status;
    try {
      body = await res.json();
      jsonParseOk = body != null && typeof body === "object";
    } catch {
      body = null;
      jsonParseOk = false;
    }
  } catch {
    transportError = true;
    httpStatus = 0;
    body = null;
    jsonParseOk = false;
  }

  const classified = classifyBuildingHubResponse(httpStatus, body);
  const header = extractRegisterHeader(body);
  const items = extractRegisterItems(body);

  return {
    httpStatus,
    classified,
    resultCode: header.resultCode,
    resultMsg: header.resultMsg,
    totalCount: header.totalCount,
    itemCount: items.length,
    items,
    jsonParseOk,
    transportError,
    transportLayer: transportError ? "FETCH_EXCEPTION" : "HTTP_RESPONSE",
    apiLayer: classified.kind,
  };
}

async function main() {
  const env = loadResearchEnv(ENV_PATH);
  const rawKey = pickCredential(env, [
    "DATA_GO_KR_SERVICE_KEY",
    "PUBLIC_DATA_SERVICE_KEY",
    "BUILDING_REGISTER_SERVICE_KEY",
    "SERVICE_KEY",
  ]);

  const pageNo = 1;
  const numOfRows = DEFAULT_PAGE_SIZE;
  const expectedParams = sanitizeRequestParams(R02_FROZEN_PARCEL, pageNo, numOfRows);

  const decodeOnceApplied =
    rawKey != null && decodeServiceKeyOnce(rawKey) === decodeServiceKeyOnce(rawKey);

  const builtUrl = rawKey
    ? buildBrTitleInfoUrl(R02_FROZEN_PARCEL, decodeServiceKeyOnce(rawKey), pageNo, numOfRows)
    : buildBrTitleInfoUrl(R02_FROZEN_PARCEL, "PLACEHOLDER", pageNo, numOfRows);
  const builtParams = extractSanitizedParamsFromBuiltUrl(builtUrl);

  const r01Compare = compareRequestConstruction(R01_REFERENCE_PARCEL, R02_FROZEN_PARCEL);
  const r03Compare = compareRequestConstruction(R03_REFERENCE_PARCEL, R02_FROZEN_PARCEL);

  const requestConstructionMatchesR01R03 =
    r01Compare.structuralMatch &&
    r03Compare.structuralMatch &&
    builtParams.pageNo === "1" &&
    builtParams.numOfRows === String(DEFAULT_PAGE_SIZE) &&
    builtParams._type === "json";

  const zeroPaddingCorrect =
    R02_FROZEN_PARCEL.bun === "0751" &&
    R02_FROZEN_PARCEL.ji === "0001" &&
    builtParams.bun === "0751" &&
    builtParams.ji === "0001";

  const out = {
    gate: "R02_BUILDING_HUB_HTTP_DIAGNOSTIC",
    mode: "LIVE_NETWORK_LIMITED",
    R02_REQUEST_PARAMS_SANITIZED: expectedParams,
    BUILT_URL_PARAMS_SANITIZED: builtParams,
    REQUEST_CONSTRUCTION_MATCHES_R01_R03: requestConstructionMatchesR01R03 ? "YES" : "NO",
    DECODE_ONCE_APPLIED: decodeOnceApplied ? "YES" : "NO",
    ZERO_PADDING_CORRECT: zeroPaddingCorrect ? "YES" : "NO",
    R01_R03_STRUCTURAL_DIFF: {
      R01_vs_R02: {
        structuralMatch: r01Compare.structuralMatch ? "YES" : "NO",
        parcelFieldDiff: ["sigunguCd", "bjdongCd", "platGbCd", "bun", "ji"].filter(
          (k) => String(R01_REFERENCE_PARCEL[k]) !== String(R02_FROZEN_PARCEL[k]),
        ),
      },
      R03_vs_R02: {
        structuralMatch: r03Compare.structuralMatch ? "YES" : "NO",
        parcelFieldDiff: ["sigunguCd", "bjdongCd", "platGbCd", "bun", "ji"].filter(
          (k) => String(R03_REFERENCE_PARCEL[k]) !== String(R02_FROZEN_PARCEL[k]),
        ),
      },
    },
    NETWORK_REQUEST_COUNT: 0,
    KAKAO_CALLS: 0,
    VWORLD_CALLS: 0,
    MANIFEST_MUTATED: "NO",
    GROUND_TRUTH_MUTATED: "NO",
    calls: [],
  };

  if (!rawKey) {
    out.error = "DATA_GO_KR_SERVICE_KEY_NOT_CONFIGURED";
    out.R02_HTTP_STATUS = null;
    out.R02_API_RESULT_CODE = null;
    out.R02_API_RESULT_MESSAGE_CLASS = "ABSENT";
    out.ERROR_CLASSIFICATION = "KEY_TRANSPORT_BUG";
    out.R02_BUILDING_HUB_FETCH = "FAIL";
    out.R02_A_DONG_IDENTITY = "NOT_EVALUATED";
    out.SAFE_TO_RERUN_R02_FULL_CHAIN = "NO";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const serviceKey = decodeServiceKeyOnce(rawKey);
  let networkCount = 0;

  const firstAttempt = await fetchBuildingHubOnce(R02_FROZEN_PARCEL, serviceKey);
  networkCount += 1;
  out.calls.push({
    call: 1,
    httpStatus: firstAttempt.httpStatus,
    apiLayer: firstAttempt.apiLayer,
    resultCode: firstAttempt.resultCode,
    resultMessageClass: classifyApiResultMessage(firstAttempt.resultCode, firstAttempt.resultMsg),
    transportLayer: firstAttempt.transportLayer,
    itemCount: firstAttempt.itemCount,
    totalCount: firstAttempt.totalCount,
  });

  let finalAttempt = firstAttempt;
  if (firstAttempt.classified.kind !== "OK" && isTransientAttempt(firstAttempt)) {
    const retry = await fetchBuildingHubOnce(R02_FROZEN_PARCEL, serviceKey);
    networkCount += 1;
    out.calls.push({
      call: 2,
      retryReason: "TRANSIENT_OR_TRANSPORT_ON_CALL_1",
      httpStatus: retry.httpStatus,
      apiLayer: retry.apiLayer,
      resultCode: retry.resultCode,
      resultMessageClass: classifyApiResultMessage(retry.resultCode, retry.resultMsg),
      transportLayer: retry.transportLayer,
      itemCount: retry.itemCount,
      totalCount: retry.totalCount,
    });
    finalAttempt = retry;
  }

  out.NETWORK_REQUEST_COUNT = networkCount;
  out.R02_HTTP_STATUS = finalAttempt.httpStatus;
  out.R02_API_RESULT_CODE = finalAttempt.resultCode;
  out.R02_API_RESULT_MESSAGE_CLASS = classifyApiResultMessage(
    finalAttempt.resultCode,
    finalAttempt.resultMsg,
  );
  out.TRANSPORT_VS_API =
    finalAttempt.transportError || finalAttempt.httpStatus === 0
      ? "TRANSPORT_LEVEL"
      : finalAttempt.classified.kind === "OK" || finalAttempt.classified.kind === "API_ERROR"
        ? "API_LEVEL"
        : "HTTP_LEVEL";

  out.ERROR_CLASSIFICATION = classifyError({
    finalAttempt,
    firstAttempt,
    networkCount,
  });

  if (finalAttempt.classified.kind === "OK") {
    out.R02_BUILDING_HUB_FETCH = "PASS";
    const identity = matchBuildingRegisterIdentity(finalAttempt.items, R02_FROZEN_IDENTITY);
    out.R02_A_DONG_IDENTITY = identity.identityVerified ? "PASS" : "FAIL";
    out.R02_IDENTITY_DETAIL = {
      dongMatch: identity.dongMatch,
      complexNameMatch: identity.complexNameMatch,
      failureReason: identity.failureReason,
      expectedDongLabel: identity.expectedDongLabel,
      registerDongEvidence: summarizeRegisterDongEvidence(finalAttempt.items),
      sanitizedRegisterRows: finalAttempt.items.map((item) => ({
        dongNm: item.dongNm ?? null,
        bldNm: item.bldNm ?? null,
      })),
    };
    out.SAFE_TO_RERUN_R02_FULL_CHAIN =
      identity.identityVerified === true ? "YES" : "NO";
  } else {
    out.R02_BUILDING_HUB_FETCH = "FAIL";
    out.R02_A_DONG_IDENTITY = "NOT_EVALUATED";
    out.SAFE_TO_RERUN_R02_FULL_CHAIN =
      out.ERROR_CLASSIFICATION === "TRANSIENT_PROVIDER_ERROR" ? "YES" : "NO";
  }

  console.log(JSON.stringify(out, null, 2));

  if (out.R02_BUILDING_HUB_FETCH === "FAIL") {
    process.exit(1);
  }
}

main().catch(() => process.exit(1));
