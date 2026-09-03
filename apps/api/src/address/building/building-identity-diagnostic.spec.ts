import {
  buildSanitizedIdentityDiagnostic,
  matchBuildingRegisterIdentity,
} from "./building-identity-matcher";
import { extractRegisterItems } from "./building-hub-client";
import { TRACK_A_PIPELINE_FIXTURES } from "../fixtures/track-a-production-fixtures";

describe("buildSanitizedIdentityDiagnostic", () => {
  it("R01 frozen fixture → identity verified (NETWORK=0)", () => {
    const fx = TRACK_A_PIPELINE_FIXTURES.R01;
    const items = extractRegisterItems(
      fx.buildingHubPages[1] as Record<string, unknown>,
    );
    const match = matchBuildingRegisterIdentity(items as never, {
      dong: fx.dong,
      complexNameHint: fx.complexNameHint,
    });
    const diag = buildSanitizedIdentityDiagnostic({
      registerRows: items as never,
      matchResult: match,
    });

    expect(diag.registerCandidateCount).toBeGreaterThanOrEqual(1);
    expect(diag.candidateHasDongName).toBe(true);
    expect(diag.candidateHasBuildingName).toBe(true);
    expect(diag.dongMatch).toBe("YES");
    expect(diag.complexNameMatch).toBe("EXACT_NORMALIZED");
    expect(diag.identityVerified).toBe(true);
    expect(diag.identityFailureCode).toBeNull();
    expect(JSON.stringify(diag)).not.toMatch(/서창|푸르지오|504동/);
  });

  it("dong match + complex UNKNOWN → COMPLEX_NAME_UNKNOWN", () => {
    const items = [{ dongNm: "504동", bldNm: "서창센트럴푸르지오" }];
    const match = matchBuildingRegisterIdentity(items, {
      dong: "504",
      complexNameHint: null,
    });
    const diag = buildSanitizedIdentityDiagnostic({
      registerRows: items,
      matchResult: match,
    });
    expect(diag.dongMatch).toBe("YES");
    expect(diag.complexNameMatch).toBe("UNKNOWN");
    expect(diag.identityVerified).toBe(false);
    expect(diag.identityFailureCode).toBe("COMPLEX_NAME_UNKNOWN");
  });

  it("dong match + complex MISMATCH → COMPLEX_NAME_MISMATCH", () => {
    const items = [{ dongNm: "504동", bldNm: "다른단지" }];
    const match = matchBuildingRegisterIdentity(items, {
      dong: "504",
      complexNameHint: "서창센트럴푸르지오",
    });
    const diag = buildSanitizedIdentityDiagnostic({
      registerRows: items,
      matchResult: match,
    });
    expect(diag.identityFailureCode).toBe("COMPLEX_NAME_MISMATCH");
    expect(diag.identityVerified).toBe(false);
  });

  it("zero rows → NO_REGISTER_ROWS", () => {
    const match = matchBuildingRegisterIdentity([], {
      dong: "504",
      complexNameHint: "서창센트럴푸르지오",
    });
    const diag = buildSanitizedIdentityDiagnostic({
      registerRows: [],
      matchResult: match,
    });
    expect(diag.identityFailureCode).toBe("NO_REGISTER_ROWS");
  });

  it("dong mismatch with rows present → DONG_MISMATCH", () => {
    const items = [{ dongNm: "101동", bldNm: "서창센트럴푸르지오" }];
    const match = matchBuildingRegisterIdentity(items, {
      dong: "504",
      complexNameHint: "서창센트럴푸르지오",
    });
    const diag = buildSanitizedIdentityDiagnostic({
      registerRows: items,
      matchResult: match,
    });
    expect(diag.dongMatch).toBe("NO");
    expect(diag.identityFailureCode).toBe("DONG_MISMATCH");
  });

  /**
   * Phase 2C.5D live shape (sanitized): multi-row BuildingHUB page with
   * exactly one dong+complex match still verifies — NETWORK=0 recreation.
   */
  it("multi-row register page with one EXACT_NORMALIZED match → verified", () => {
    const items = [
      { dongNm: "101동", bldNm: "다른단지A" },
      { dongNm: "504동", bldNm: "서창센트럴푸르지오" },
      { dongNm: "102동", bldNm: "다른단지B" },
    ];
    // Pad to resemble multi-row live pages without encoding live names.
    while (items.length < 24) {
      items.push({
        dongNm: `${100 + items.length}동`,
        bldNm: `기타건물${items.length}`,
      });
    }
    const match = matchBuildingRegisterIdentity(items, {
      dong: "504",
      complexNameHint: "서창센트럴푸르지오",
    });
    const diag = buildSanitizedIdentityDiagnostic({
      registerRows: items,
      matchResult: match,
    });
    expect(diag.registerCandidateCount).toBe(24);
    expect(diag.matchedCandidateCount).toBe(1);
    expect(diag.dongMatch).toBe("YES");
    expect(diag.complexNameMatch).toBe("EXACT_NORMALIZED");
    expect(diag.identityVerified).toBe(true);
    expect(diag.identityFailureCode).toBeNull();
  });

  it("compose→extract→target parity keeps R01 identity inputs (NETWORK=0)", () => {
    const {
      composeDetailAddressWithComplex,
    } = require("../../import/import-detail-compose") as typeof import("../../import/import-detail-compose");
    const {
      parseAddress,
      resolveComplexNameHint,
      parseDong,
    } = require("../address.parser") as typeof import("../address.parser");
    const {
      targetFromParsedAddress,
    } = require("./building-resolution.stage") as typeof import("./building-resolution.stage");

    const fx = TRACK_A_PIPELINE_FIXTURES.R01;
    const composed = composeDetailAddressWithComplex(
      fx.complexNameHint,
      `${fx.dong}동`,
    )!;
    const hint = resolveComplexNameHint({ detailAddress: composed });
    const dong = parseDong(composed);
    const parsed = parseAddress({
      roadAddress: fx.roadAddress,
      detailAddress: composed,
      complexNameHint: hint,
      dongHint: dong,
    });
    const target = targetFromParsedAddress(parsed);
    expect(hint).toBe(fx.complexNameHint);
    expect(dong).toBe(fx.dong);
    expect(target?.complexNameHint).toBe(fx.complexNameHint);
    expect(target?.dong).toBe(fx.dong);
  });
});
