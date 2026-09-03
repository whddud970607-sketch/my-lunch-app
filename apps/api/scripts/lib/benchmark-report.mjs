/**
 * Research-only benchmark report helpers.
 * Separates terminal state from step-level failure reasons.
 */

export const TerminalState = {
  BUILDING_CENTER_VERIFIED: "BUILDING_CENTER_VERIFIED",
  IDENTITY_UNRESOLVED: "IDENTITY_UNRESOLVED",
  GEOMETRY_UNRESOLVED: "GEOMETRY_UNRESOLVED",
  AMBIGUOUS: "AMBIGUOUS",
  NO_MATCH: "NO_MATCH",
  DRY_RUN_BLOCKED: "DRY_RUN_BLOCKED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
};

export function mapParcelResolverToReport(parcelResult) {
  if (parcelResult.status === "BLOCKED") {
    return {
      terminal: TerminalState.DRY_RUN_BLOCKED,
      failureReason: "PARCEL_UNRESOLVED",
      parcelResolved: "NO",
      buildingHubCalls: 0,
      vworldCalls: 0,
    };
  }
  if (parcelResult.status === "UNRESOLVED") {
    return {
      terminal: TerminalState.IDENTITY_UNRESOLVED,
      failureReason: "PARCEL_UNRESOLVED",
      parcelResolved: "NO",
      buildingHubCalls: 0,
      vworldCalls: 0,
    };
  }
  if (parcelResult.status === "AMBIGUOUS") {
    return {
      terminal: TerminalState.IDENTITY_UNRESOLVED,
      failureReason: "PARCEL_AMBIGUOUS",
      parcelResolved: "NO",
      buildingHubCalls: 0,
      vworldCalls: 0,
    };
  }
  if (parcelResult.status === "PROVIDER_ERROR") {
    return {
      terminal: TerminalState.PROVIDER_ERROR,
      failureReason: parcelResult.reason ?? "PARCEL_PROVIDER_ERROR",
      parcelResolved: "NO",
      buildingHubCalls: 0,
      vworldCalls: 0,
    };
  }
  return {
    terminal: null,
    failureReason: null,
    parcelResolved: "YES",
    parcel: parcelResult.parcel,
    buildingHubCalls: null,
    vworldCalls: null,
  };
}

export function mapRegisterIdentityToTerminal(identity, hubKind = "OK") {
  if (hubKind === "AUTH_ERROR") {
    return { terminal: TerminalState.PROVIDER_ERROR, failureReason: "BUILDING_HUB_AUTH_ERROR" };
  }
  if (hubKind === "HTTP_ERROR") {
    return { terminal: TerminalState.PROVIDER_ERROR, failureReason: "BUILDING_HUB_HTTP_ERROR" };
  }
  if (hubKind === "API_ERROR") {
    return { terminal: TerminalState.PROVIDER_ERROR, failureReason: "BUILDING_HUB_API_ERROR" };
  }
  if (!identity.identityVerified) {
    return {
      terminal: TerminalState.IDENTITY_UNRESOLVED,
      failureReason: identity.failureReason ?? "REGISTER_DONG_NOT_FOUND",
    };
  }
  return { terminal: null, failureReason: null };
}

export function mapVworldToTerminal(vworldClass) {
  if (vworldClass.terminal === "AMBIGUOUS") {
    return { terminal: TerminalState.AMBIGUOUS, failureReason: vworldClass.failureReason };
  }
  if (vworldClass.terminal === "NO_MATCH") {
    return { terminal: TerminalState.NO_MATCH, failureReason: vworldClass.failureReason };
  }
  if (vworldClass.terminal === "GEOMETRY_UNRESOLVED") {
    return { terminal: TerminalState.GEOMETRY_UNRESOLVED, failureReason: vworldClass.failureReason };
  }
  if (vworldClass.terminal === "ERROR") {
    return { terminal: TerminalState.PROVIDER_ERROR, failureReason: vworldClass.failureReason };
  }
  return { terminal: null, failureReason: null };
}

export function createTargetReport(targetId, steps = {}) {
  return {
    targetId,
    ...steps,
  };
}

export function finalizeDryRunReport(targetReport) {
  return {
    ...targetReport,
    mode: "DRY_RUN",
    networkRequestCount: 0,
    credentialUsed: "NO",
  };
}
