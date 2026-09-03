/**
 * R02_LIVE_BLDNM_CAPTURE — single BuildingHUB call, evidence capture only.
 * No matcher/normalization/alias changes. No Kakao/VWorld.
 */
import path from "path";
import { fileURLToPath } from "url";
import {
  classifyBuildingHubResponse,
  decodeServiceKeyOnce,
  extractRegisterHeader,
  extractRegisterItems,
} from "./lib/building-hub-client.mjs";
import { normalizeWhitespace, parseDongSemanticLabel } from "./lib/building-identity-matcher.mjs";
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

const FROZEN_COMPLEX_HINT = "에코메트로3차 더타워";
const FROZEN_NORMALIZED_CORE = normalizeWhitespace(FROZEN_COMPLEX_HINT);

function isADongCandidate(dongNm) {
  const parsed = parseDongSemanticLabel(dongNm);
  return parsed?.kind === "letter" && parsed.token === "A";
}

function analyzeBldNm(bldNm) {
  const raw = bldNm != null ? String(bldNm).trim() : null;
  const normalized = raw ? normalizeWhitespace(raw) : null;
  return {
    RAW_SANITIZED_BLDNM: raw,
    NORMALIZED_BLDNM: normalized,
    FROZEN_NORMALIZED_CORE,
    CORE_PREFIX_PRESENT: normalized != null ? normalized.startsWith(FROZEN_NORMALIZED_CORE) : false,
    CORE_CONTAINS_PRESENT:
      normalized != null && normalized.includes(FROZEN_NORMALIZED_CORE) && !normalized.startsWith(FROZEN_NORMALIZED_CORE),
  };
}

function classifyNameStructure(normalizedBldNm) {
  if (!normalizedBldNm) return { administrativePrefix: "UNKNOWN", other: "EMPTY" };
  const adminPrefix = normalizedBldNm.startsWith("인천소래논현구역");
  const corePrefix = normalizedBldNm.startsWith(FROZEN_NORMALIZED_CORE);
  const coreContains = normalizedBldNm.includes(FROZEN_NORMALIZED_CORE);
  return {
    administrativePrefixLikely: adminPrefix && !corePrefix && coreContains,
    corePrefixForm: corePrefix,
    coreSubstringOnly: coreContains && !corePrefix,
    neitherPrefixNorContains: !coreContains,
  };
}

async function main() {
  const env = loadResearchEnv(ENV_PATH);
  const serviceKey = pickCredential(env, [
    "DATA_GO_KR_SERVICE_KEY",
    "PUBLIC_DATA_SERVICE_KEY",
    "BUILDING_REGISTER_SERVICE_KEY",
    "SERVICE_KEY",
  ]);

  const out = {
    gate: "R02_LIVE_BLDNM_CAPTURE",
    mode: "LIVE_EVIDENCE_CAPTURE",
    frozenParcel: R02_FROZEN_PARCEL,
    FROZEN_NORMALIZED_CORE,
    BUILDING_HUB_REQUEST_COUNT: 0,
    KAKAO_REQUEST_COUNT: 0,
    NAVER_REQUEST_COUNT: 0,
    VWORLD_REQUEST_COUNT: 0,
    MATCHER_CHANGED: "NO",
    GROUND_TRUTH_MUTATED: "NO",
    MANIFEST_MUTATED: "NO",
  };

  if (!serviceKey) {
    out.error = "DATA_GO_KR_SERVICE_KEY_NOT_CONFIGURED";
    out.R02_BUILDING_HUB_FETCH = "FAIL";
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const key = decodeServiceKeyOnce(serviceKey);
  const url = new URL("https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo");
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("sigunguCd", R02_FROZEN_PARCEL.sigunguCd);
  url.searchParams.set("bjdongCd", R02_FROZEN_PARCEL.bjdongCd);
  url.searchParams.set("platGbCd", R02_FROZEN_PARCEL.platGbCd);
  url.searchParams.set("bun", R02_FROZEN_PARCEL.bun);
  url.searchParams.set("ji", R02_FROZEN_PARCEL.ji);
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("_type", "json");

  out.BUILDING_HUB_REQUEST_COUNT = 1;

  let httpStatus = 0;
  let body = null;
  try {
    const res = await fetch(url.toString());
    httpStatus = res.status;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
  } catch {
    httpStatus = 0;
    body = null;
  }

  const header = extractRegisterHeader(body);
  const classified = classifyBuildingHubResponse(httpStatus, body);
  const items = extractRegisterItems(body);

  out.R02_HTTP_STATUS = httpStatus;
  out.R02_RESULT_CODE = header.resultCode;
  out.R02_BUILDING_HUB_FETCH = classified.kind === "OK" ? "PASS" : "FAIL";

  const sanitizedAllRows = items.map((item) => ({
    dongNm: item.dongNm ?? null,
    bldNm: item.bldNm ?? null,
  }));

  const aCandidates = sanitizedAllRows.filter((row) => isADongCandidate(row.dongNm));
  const aAnalyses = aCandidates.map((row) => ({
    dongNm: row.dongNm,
    bldNm: row.bldNm,
    ...analyzeBldNm(row.bldNm),
  }));

  out.registerRowCount = items.length;
  out.sanitizedAllRows = sanitizedAllRows;
  out.R02_A_DONG_ROW_COUNT = aCandidates.length;
  out.R02_A_DONG_BLDNM_VALUES = [...new Set(aCandidates.map((r) => r.bldNm).filter(Boolean))];
  out.R02_A_DONG_CANDIDATES = aAnalyses;

  if (aCandidates.length === 1) {
    out.R02_MATCHER_INPUT_BLDNM = aCandidates[0].bldNm;
    out.R02_NORMALIZED_BLDNM = normalizeWhitespace(aCandidates[0].bldNm);
    out.CORE_PREFIX_PRESENT = aAnalyses[0].CORE_PREFIX_PRESENT ? "YES" : "NO";
    out.CORE_CONTAINS_PRESENT = aAnalyses[0].CORE_CONTAINS_PRESENT ? "YES" : "NO";
  } else if (aCandidates.length === 0) {
    out.R02_MATCHER_INPUT_BLDNM = null;
    out.R02_NORMALIZED_BLDNM = null;
    out.CORE_PREFIX_PRESENT = "N/A";
    out.CORE_CONTAINS_PRESENT = "N/A";
  } else {
    out.R02_MATCHER_INPUT_BLDNM = "AMBIGUOUS_MULTIPLE_A_ROWS";
    out.R02_NORMALIZED_BLDNM = "AMBIGUOUS_MULTIPLE_A_ROWS";
    out.CORE_PREFIX_PRESENT = "AMBIGUOUS";
    out.CORE_CONTAINS_PRESENT = "AMBIGUOUS";
  }

  const structures = aAnalyses.map((a) => classifyNameStructure(a.NORMALIZED_BLDNM));
  const adminConfirmed = structures.some((s) => s.administrativePrefixLikely);
  const otherStructure = structures.some(
    (s) => s.neitherPrefixNorContains || (s.coreSubstringOnly && !s.administrativePrefixLikely),
  );

  out.ADMINISTRATIVE_PREFIX_VARIANT_CONFIRMED = adminConfirmed ? "YES" : "NO";
  out.OTHER_NAME_STRUCTURE_FOUND = otherStructure ? "YES" : "NO";
  out.nameStructureAnalysis = structures;

  out.SAFE_TO_DESIGN_GENERIC_RULE =
    aCandidates.length >= 1 && classified.kind === "OK" ? "YES" : "NO";

  console.log(JSON.stringify(out, null, 2));

  if (out.R02_BUILDING_HUB_FETCH === "FAIL") {
    process.exit(1);
  }
}

main().catch(() => process.exit(1));
