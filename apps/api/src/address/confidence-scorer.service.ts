import type {
  CoordinateCandidate,
  CoordinateType,
  PinQualityLevel,
} from "./address.types";

export function scoreCandidateConfidence(
  candidate: CoordinateCandidate,
  opts: { requiresDong: boolean; hasProviderConflict: boolean },
): number {
  let score = candidate.confidence;

  if (candidate.coordinateType === "BUILDING_CANDIDATE" && candidate.resolvedDong) {
    score += 0.08;
  }
  if (candidate.coordinateType === "BUILDING_CENTER") {
    score = Math.max(score, 0.95);
  }
  if (candidate.coordinateType === "COMPLEX_REPRESENTATIVE" && opts.requiresDong) {
    score -= 0.25;
  }
  if (opts.hasProviderConflict) {
    score -= 0.15;
  }

  return Math.max(0, Math.min(1, score));
}

export function mapCoordinateTypeToPinQuality(
  coordinateType: CoordinateType,
  confidence: number,
  requiresDong: boolean,
): PinQualityLevel {
  if (coordinateType === "UNRESOLVED") {
    return "UNRESOLVED";
  }
  if (
    coordinateType === "BUILDING_ENTRANCE_VERIFIED" ||
    coordinateType === "VEHICLE_ACCESS_VERIFIED" ||
    coordinateType === "BUILDING_VERIFIED" ||
    coordinateType === "BUILDING_CENTER"
  ) {
    return "VERIFIED";
  }
  if (
    coordinateType === "BUILDING_CANDIDATE" &&
    confidence >= 0.75 &&
    !requiresDong
  ) {
    return "HIGH_CONFIDENCE";
  }
  if (coordinateType === "BUILDING_CANDIDATE" && confidence >= 0.7) {
    return requiresDong ? "CANDIDATE" : "HIGH_CONFIDENCE";
  }
  if (coordinateType === "COMPLEX_REPRESENTATIVE") {
    return "COMPLEX_ONLY";
  }
  if (confidence >= 0.55) {
    return "CANDIDATE";
  }
  return "UNRESOLVED";
}
