/**
 * PHASE_2C.5G — network-free regression for live Hub cardinality shape
 * through the REAL production response path (fetchAllRegisterPages).
 *
 * TEST_NETWORK_CALL_CAPABLE = NO
 * TEST_DB_MUTATION_CAPABLE = NO
 */
import {
  fetchAllRegisterPages,
  paginationPlan,
  DEFAULT_PAGE_SIZE,
} from "./building-hub-client";
import {
  buildSanitizedIdentityDiagnostic,
  matchBuildingRegisterIdentity,
} from "./building-identity-matcher";
import {
  buildR01LiveCardinalityHubBody,
  R01_LIVE_HUB_SHAPE_FINGERPRINT,
  R01_LIVE_HUB_SHAPE_TARGET,
} from "../fixtures/r01-live-hub-shape-fixture";
import { TRACK_A_PIPELINE_FIXTURES } from "../fixtures/track-a-production-fixtures";
import type { RegisterRow } from "./building-resolution.types";

async function productionHubIdentityFromBody(body: Record<string, unknown>) {
  const hubPages = await fetchAllRegisterPages(
    async () => ({ httpStatus: 200, body }),
    { maxPages: 1 },
  );
  const registerRows = (hubPages.items ?? []).filter(
    (item) => item != null,
  ) as (RegisterRow & Record<string, unknown>)[];
  const match = matchBuildingRegisterIdentity(registerRows, {
    dong: R01_LIVE_HUB_SHAPE_TARGET.dong,
    complexNameHint: R01_LIVE_HUB_SHAPE_TARGET.complexNameHint,
  });
  const diag = buildSanitizedIdentityDiagnostic({
    registerRows,
    matchResult: match,
  });
  const totalCount =
    "totalCount" in hubPages ? (hubPages.totalCount as number | null) : null;
  const requiredPages =
    totalCount != null
      ? paginationPlan(totalCount, DEFAULT_PAGE_SIZE).pageCount
      : null;
  return {
    hubPages,
    diag,
    additionalPageRequired:
      (!hubPages.ok && hubPages.kind === "BUDGET_EXCEEDED") ||
      (typeof requiredPages === "number" && requiredPages > 1),
  };
}

describe("PHASE_2C.5G live Hub shape via production fetchAllRegisterPages", () => {
  it("frozen single-row control still verifies (NETWORK=0)", async () => {
    const frozen = TRACK_A_PIPELINE_FIXTURES.R01.buildingHubPages[1] as Record<
      string,
      unknown
    >;
    const { hubPages, diag } = await productionHubIdentityFromBody(frozen);
    expect(hubPages.ok).toBe(true);
    expect(diag.registerCandidateCount).toBe(1);
    expect(diag.matchedCandidateCount).toBe(1);
    expect(diag.identityVerified).toBe(true);
    expect(diag.complexNameMatch).toBe("EXACT_NORMALIZED");
  });

  it("24-row live cardinality shape verifies through production path", async () => {
    const body = buildR01LiveCardinalityHubBody();
    const { hubPages, diag, additionalPageRequired } =
      await productionHubIdentityFromBody(body);

    expect(hubPages.ok).toBe(true);
    expect(hubPages.kind).toBe(R01_LIVE_HUB_SHAPE_FINGERPRINT.pageClassification);
    expect(diag.registerCandidateCount).toBe(
      R01_LIVE_HUB_SHAPE_FINGERPRINT.extractedItemCount,
    );
    expect(diag.matchedCandidateCount).toBe(
      R01_LIVE_HUB_SHAPE_FINGERPRINT.matchedCandidateCount,
    );
    expect(diag.dongMatch).toBe(R01_LIVE_HUB_SHAPE_FINGERPRINT.dongMatch);
    expect(diag.complexNameMatch).toBe(
      R01_LIVE_HUB_SHAPE_FINGERPRINT.complexNameMatch,
    );
    expect(diag.identityVerified).toBe(
      R01_LIVE_HUB_SHAPE_FINGERPRINT.identityVerified,
    );
    expect(diag.candidateHasDongName).toBe(
      R01_LIVE_HUB_SHAPE_FINGERPRINT.candidateHasDongName,
    );
    expect(diag.candidateHasBuildingName).toBe(
      R01_LIVE_HUB_SHAPE_FINGERPRINT.candidateHasBuildingName,
    );
    expect(additionalPageRequired).toBe(
      R01_LIVE_HUB_SHAPE_FINGERPRINT.additionalPageRequired,
    );
    expect(diag.identityFailureCode).toBeNull();
  });

  it("does not call extract outside fetchAllRegisterPages for identity", async () => {
    // Structural guarantee: this suite only uses fetchAllRegisterPages + matcher.
    const body = buildR01LiveCardinalityHubBody();
    let fetchCalls = 0;
    const hubPages = await fetchAllRegisterPages(
      async () => {
        fetchCalls += 1;
        return { httpStatus: 200, body };
      },
      { maxPages: 1 },
    );
    expect(fetchCalls).toBe(1);
    expect(hubPages.items.length).toBe(24);
  });
});
