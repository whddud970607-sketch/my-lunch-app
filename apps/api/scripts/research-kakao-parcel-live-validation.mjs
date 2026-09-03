/**
 * RESEARCH ONLY — Kakao Parcel Seed Live Validation (TRACK A T01/T07/T09).
 * NETWORK: Kakao address.json only, max 1 request per target (3 total).
 * Never prints API keys, Authorization, or full raw responses.
 * Never uses coordinates/proximity for parcel selection.
 * Never uses road_address.main_building_no as parcel bun.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TARGETS = [
  {
    targetId: "T01",
    roadAddress: "인천광역시 남동구 서창남순환로 55",
  },
  {
    targetId: "T07",
    roadAddress: "인천광역시 남동구 소래역남로 40",
  },
  {
    targetId: "T09",
    roadAddress: "인천광역시 남동구 호구포로 803",
  },
];

function loadEnv(file) {
  const map = {};
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    map[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return map;
}

function normalizeRoad(s) {
  return String(s ?? "")
    .replace(/\s+/g, "")
    .replace(/^인천광역시/, "인천")
    .trim();
}

function pad4(n) {
  const s = String(n ?? "").trim();
  if (!s) return "0000";
  if (!/^\d+$/.test(s)) return null;
  return s.padStart(4, "0");
}

function roadIdentityExactMatch(inputRoad, doc) {
  const input = normalizeRoad(inputRoad);
  const candidates = [
    doc?.road_address?.address_name,
    doc?.address_name,
  ]
    .filter(Boolean)
    .map(normalizeRoad);

  if (candidates.some((c) => c === input)) return "YES";

  // structured road parts: region + road_name + building numbers (road identity, not parcel)
  const ra = doc?.road_address;
  if (ra?.road_name && ra?.main_building_no != null) {
    const built = normalizeRoad(
      `${ra.region_1depth_name ?? ""}${ra.region_2depth_name ?? ""}${ra.road_name}${ra.main_building_no}${ra.sub_building_no ?? ""}`,
    );
    // soft structural containment check without proximity
    if (input.includes(normalizeRoad(ra.road_name + ra.main_building_no))) {
      return "YES";
    }
    if (built && input.includes(normalizeRoad(ra.road_name))) {
      // not enough alone
    }
  }

  // road name + main building number present in input (deterministic string check)
  if (ra?.road_name && String(ra.main_building_no ?? "").length) {
    const roadPart = normalizeRoad(`${ra.road_name}${ra.main_building_no}`);
    if (input.includes(roadPart)) return "YES";
  }

  return "NO";
}

function assessDocument(doc, inputRoad) {
  const address = doc?.address ?? null;
  const road = doc?.road_address ?? null;
  const addressBlockPresent = address ? "YES" : "NO";
  const bCode = address?.b_code ? String(address.b_code).trim() : null;
  const mountainYn = address?.mountain_yn ?? null;
  const mainNo = address?.main_address_no;
  const subNo = address?.sub_address_no;

  const mainPresent =
    mainNo != null && String(mainNo).trim() !== "" ? "YES" : "NO";
  const subPresent =
    subNo != null && String(subNo).trim() !== "" ? "YES" : "NO";
  // empty sub is valid ("")
  const subOk = subNo != null ? "YES" : "NO";

  const platGbCd =
    mountainYn === "Y" ? "1" : mountainYn === "N" ? "0" : null;
  const bun = mainPresent === "YES" ? pad4(mainNo) : null;
  const ji = subOk === "YES" ? pad4(subNo === "" ? "0" : subNo) : null;

  const derived = {
    DERIVED_SIGUNGU_CD:
      bCode && /^\d{10}$/.test(bCode) ? bCode.slice(0, 5) : null,
    DERIVED_BJDONG_CD:
      bCode && /^\d{10}$/.test(bCode) ? bCode.slice(5, 10) : null,
    DERIVED_PLAT_GB_CD: platGbCd,
    DERIVED_BUN: bun,
    DERIVED_JI: ji,
  };

  const structuredComplete =
    addressBlockPresent === "YES" &&
    bCode &&
    /^\d{10}$/.test(bCode) &&
    (mountainYn === "Y" || mountainYn === "N") &&
    mainPresent === "YES" &&
    bun != null &&
    ji != null;

  return {
    ADDRESS_TYPE: doc?.address_type ?? null,
    ROAD_ADDRESS_MATCH: roadIdentityExactMatch(inputRoad, doc),
    ADDRESS_BLOCK_PRESENT: addressBlockPresent,
    ROAD_ADDRESS_BLOCK_PRESENT: road ? "YES" : "NO",
    B_CODE_PRESENT: bCode ? "YES" : "NO",
    B_CODE_LENGTH: bCode ? bCode.length : 0,
    B_CODE: bCode, // public code, not a secret
    MOUNTAIN_YN: mountainYn,
    MAIN_ADDRESS_NO_PRESENT: mainPresent,
    SUB_ADDRESS_NO_PRESENT: subPresent,
    SUB_ADDRESS_NO_OK: subOk,
    MAIN_ADDRESS_NO: mainPresent === "YES" ? String(mainNo) : null,
    SUB_ADDRESS_NO: subOk === "YES" ? String(subNo ?? "") : null,
    ROAD_MAIN_BUILDING_NO: road?.main_building_no ?? null,
    ROAD_BUILDING_NUMBER_FALLBACK_USED: "NO",
    STRUCTURED_COMPLETE: structuredComplete ? "YES" : "NO",
    ...derived,
  };
}

function classifyTarget(inputRoad, httpStatus, body) {
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      PARCEL_RESOLUTION: "PROVIDER_ERROR",
      FAILURE_REASON: "KAKAO_AUTH_ERROR",
      DOCUMENT_COUNT: 0,
      documents: [],
    };
  }
  if (httpStatus !== 200) {
    return {
      PARCEL_RESOLUTION: "PROVIDER_ERROR",
      FAILURE_REASON: "KAKAO_HTTP_ERROR",
      HTTP_STATUS: httpStatus,
      DOCUMENT_COUNT: 0,
      documents: [],
    };
  }

  const docs = Array.isArray(body?.documents) ? body.documents : [];
  const assessed = docs.map((d) => assessDocument(d, inputRoad));

  if (docs.length === 0) {
    return {
      PARCEL_RESOLUTION: "UNRESOLVED",
      FAILURE_REASON: "NO_DOCUMENTS",
      DOCUMENT_COUNT: 0,
      documents: [],
    };
  }

  const structuredMatches = assessed.filter(
    (a) => a.STRUCTURED_COMPLETE === "YES" && a.ROAD_ADDRESS_MATCH === "YES",
  );
  const structuredOnly = assessed.filter((a) => a.STRUCTURED_COMPLETE === "YES");

  if (docs.length === 1) {
    const a = assessed[0];
    if (a.STRUCTURED_COMPLETE === "YES") {
      return {
        PARCEL_RESOLUTION: "RESOLVED",
        FAILURE_REASON: null,
        DOCUMENT_COUNT: 1,
        selected: a,
        documents: assessed,
        NOTE:
          a.ROAD_ADDRESS_MATCH === "NO"
            ? "SINGLE_DOC_STRUCTURED_COMPLETE_BUT_ROAD_MATCH_NO"
            : null,
      };
    }
    return {
      PARCEL_RESOLUTION: "UNRESOLVED",
      FAILURE_REASON: "STRUCTURED_ADDRESS_INCOMPLETE",
      DOCUMENT_COUNT: 1,
      documents: assessed,
    };
  }

  // multi-document: never auto-pick first; never use proximity
  if (structuredMatches.length === 1) {
    return {
      PARCEL_RESOLUTION: "RESOLVED",
      FAILURE_REASON: null,
      DOCUMENT_COUNT: docs.length,
      MULTI_DOCUMENT: "YES",
      RESOLUTION_METHOD: "EXACT_ROAD_IDENTITY_PLUS_STRUCTURED_ADDRESS",
      selected: structuredMatches[0],
      documents: assessed,
    };
  }
  if (structuredMatches.length > 1) {
    return {
      PARCEL_RESOLUTION: "AMBIGUOUS",
      FAILURE_REASON: "MULTI_DOC_MULTIPLE_STRUCTURED_ROAD_MATCHES",
      DOCUMENT_COUNT: docs.length,
      documents: assessed,
    };
  }
  if (structuredOnly.length > 1) {
    return {
      PARCEL_RESOLUTION: "AMBIGUOUS",
      FAILURE_REASON: "MULTI_DOC_NO_DETERMINISTIC_ROAD_MATCH",
      DOCUMENT_COUNT: docs.length,
      documents: assessed,
    };
  }
  if (structuredOnly.length === 1) {
    return {
      PARCEL_RESOLUTION: "AMBIGUOUS",
      FAILURE_REASON: "MULTI_DOC_SINGLE_STRUCTURED_BUT_ROAD_MATCH_UNCONFIRMED",
      DOCUMENT_COUNT: docs.length,
      documents: assessed,
      NOTE: "Do not auto-select; multi-doc rule deferred to post-gate decision",
    };
  }

  return {
    PARCEL_RESOLUTION: "UNRESOLVED",
    FAILURE_REASON: "MULTI_DOC_NO_STRUCTURED_ADDRESS",
    DOCUMENT_COUNT: docs.length,
    documents: assessed,
  };
}

async function kakaoAddressSearch(key, query) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  url.searchParams.set("query", query);
  // no x/y/coordinate bias params
  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${key}` },
  });
  const body = await res.json().catch(() => null);
  return { httpStatus: res.status, body };
}

async function main() {
  const env = loadEnv(path.join(__dirname, "..", ".env"));
  const key = env.KAKAO_REST_API_KEY?.trim();
  const out = {
    gate: "KAKAO_PARCEL_LIVE_VALIDATION",
    networkRequestCount: 0,
    buildingHubCalls: 0,
    vworldCalls: 0,
    naverCalls: 0,
    coordinateSelectionUsed: "NO",
    proximityUsed: "NO",
    roadBuildingNumberFallbackUsed: "NO",
    targets: [],
  };

  if (!key) {
    out.error = "KAKAO_REST_API_KEY_NOT_CONFIGURED";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  for (const t of TARGETS) {
    out.networkRequestCount += 1;
    let httpStatus;
    let body;
    try {
      ({ httpStatus, body } = await kakaoAddressSearch(key, t.roadAddress));
    } catch {
      out.targets.push({
        targetId: t.targetId,
        roadAddress: t.roadAddress,
        PARCEL_RESOLUTION: "PROVIDER_ERROR",
        FAILURE_REASON: "FETCH_ERROR",
        DOCUMENT_COUNT: 0,
      });
      continue;
    }

    const classified = classifyTarget(t.roadAddress, httpStatus, body);
    const selected = classified.selected ?? null;
    out.targets.push({
      targetId: t.targetId,
      roadAddress: t.roadAddress,
      HTTP_STATUS: httpStatus,
      DOCUMENT_COUNT: classified.DOCUMENT_COUNT,
      PARCEL_RESOLUTION: classified.PARCEL_RESOLUTION,
      FAILURE_REASON: classified.FAILURE_REASON ?? null,
      MULTI_DOCUMENT: classified.MULTI_DOCUMENT ?? (classified.DOCUMENT_COUNT > 1 ? "YES" : "NO"),
      RESOLUTION_METHOD: classified.RESOLUTION_METHOD ?? null,
      NOTE: classified.NOTE ?? null,
      ADDRESS_TYPE: selected?.ADDRESS_TYPE ?? classified.documents?.[0]?.ADDRESS_TYPE ?? null,
      ROAD_ADDRESS_MATCH: selected?.ROAD_ADDRESS_MATCH ?? null,
      ADDRESS_BLOCK_PRESENT: selected?.ADDRESS_BLOCK_PRESENT ?? null,
      B_CODE_PRESENT: selected?.B_CODE_PRESENT ?? null,
      B_CODE_LENGTH: selected?.B_CODE_LENGTH ?? null,
      B_CODE: selected?.B_CODE ?? null,
      MOUNTAIN_YN: selected?.MOUNTAIN_YN ?? null,
      MAIN_ADDRESS_NO_PRESENT: selected?.MAIN_ADDRESS_NO_PRESENT ?? null,
      SUB_ADDRESS_NO_PRESENT: selected?.SUB_ADDRESS_NO_PRESENT ?? null,
      DERIVED_SIGUNGU_CD: selected?.DERIVED_SIGUNGU_CD ?? null,
      DERIVED_BJDONG_CD: selected?.DERIVED_BJDONG_CD ?? null,
      DERIVED_PLAT_GB_CD: selected?.DERIVED_PLAT_GB_CD ?? null,
      DERIVED_BUN: selected?.DERIVED_BUN ?? null,
      DERIVED_JI: selected?.DERIVED_JI ?? null,
      STRUCTURED_COMPLETE: selected?.STRUCTURED_COMPLETE ?? "NO",
      ROAD_BUILDING_NUMBER_FALLBACK_USED: "NO",
      documentSummaries: classified.documents.map((d) => ({
        ADDRESS_TYPE: d.ADDRESS_TYPE,
        ROAD_ADDRESS_MATCH: d.ROAD_ADDRESS_MATCH,
        ADDRESS_BLOCK_PRESENT: d.ADDRESS_BLOCK_PRESENT,
        B_CODE_PRESENT: d.B_CODE_PRESENT,
        B_CODE_LENGTH: d.B_CODE_LENGTH,
        MOUNTAIN_YN: d.MOUNTAIN_YN,
        MAIN_ADDRESS_NO_PRESENT: d.MAIN_ADDRESS_NO_PRESENT,
        STRUCTURED_COMPLETE: d.STRUCTURED_COMPLETE,
        DERIVED_SIGUNGU_CD: d.DERIVED_SIGUNGU_CD,
        DERIVED_BJDONG_CD: d.DERIVED_BJDONG_CD,
        DERIVED_PLAT_GB_CD: d.DERIVED_PLAT_GB_CD,
        DERIVED_BUN: d.DERIVED_BUN,
        DERIVED_JI: d.DERIVED_JI,
      })),
    });
  }

  const resolved = out.targets.filter((t) => t.PARCEL_RESOLUTION === "RESOLVED");
  out.STRUCTURED_ADDRESS_COMPLETE_COUNT = resolved.filter(
    (t) => t.STRUCTURED_COMPLETE === "YES",
  ).length;
  out.RESOLVED_COUNT = resolved.length;
  out.KAKAO_PRIMARY_LIVE_VALIDATION =
    resolved.length === 3
      ? "PASS"
      : resolved.length === 2
        ? "PARTIAL_PASS"
        : "FAIL";
  out.SAFE_TO_IMPLEMENT_KAKAO_PARCEL_ADAPTER =
    resolved.length >= 2 ? "YES" : "NO";
  out.SAFE_TO_RUN_TRACK_A_FULL_PILOT = "NO";

  console.log(JSON.stringify(out, null, 2));
}

main().catch(() => process.exit(1));
