import type { PinPlacementDecision, ResolutionFailureReason } from "./address.types";

export function classifyUnresolved(
  decision: PinPlacementDecision,
): ResolutionFailureReason {
  if (decision.unresolvedReason) {
    return decision.unresolvedReason;
  }
  if (!decision.candidate) {
    return "no_candidates";
  }
  if (decision.pinQuality === "COMPLEX_ONLY" && decision.requiresDong) {
    return "dong_required_but_unresolved";
  }
  return "quality_gate_rejected";
}

export function unresolvedUserMessage(reason: ResolutionFailureReason): string {
  switch (reason) {
    case "provider_not_configured":
      return "Geocoding provider is not configured.";
    case "provider_timeout":
      return "Geocoding provider timed out.";
    case "provider_error":
      return "Geocoding provider returned an error.";
    case "no_candidates":
      return "No coordinate could be resolved for this address.";
    case "conflicting_candidates":
      return "Providers returned conflicting coordinates.";
    case "dong_required_but_unresolved":
      return "Building dong could not be resolved to a verified coordinate.";
    case "quality_gate_rejected":
      return "Coordinate quality is insufficient for delivery pin placement.";
    case "public_data_unavailable":
      return "Public building data is not available for this address.";
    default:
      return "Address could not be resolved.";
  }
}
