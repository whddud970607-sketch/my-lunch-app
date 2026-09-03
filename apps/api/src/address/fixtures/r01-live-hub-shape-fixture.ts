/**
 * PHASE_2C.5G — sanitized live Hub shape for R01 (NETWORK=0).
 *
 * Observed live fingerprint (2C.5G diagnostic, no PII):
 *   class=OK; items=24; matched=1; dong=YES;
 *   complex=EXACT_NORMALIZED; verified=YES; budget=NO;
 *   morePages=NO; total=24; hasDong=YES; hasBld=YES
 *
 * Synthetic row labels only — not live provider strings.
 */

export const R01_LIVE_HUB_SHAPE_FINGERPRINT = {
  pageClassification: "OK",
  totalCount: 24,
  extractedItemCount: 24,
  matchedCandidateCount: 1,
  dongMatch: "YES",
  complexNameMatch: "EXACT_NORMALIZED",
  identityVerified: true,
  additionalPageRequired: false,
  candidateHasDongName: true,
  candidateHasBuildingName: true,
} as const;

/** Synthetic complex / dong labels for offline reproduction (not live data). */
const SYNTH_COMPLEX = "서창센트럴푸르지오";
const SYNTH_DONG_LABEL = "504동";

function hubBody(items: unknown[], totalCount = items.length) {
  return {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE" },
      body: { totalCount, items: { item: items } },
    },
  };
}

/**
 * 24-row page: one EXACT identity row + 23 distractors.
 * Mirrors live cardinality; names are synthetic Track A labels.
 */
export function buildR01LiveCardinalityHubBody(): Record<string, unknown> {
  const items: Array<{ dongNm: string; bldNm: string }> = [
    { dongNm: SYNTH_DONG_LABEL, bldNm: SYNTH_COMPLEX },
  ];
  while (items.length < 24) {
    items.push({
      dongNm: `${100 + items.length}동`,
      bldNm: `SYNTH_DISTRACTOR_${items.length}`,
    });
  }
  return hubBody(items, 24);
}

export const R01_LIVE_HUB_SHAPE_TARGET = {
  dong: "504",
  complexNameHint: SYNTH_COMPLEX,
} as const;
