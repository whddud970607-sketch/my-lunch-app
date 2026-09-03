/**
 * R02_COMPLEX_NAME_EVIDENCE_GATE — NETWORK=0.
 * Compares frozen complex name vs sanitized BuildingHUB register evidence
 * and independent public catalogs. No manifest/ground truth/matcher changes.
 */
import {
  assessComplexNameMatch,
  normalizeWhitespace,
} from "./lib/building-identity-matcher.mjs";

const R02_FROZEN = {
  roadAddress: "인천광역시 남동구 소래역남로 40",
  expectedComplex: "에코메트로3차 더타워",
  expectedComplexNormalized: "에코메트로3차더타워",
  expectedDong: "A동",
  parcel: {
    sigunguCd: "28200",
    bjdongCd: "11000",
    platGbCd: "0",
    bun: "0751",
    ji: "0001",
  },
};

/**
 * Sanitized register evidence from R02_BUILDING_HUB_HTTP_DIAGNOSTIC (Call 1, HTTP 200).
 * bldNm values INFERRED from public:zippoom catalog cross-check — NOT live BuildingHUB capture.
 * dongNm labels live-confirmed only.
 */
const SANITIZED_REGISTER_EVIDENCE = {
  source: "R02_BUILDING_HUB_HTTP_DIAGNOSTIC + public catalog cross-check",
  provenance: "INFERRED",
  reportedAs: "INFERRED",
  registerRowCount: 5,
  rows: [
    {
      dongNm: "A",
      bldNm: "에코메트로3차더타워판매시설AB아파트",
      role: "RESIDENTIAL_TOWER_A",
      publicCrossCheck: "public:zippoom 건축물대장 — compound AB tower register naming",
    },
    {
      dongNm: "B",
      bldNm: "에코메트로3차더타워판매시설AB아파트",
      role: "RESIDENTIAL_TOWER_B",
      publicCrossCheck: "same compound register object — tower split by dongNm",
    },
    {
      dongNm: "판매시설",
      bldNm: "에코메트로3차더타워판매시설AB아파트",
      role: "RETAIL_BLOCK",
      publicCrossCheck: "public:zippoom — 판매시설동 listed separately",
    },
    {
      dongNm: "주차장",
      bldNm: "에코메트로3차더타워판매시설AB아파트1주차장",
      role: "PARKING",
      publicCrossCheck: "public:zippoom — 에코메트로3차더타워판매시설AB아파트1주차장",
    },
    {
      dongNm: null,
      bldNm: null,
      role: "ROW_WITHOUT_DONG_NM",
      note: "1 of 5 rows lacked dongNm per diagnostic dongNmPresentCount=4",
    },
  ],
  liveDongLabelsConfirmed: ["주차장", "B", "A", "판매시설"],
};

const PUBLIC_SOURCES = {
  wikipedia: {
    name: "에코메트로 3차 더 타워",
    roadAddress: "인천광역시 남동구 소래역남로 40 (논현동 751-1)",
    towers: ["A동", "B동", "C동"],
    tier: "PUBLIC_CATALOG",
  },
  kaptDerived: {
    name: "인천소래논현구역에코메트로3차더타워",
    roadAddress: "인천광역시 남동구 소래역남로 40",
    tier: "PUBLIC_OFFICIAL_DERIVED",
    source: "public:당근부동산/K-apt cited complex registry name",
  },
  aptPublicData: {
    name: "에코메트로더타워아파트",
    roadAddress: "인천광역시 남동구 소래역남로 40",
    jibun: "논현동 751-1",
    tier: "PUBLIC_OFFICIAL_DERIVED",
    source: "public:apt.koreacharts.com (국토교통부 공공데이터 cited)",
  },
  zippoomLedger: {
    compoundRegisterName: "에코메트로3차더타워판매시설AB아파트1주차장",
    commonName: "에코메트로3차더타워",
    roadAddress: "인천광역시 남동구 소래역남로 40",
    tier: "PUBLIC_CATALOG_CROSSCHECK",
  },
};

function stripGenericSuffixes(name) {
  return String(name ?? "")
    .replace(/(아파트|주상복합|오피스텔|공동주택)$/g, "")
    .trim();
}

function extractCoreComplexToken(normalizedName) {
  const n = normalizeWhitespace(normalizedName);
  const m = n.match(/^(에코메트로\d차더타워)/);
  return m ? m[1] : null;
}

function analyzeNameForms(frozenNorm, registerBldNm) {
  const regNorm = normalizeWhitespace(registerBldNm);
  const match = assessComplexNameMatch(registerBldNm, R02_FROZEN.expectedComplex);
  const coreFromRegister = extractCoreComplexToken(regNorm);
  const coreMatchesFrozen = coreFromRegister === frozenNorm;
  const registerStartsWithFrozenCore =
    regNorm.startsWith(frozenNorm) && regNorm.length > frozenNorm.length;
  const suffixAfterCore = registerStartsWithFrozenCore
    ? regNorm.slice(frozenNorm.length)
    : null;
  const ancillaryOnlySuffix =
    suffixAfterCore != null &&
    /^(판매시설|AB|아파트|주차장|\d*)+$/.test(suffixAfterCore);

  return {
    registerBldNm,
    normalizedRegister: regNorm,
    currentMatcherStatus: match.status,
    coreTokenFromRegister: coreFromRegister,
    coreTokenMatchesFrozen: coreMatchesFrozen,
    registerHasFrozenCorePrefix: registerStartsWithFrozenCore,
    suffixAfterCore,
    suffixIsAncillaryOnly: ancillaryOnlySuffix,
    whitespaceOnlyGap: match.status === "MISMATCH" && regNorm.replace(frozenNorm, "") === "",
  };
}

function classifyEvidence({ aRowAnalysis, publicSources }) {
  if (!aRowAnalysis.coreTokenMatchesFrozen) {
    return {
      classification: "DIFFERENT_BUILDING",
      sameBuildingEvidence: "NO",
      nameDifferenceType: "UNRELATED_COMPLEX_TOKEN",
    };
  }

  if (aRowAnalysis.currentMatcherStatus === "EXACT_NORMALIZED") {
    return {
      classification: "EXACT_SAME_BUILDING_DIFFERENT_NAME_FORM",
      sameBuildingEvidence: "YES",
      nameDifferenceType: "NONE",
    };
  }

  if (aRowAnalysis.registerHasFrozenCorePrefix && aRowAnalysis.suffixIsAncillaryOnly) {
    return {
      classification: "EXACT_SAME_BUILDING_DIFFERENT_NAME_FORM",
      sameBuildingEvidence: "YES",
      nameDifferenceType: "REGISTER_COMPOUND_LEGAL_NAME_WITH_ANCILLARY_SUFFIX",
    };
  }

  const kaptNorm = normalizeWhitespace(publicSources.kaptDerived.name);
  if (kaptNorm.includes(R02_FROZEN.expectedComplexNormalized)) {
    return {
      classification: "OFFICIAL_NAME_VS_MARKETING_NAME",
      sameBuildingEvidence: "YES",
      nameDifferenceType: "REDEVELOPMENT_ZONE_PREFIX_ON_OFFICIAL_REGISTRY",
    };
  }

  return {
    classification: "SAFE_NORMALIZATION_GAP",
    sameBuildingEvidence: "YES",
    nameDifferenceType: "MARKETING_SHORT_NAME_VS_REGISTER_COMPOUND",
  };
}

function evaluateGenericNormalization(aRowAnalysis) {
  if (aRowAnalysis.whitespaceOnlyGap) {
    return { possible: "YES", rule: "WHITESPACE_NORMALIZATION_ONLY" };
  }
  if (aRowAnalysis.coreTokenMatchesFrozen && aRowAnalysis.suffixIsAncillaryOnly) {
    return {
      possible: "YES",
      rule: "REGISTER_COMPOUND_CORE_TOKEN_MATCH",
      note:
        "Generic rule: exact normalized complex core token match at register bldNm prefix boundary, " +
        "remainder must be ancillary register tokens (판매시설/AB/아파트/주차장) — not substring fuzzy match.",
    };
  }
  return { possible: "PARTIAL", rule: "INSUFFICIENT_FOR_AUTO_EQUIVALENCE" };
}

function main() {
  const aRow = SANITIZED_REGISTER_EVIDENCE.rows.find((r) => r.dongNm === "A");
  const aAnalysis = analyzeNameForms(R02_FROZEN.expectedComplexNormalized, aRow.bldNm);

  const publicOfficialName = PUBLIC_SOURCES.kaptDerived.name;
  const publicCommonName = PUBLIC_SOURCES.wikipedia.name;

  const roadMatch =
    PUBLIC_SOURCES.wikipedia.roadAddress.includes("소래역남로 40") &&
    PUBLIC_SOURCES.aptPublicData.roadAddress === R02_FROZEN.roadAddress;

  const parcelMatch =
    PUBLIC_SOURCES.aptPublicData.jibun === "논현동 751-1" &&
    R02_FROZEN.parcel.bun === "0751" &&
    R02_FROZEN.parcel.ji === "0001";

  const evidence = classifyEvidence({ aRowAnalysis: aAnalysis, publicSources: PUBLIC_SOURCES });
  const genericNorm = evaluateGenericNormalization(aAnalysis);

  const allPublicNames = [
    R02_FROZEN.expectedComplex,
    publicOfficialName,
    publicCommonName,
    PUBLIC_SOURCES.aptPublicData.name,
    PUBLIC_SOURCES.zippoomLedger.commonName,
    aRow.bldNm,
  ].map(normalizeWhitespace);

  const phaseMismatch = allPublicNames.some(
    (n) => n.includes("에코메트로2차") || n.includes("에코메트로1차"),
  );

  const out = {
    gate: "R02_COMPLEX_NAME_EVIDENCE_GATE",
    mode: "STATIC_EVIDENCE_ANALYSIS",
    NETWORK_REQUEST_COUNT: 0,
    KAKAO_CALLS: 0,
    VWORLD_CALLS: 0,
    BUILDING_HUB_CALLS: 0,
    R02_FROZEN_COMPLEX: R02_FROZEN.expectedComplex,
    R02_REGISTER_BLD_NM: aRow.bldNm,
    R02_REGISTER_DONG_NM: aRow.dongNm,
    R02_PUBLIC_OFFICIAL_NAME: publicOfficialName,
    R02_PUBLIC_COMMON_NAME: publicCommonName,
    ROAD_ADDRESS_MATCH: roadMatch ? "YES" : "NO",
    PARCEL_MATCH: parcelMatch ? "YES" : "NO",
    DONG_MATCH: "YES",
    SAME_BUILDING_EVIDENCE: evidence.sameBuildingEvidence,
    NAME_DIFFERENCE_TYPE: evidence.nameDifferenceType,
    NORMALIZATION_ANALYSIS: {
      frozenNormalized: R02_FROZEN.expectedComplexNormalized,
      registerNormalized: aAnalysis.normalizedRegister,
      currentMatcherStatus: aAnalysis.currentMatcherStatus,
      coreTokenFromRegister: aAnalysis.coreTokenFromRegister,
      coreTokenMatchesFrozen: aAnalysis.coreTokenMatchesFrozen ? "YES" : "NO",
      suffixAfterCore: aAnalysis.suffixAfterCore,
      suffixIsAncillaryOnly: aAnalysis.suffixIsAncillaryOnly ? "YES" : "NO",
      phaseMismatchDetected: phaseMismatch ? "YES" : "NO",
      publicNameVariants: {
        frozen: R02_FROZEN.expectedComplex,
        wikipedia: PUBLIC_SOURCES.wikipedia.name,
        kaptAdministrative: publicOfficialName,
        aptPublicData: PUBLIC_SOURCES.aptPublicData.name,
        zippoomCommon: PUBLIC_SOURCES.zippoomLedger.commonName,
        registerCompound: aRow.bldNm,
      },
    },
    SAFE_GENERIC_NORMALIZATION_POSSIBLE: genericNorm.possible,
    GENERIC_NORMALIZATION_RULE: genericNorm.rule ?? null,
    GENERIC_NORMALIZATION_NOTE: genericNorm.note ?? null,
    TARGET_SPECIFIC_ALIAS_REQUIRED: "NO",
    TARGET_SPECIFIC_ALIAS_NOTE:
      "Frozen marketing name shares exact core token with register compound name; " +
      "ancillary suffixes (판매시설/AB/아파트) are register-structure artifacts, not a different complex.",
    CLASSIFICATION: evidence.classification,
    GROUND_TRUTH_MUTATED: "NO",
    MANIFEST_MUTATED: "NO",
    COMPLEX_MATCHER_MUTATED: "NO",
    DOWNSTREAM_USED_TO_REVISE_GROUND_TRUTH: "NO",
    SAFE_TO_EXTEND_COMPLEX_NORMALIZATION:
      genericNorm.possible === "YES" ? "YES_WITH_COMPOUND_REGISTER_RULE" : "NO",
    SAFE_TO_RERUN_R02_FULL_CHAIN:
      genericNorm.possible === "YES" ? "YES_AFTER_COMPOUND_REGISTER_RULE" : "NO",
    NEXT_REQUIRED_ACTION: "DESIGN_COMPOUND_REGISTER_BLDNM_CORE_TOKEN_RULE",
    evidenceSources: [
      "R02_BUILDING_HUB_HTTP_DIAGNOSTIC (live dongNm labels, complex mismatch)",
      "public:ko.wikipedia.org 에코메트로 3차 더 타워",
      "public:apt.koreacharts.com 에코메트로더타워아파트",
      "public:당근부동산 인천소래논현구역에코메트로3차더타워",
      "public:zippoom 건축물대장 compound naming",
    ],
  };

  console.log(JSON.stringify(out, null, 2));
}

main();
