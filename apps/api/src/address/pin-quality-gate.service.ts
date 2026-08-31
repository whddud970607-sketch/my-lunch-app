import type {
  CoordinateCandidate,
  PinAccuracyDb,
  PinPlacementDecision,
  PinQualityLevel,
  ResolutionFailureReason,
} from "./address.types";
import { mapCoordinateTypeToPinQuality } from "./confidence-scorer.service";

export type PinQualityGateInput = {
  rankedCandidates: CoordinateCandidate[];
  requiresDong: boolean;
  hasProviderConflict: boolean;
  adjustedConfidences: number[];
};

/**
 * Pin Placement gate — selects best pin, does NOT geocode.
 */
export function applyPinQualityGate(input: PinQualityGateInput): PinPlacementDecision {
  const {
    rankedCandidates,
    requiresDong,
    hasProviderConflict,
    adjustedConfidences,
  } = input;

  if (rankedCandidates.length === 0) {
    return unresolvedDecision([], "no_candidates", "No coordinate candidates");
  }

  const top = rankedCandidates[0];
  const topConfidence = adjustedConfidences[0] ?? top.confidence;
  let pinQuality = mapCoordinateTypeToPinQuality(
    top.coordinateType,
    topConfidence,
    requiresDong,
  );

  if (requiresDong && pinQuality === "COMPLEX_ONLY") {
    return unresolvedDecision(
      rankedCandidates,
      "dong_required_but_unresolved",
      "Dong-specific coordinate required but only complex-level result available",
      requiresDong,
    );
  }

  if (hasProviderConflict && pinQuality !== "VERIFIED") {
    pinQuality = downgradeQuality(pinQuality);
  }

  if (pinQuality === "UNRESOLVED") {
    return unresolvedDecision(
      rankedCandidates,
      "quality_gate_rejected",
      "Candidate failed pin quality gate",
      requiresDong,
    );
  }

  return {
    candidate: { ...top, confidence: topConfidence },
    pinQuality,
    pinAccuracy: mapPinAccuracy(top.coordinateType, pinQuality),
    unresolvedReason: null,
    failureMessage: null,
    allCandidates: rankedCandidates,
    requiresDong,
  };
}

function mapPinAccuracy(
  coordinateType: CoordinateCandidate["coordinateType"],
  pinQuality: PinQualityLevel,
): PinAccuracyDb {
  if (pinQuality === "UNRESOLVED") return "address";
  if (
    coordinateType === "BUILDING_ENTRANCE_VERIFIED" ||
    coordinateType === "BUILDING_ENTRANCE_CANDIDATE"
  ) {
    return "entrance";
  }
  if (
    coordinateType === "BUILDING_CANDIDATE" ||
    coordinateType === "BUILDING_VERIFIED" ||
    coordinateType === "BUILDING_CENTER"
  ) {
    return "building";
  }
  return "address";
}

function downgradeQuality(level: PinQualityLevel): PinQualityLevel {
  switch (level) {
    case "VERIFIED":
      return "HIGH_CONFIDENCE";
    case "HIGH_CONFIDENCE":
      return "CANDIDATE";
    case "CANDIDATE":
      return "COMPLEX_ONLY";
    default:
      return "UNRESOLVED";
  }
}

function unresolvedDecision(
  allCandidates: CoordinateCandidate[],
  reason: ResolutionFailureReason,
  message: string,
  requiresDong = false,
): PinPlacementDecision {
  return {
    candidate: null,
    pinQuality: "UNRESOLVED",
    pinAccuracy: "address",
    unresolvedReason: reason,
    failureMessage: message,
    allCandidates,
    requiresDong,
  };
}
