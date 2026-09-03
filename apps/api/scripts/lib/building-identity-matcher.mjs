/**
 * Research-only BuildingHUB register row matcher.
 * COMPLEX_NAME_MATCH is evidence — parcel + dong + complex evidence combined for identity.
 */
import { EVIDENCE_PROVENANCE_TYPES } from "./evidence-provenance.mjs";

export { EVIDENCE_PROVENANCE_TYPES };

export function normalizeWhitespace(s) {
  return (s ?? "").replace(/\s+/g, "").trim();
}

export const SAFE_ANCILLARY_TOKENS = [
  "근린생활시설",
  "판매시설",
  "복리시설",
  "부대시설",
  "주차장",
  "주상복합",
  "아파트",
  "상가",
];

const BLOCK_TOKEN_RE = /^([A-C]\d+블록|\d+블록|[A-C]블록)/;
const ADMIN_ZONE_RE = /^([가-힣]+(?:구역|지구|개발구역))/;

export function parseDongSemanticLabel(label) {
  const raw = normalizeWhitespace(label);
  if (!raw) return null;
  const core = raw.endsWith("동") ? raw.slice(0, -1) : raw;
  if (!core) return null;
  if (/^\d+$/.test(core)) return { kind: "numeric", token: core };
  if (/^[A-Za-z]$/.test(core)) return { kind: "letter", token: core.toUpperCase() };
  return null;
}

export function formatDongLabel(dong) {
  const parsed = parseDongSemanticLabel(dong);
  if (!parsed) return null;
  return `${parsed.token}동`;
}

export function summarizeRegisterDongEvidence(items) {
  const dongLabels = [];
  let dongNmPresent = 0;
  for (const item of items ?? []) {
    const dongNm = item?.dongNm ?? null;
    if (dongNm != null && String(dongNm).trim() !== "") {
      dongNmPresent += 1;
      dongLabels.push(String(dongNm).trim());
    }
  }
  const unique = [...new Set(dongLabels)];
  return {
    registerRowCount: items?.length ?? 0,
    dongNmPresentCount: dongNmPresent,
    uniqueDongLabelCount: unique.length,
    sampleDongLabels: unique.slice(0, 8),
  };
}

export function matchDongNm(dongNm, expectedDongLabel) {
  const left = parseDongSemanticLabel(dongNm);
  const right = parseDongSemanticLabel(expectedDongLabel);
  if (!left || !right) return false;
  if (left.kind !== right.kind) return false;
  return left.token === right.token;
}

export function extractPhaseToken(normalizedName) {
  const m = String(normalizedName ?? "").match(/(\d+)차/);
  return m ? m[1] : null;
}

export function extractDanjiToken(normalizedName) {
  const m = String(normalizedName ?? "").match(/(\d+)단지/);
  return m ? m[1] : null;
}

export function extractTowerToken(normalizedName) {
  const m = String(normalizedName ?? "").match(/([A-C])타워/);
  return m ? m[1] : null;
}

export function extractBlockTokens(normalizedName) {
  const name = String(normalizedName ?? "");
  const blocks = [];
  const re = /([A-C]\d+블록|\d+블록|[A-C]블록)/g;
  let m;
  while ((m = re.exec(name)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

export function tokenizeCompoundRemainder(remainder) {
  const tokens = [];
  let pos = 0;
  const sortedAncillary = [...SAFE_ANCILLARY_TOKENS].sort((a, b) => b.length - a.length);

  while (pos < remainder.length) {
    let advanced = false;
    for (const anc of sortedAncillary) {
      if (remainder.startsWith(anc, pos)) {
        tokens.push({ kind: "ancillary", value: anc });
        pos += anc.length;
        advanced = true;
        break;
      }
    }
    if (advanced) continue;

    const rest = remainder.slice(pos);
    const parkingIndex = rest.match(/^(\d+)(?=주차장)/);
    if (parkingIndex) {
      tokens.push({ kind: "parkingIndex", value: parkingIndex[1] });
      pos += parkingIndex[1].length;
      continue;
    }

    const rules = [
      { kind: "phase", re: /^(\d+)차/ },
      { kind: "danji", re: /^(\d+)단지/ },
      { kind: "tower", re: /^([A-C])타워/ },
      { kind: "blockNumber", re: /^(\d+)블록/ },
      { kind: "blockLetter", re: /^([A-C])블록/ },
      { kind: "towerLetters", re: /^([A-C]{1,3})(?=[^A-Za-z]|$)/ },
    ];

    let matched = false;
    for (const rule of rules) {
      const hit = rest.match(rule.re);
      if (hit) {
        tokens.push({ kind: rule.kind, value: hit[1] ?? hit[0] });
        pos += hit[0].length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    return { parseOk: false, tokens, unparsed: remainder.slice(pos) };
  }

  return { parseOk: true, tokens, unparsed: "" };
}

export function evaluateCompoundRemainderGuards(tokens, context = {}) {
  const coreHint = normalizeWhitespace(context.coreHint ?? "");
  const dongToken = context.dongToken ? String(context.dongToken).toUpperCase() : null;
  const corePhase = extractPhaseToken(coreHint);
  const coreDanji = extractDanjiToken(coreHint);
  const coreTower = extractTowerToken(coreHint);
  const violations = [];

  for (const token of tokens) {
    switch (token.kind) {
      case "phase":
        if (corePhase != null && token.value !== corePhase) {
          violations.push({ guard: "PHASE", reason: "REMAINDER_PHASE_CONFLICTS_WITH_CORE" });
        } else if (corePhase == null) {
          violations.push({ guard: "PHASE", reason: "REMAINDER_PHASE_WITHOUT_CORE_PHASE" });
        }
        break;
      case "danji":
        if (coreDanji != null && token.value !== coreDanji) {
          violations.push({ guard: "DANJI", reason: "REMAINDER_DANJI_CONFLICTS_WITH_CORE" });
        } else if (coreDanji == null) {
          violations.push({ guard: "DANJI", reason: "REMAINDER_DANJI_WITHOUT_CORE_DANJI" });
        }
        break;
      case "tower":
        if (coreTower != null && token.value !== coreTower) {
          violations.push({ guard: "TOWER", reason: "REMAINDER_TOWER_CONFLICTS_WITH_CORE" });
        } else if (dongToken != null && token.value !== dongToken) {
          violations.push({ guard: "TOWER", reason: "REMAINDER_TOWER_CONFLICTS_WITH_DONG" });
        } else if (dongToken == null && coreTower == null) {
          violations.push({ guard: "TOWER", reason: "REMAINDER_TOWER_NEEDS_CONTEXT" });
        }
        break;
      case "blockNumber":
      case "blockLetter":
        violations.push({ guard: "BLOCK", reason: "REMAINDER_BLOCK_IDENTITY_BEARING" });
        break;
      case "towerLetters":
        if (dongToken != null) {
          if (!token.value.includes(dongToken)) {
            violations.push({ guard: "TOWER", reason: "REMAINDER_TOWER_LETTERS_EXCLUDE_DONG" });
          }
        } else {
          violations.push({ guard: "TOWER", reason: "REMAINDER_TOWER_LETTERS_NEED_DONG_CONTEXT" });
        }
        break;
      case "ancillary":
      case "parkingIndex":
        break;
      default:
        violations.push({ guard: "UNKNOWN", reason: "UNPARSED_IDENTITY_TOKEN" });
    }
  }

  return { passed: violations.length === 0, violations };
}

export function validateCoreIdentityTokens(normalizedCore, normalizedHint) {
  const violations = [];
  const corePhase = extractPhaseToken(normalizedCore);
  const hintPhase = extractPhaseToken(normalizedHint);
  if (hintPhase != null && corePhase !== hintPhase) {
    violations.push({ guard: "PHASE", reason: "CORE_PHASE_MISMATCH" });
  }
  const coreDanji = extractDanjiToken(normalizedCore);
  const hintDanji = extractDanjiToken(normalizedHint);
  if (hintDanji != null && coreDanji !== hintDanji) {
    violations.push({ guard: "DANJI", reason: "CORE_DANJI_MISMATCH" });
  }
  const coreTower = extractTowerToken(normalizedCore);
  const hintTower = extractTowerToken(normalizedHint);
  if (hintTower != null && coreTower !== hintTower) {
    violations.push({ guard: "TOWER", reason: "CORE_TOWER_MISMATCH" });
  }
  return { passed: violations.length === 0, violations };
}

export function findSingleCoreOccurrence(normalizedBldNm, normalizedCore) {
  if (!normalizedCore || !normalizedBldNm) return { kind: "NOT_FOUND" };
  const first = normalizedBldNm.indexOf(normalizedCore);
  if (first === -1) return { kind: "NOT_FOUND" };
  const second = normalizedBldNm.indexOf(normalizedCore, first + normalizedCore.length);
  if (second !== -1) return { kind: "AMBIGUOUS" };
  return {
    kind: "FOUND",
    index: first,
    prefix: normalizedBldNm.slice(0, first),
    core: normalizedCore,
    suffix: normalizedBldNm.slice(first + normalizedCore.length),
  };
}

export function parseRegisterPrefix(prefix) {
  if (!prefix) {
    return { parseOk: true, tokens: [], unparsed: "", administrativeZone: null, blocks: [] };
  }

  const tokens = [];
  let pos = 0;

  while (pos < prefix.length) {
    const rest = prefix.slice(pos);
    const block = rest.match(BLOCK_TOKEN_RE);
    if (block) {
      tokens.push({ kind: "block", value: block[1] });
      pos += block[1].length;
      continue;
    }
    const zone = rest.match(ADMIN_ZONE_RE);
    if (zone) {
      tokens.push({ kind: "administrativeZone", value: zone[1] });
      pos += zone[1].length;
      continue;
    }
    return {
      parseOk: false,
      tokens,
      unparsed: prefix.slice(pos),
      administrativeZone: tokens.find((t) => t.kind === "administrativeZone")?.value ?? null,
      blocks: tokens.filter((t) => t.kind === "block").map((t) => t.value),
    };
  }

  return {
    parseOk: true,
    tokens,
    unparsed: "",
    administrativeZone: tokens.find((t) => t.kind === "administrativeZone")?.value ?? null,
    blocks: tokens.filter((t) => t.kind === "block").map((t) => t.value),
  };
}

export function evaluateStructuredPrefixGuards(prefixParse, normalizedHint) {
  const violations = [];
  if (!prefixParse.parseOk) {
    violations.push({ guard: "PREFIX", reason: "UNPARSEABLE_PREFIX", unparsed: prefixParse.unparsed });
    return { passed: false, violations };
  }

  const hintBlocks = extractBlockTokens(normalizedHint);
  const prefixBlocks = prefixParse.blocks ?? [];

  if (hintBlocks.length > 0) {
    if (hintBlocks.length !== prefixBlocks.length) {
      violations.push({ guard: "BLOCK", reason: "BLOCK_COUNT_MISMATCH" });
    } else {
      for (let i = 0; i < hintBlocks.length; i += 1) {
        if (hintBlocks[i] !== prefixBlocks[i]) {
          violations.push({ guard: "BLOCK", reason: "BLOCK_IDENTITY_MISMATCH" });
          break;
        }
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    blockContext:
      hintBlocks.length === 0 && prefixBlocks.length > 0 ? "ADDITIONAL_REGISTER_CONTEXT" : "MATCHED_OR_ABSENT",
  };
}

function assessStructuredPrefixCoreMatch(normalizedBldNm, normalizedHint, dongToken) {
  const occurrence = findSingleCoreOccurrence(normalizedBldNm, normalizedHint);
  if (occurrence.kind === "NOT_FOUND") {
    return {
      status: "MISMATCH",
      guardResult: { passed: false, violations: [{ guard: "CORE", reason: "CORE_NOT_FOUND" }] },
    };
  }
  if (occurrence.kind === "AMBIGUOUS") {
    return {
      status: "MISMATCH",
      guardResult: { passed: false, violations: [{ guard: "CORE", reason: "MULTIPLE_CORE_OCCURRENCES" }] },
    };
  }

  const coreIdentity = validateCoreIdentityTokens(occurrence.core, normalizedHint);
  if (!coreIdentity.passed) {
    return { status: "MISMATCH", guardResult: coreIdentity };
  }

  const prefixParse = parseRegisterPrefix(occurrence.prefix);
  const prefixGuard = evaluateStructuredPrefixGuards(prefixParse, normalizedHint);
  if (!prefixGuard.passed) {
    return { status: "MISMATCH", guardResult: prefixGuard };
  }

  let remainingTokens = [];
  if (occurrence.suffix) {
    const parsed = tokenizeCompoundRemainder(occurrence.suffix);
    if (!parsed.parseOk) {
      return {
        status: "MISMATCH",
        guardResult: {
          passed: false,
          violations: [{ guard: "SUFFIX", reason: "SUFFIX_PARSE_FAILED", unparsed: parsed.unparsed }],
        },
      };
    }
    remainingTokens = parsed.tokens;
    const suffixGuard = evaluateCompoundRemainderGuards(parsed.tokens, {
      coreHint: normalizedHint,
      dongToken,
    });
    if (!suffixGuard.passed) {
      return { status: "MISMATCH", guardResult: suffixGuard, remainingTokens };
    }
  }

  return {
    status: "REGISTER_STRUCTURED_PREFIX_CORE_MATCH",
    matchedCore: normalizedHint,
    structuredPrefix: {
      raw: occurrence.prefix,
      administrativeZone: prefixParse.administrativeZone,
      blocks: prefixParse.blocks,
      blockContext: prefixGuard.blockContext,
      tokens: prefixParse.tokens,
    },
    remainingTokens,
    guardResult: { passed: true, violations: [] },
  };
}

function isSuccessfulComplexMatch(status) {
  return (
    status === "EXACT_NORMALIZED" ||
    status === "REGISTER_COMPOUND_CORE_MATCH" ||
    status === "REGISTER_STRUCTURED_PREFIX_CORE_MATCH"
  );
}

export function assessComplexNameMatch(bldNm, complexHint, options = {}) {
  const dongToken =
    options.dongToken ??
    (options.dong != null ? parseDongSemanticLabel(options.dong)?.token ?? null : null);

  if (!complexHint) {
    return { status: "UNKNOWN", normalizedBldNm: normalizeWhitespace(bldNm), normalizedHint: null };
  }

  const normalizedBldNm = normalizeWhitespace(bldNm);
  const normalizedHint = normalizeWhitespace(complexHint);

  if (!normalizedBldNm || !normalizedHint) {
    return { status: "UNKNOWN", normalizedBldNm, normalizedHint };
  }

  if (normalizedBldNm === normalizedHint) {
    return {
      status: "EXACT_NORMALIZED",
      normalizedBldNm,
      normalizedHint,
      matchedCore: normalizedHint,
      remainingTokens: [],
      guardResult: { passed: true, violations: [] },
    };
  }

  if (normalizedBldNm.startsWith(normalizedHint)) {
    const remainder = normalizedBldNm.slice(normalizedHint.length);
    if (!remainder) {
      return {
        status: "MISMATCH",
        normalizedBldNm,
        normalizedHint,
        matchedCore: normalizedHint,
        remainingTokens: [],
        guardResult: { passed: false, violations: [{ guard: "PREFIX", reason: "EMPTY_REMAINDER_UNEXPECTED" }] },
      };
    }

    const parsed = tokenizeCompoundRemainder(remainder);
    if (!parsed.parseOk) {
      return {
        status: "MISMATCH",
        normalizedBldNm,
        normalizedHint,
        matchedCore: normalizedHint,
        remainingTokens: parsed.tokens,
        guardResult: {
          passed: false,
          violations: [{ guard: "PARSE", reason: "REMAINDER_PARSE_FAILED", unparsed: parsed.unparsed }],
        },
      };
    }

    const nonAncillary = parsed.tokens.filter((t) => t.kind !== "ancillary" && t.kind !== "parkingIndex");
    if (nonAncillary.length === 0 && parsed.tokens.length > 0) {
      return {
        status: "REGISTER_COMPOUND_CORE_MATCH",
        normalizedBldNm,
        normalizedHint,
        matchedCore: normalizedHint,
        remainingTokens: parsed.tokens,
        guardResult: { passed: true, violations: [] },
      };
    }

    const guardResult = evaluateCompoundRemainderGuards(parsed.tokens, {
      coreHint: normalizedHint,
      dongToken,
    });

    if (!guardResult.passed) {
      return {
        status: "MISMATCH",
        normalizedBldNm,
        normalizedHint,
        matchedCore: normalizedHint,
        remainingTokens: parsed.tokens,
        guardResult,
      };
    }

    return {
      status: "REGISTER_COMPOUND_CORE_MATCH",
      normalizedBldNm,
      normalizedHint,
      matchedCore: normalizedHint,
      remainingTokens: parsed.tokens,
      guardResult,
    };
  }

  const structured = assessStructuredPrefixCoreMatch(normalizedBldNm, normalizedHint, dongToken);
  return {
    normalizedBldNm,
    normalizedHint,
    ...structured,
    structuredPrefix: structured.structuredPrefix ?? null,
    remainingTokens: structured.remainingTokens ?? [],
    guardResult: structured.guardResult ?? { passed: false, violations: [] },
  };
}

export function matchBuildingRegisterIdentity(items, target) {
  const expectedDongLabel = formatDongLabel(target.dong);
  const dongToken = parseDongSemanticLabel(target.dong)?.token ?? null;
  const dongMatches = [];
  const complexStatuses = new Set();

  for (const item of items ?? []) {
    const dongNm = item.dongNm ?? item.DONG_NM ?? null;
    const bldNm = item.bldNm ?? item.BLD_NM ?? null;
    if (!matchDongNm(dongNm, expectedDongLabel)) continue;

    const complex = assessComplexNameMatch(bldNm, target.complexNameHint ?? null, { dongToken });
    complexStatuses.add(complex.status);
    dongMatches.push({
      dongNm,
      bldNm,
      platPlc: item.platPlc ?? item.PLAT_PLC ?? null,
      newPlatPlc: item.newPlatPlc ?? item.NEW_PLAT_PLC ?? null,
      complexNameMatch: complex.status,
      normalizedBldNm: complex.normalizedBldNm,
      complexMatchDetail: {
        matchedCore: complex.matchedCore ?? null,
        structuredPrefix: complex.structuredPrefix ?? null,
        remainingTokens: complex.remainingTokens ?? [],
        guardResult: complex.guardResult ?? null,
      },
    });
  }

  let dongMatch = "NO";
  let failureReason = null;
  if (!expectedDongLabel) {
    failureReason = "REGISTER_DONG_NOT_FOUND";
  } else if (dongMatches.length === 0) {
    failureReason = "REGISTER_DONG_NOT_FOUND";
  } else if (dongMatches.length > 1) {
    dongMatch = "AMBIGUOUS";
    failureReason = "REGISTER_DONG_AMBIGUOUS";
  } else {
    dongMatch = "YES";
  }

  let complexNameMatch = "UNKNOWN";
  if (dongMatches.length === 1) {
    complexNameMatch = dongMatches[0].complexNameMatch;
    if (complexNameMatch === "MISMATCH") {
      failureReason = failureReason ?? "REGISTER_COMPLEX_MISMATCH";
    }
  } else if (complexStatuses.has("EXACT_NORMALIZED")) {
    complexNameMatch = "EXACT_NORMALIZED";
  } else if (complexStatuses.has("REGISTER_COMPOUND_CORE_MATCH")) {
    complexNameMatch = "REGISTER_COMPOUND_CORE_MATCH";
  } else if (complexStatuses.has("REGISTER_STRUCTURED_PREFIX_CORE_MATCH")) {
    complexNameMatch = "REGISTER_STRUCTURED_PREFIX_CORE_MATCH";
  } else if (complexStatuses.has("MISMATCH")) {
    complexNameMatch = "MISMATCH";
  }

  return {
    expectedDongLabel,
    parcelMatch: items?.length ? "YES" : "NO",
    dongMatch,
    complexNameMatch,
    failureReason,
    matches: dongMatches,
    identityVerified:
      dongMatch === "YES" && isSuccessfulComplexMatch(complexNameMatch) && dongMatches.length === 1,
  };
}
