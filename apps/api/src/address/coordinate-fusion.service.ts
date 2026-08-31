import type { CoordinateCandidate } from "./address.types";

const COORDINATE_PRIORITY: Record<string, number> = {
  VEHICLE_ACCESS_VERIFIED: 100,
  BUILDING_ENTRANCE_VERIFIED: 90,
  BUILDING_VERIFIED: 80,
  BUILDING_CENTER: 70,
  BUILDING_CANDIDATE: 60,
  VEHICLE_ACCESS_CANDIDATE: 55,
  BUILDING_ENTRANCE_CANDIDATE: 50,
  COMPLEX_REPRESENTATIVE: 30,
  UNRESOLVED: 0,
};

export type FusionResult = {
  ranked: CoordinateCandidate[];
  hasConflict: boolean;
  conflictProviders: string[];
};

export function rankCoordinateCandidates(
  candidates: CoordinateCandidate[],
): CoordinateCandidate[] {
  return [...candidates].sort((a, b) => {
    const typeDiff =
      (COORDINATE_PRIORITY[b.coordinateType] ?? 0) -
      (COORDINATE_PRIORITY[a.coordinateType] ?? 0);
    if (typeDiff !== 0) return typeDiff;
    return b.confidence - a.confidence;
  });
}

/**
 * Detect meaningful disagreement between provider results (> ~120m apart).
 */
export function detectCoordinateConflict(
  candidates: CoordinateCandidate[],
): { hasConflict: boolean; conflictProviders: string[] } {
  if (candidates.length < 2) {
    return { hasConflict: false, conflictProviders: [] };
  }
  const thresholdMeters = 120;
  const providers = new Set<string>();
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const d = haversineMeters(
        candidates[i].latitude,
        candidates[i].longitude,
        candidates[j].latitude,
        candidates[j].longitude,
      );
      if (d > thresholdMeters) {
        providers.add(candidates[i].provider);
        providers.add(candidates[j].provider);
      }
    }
  }
  return {
    hasConflict: providers.size >= 2,
    conflictProviders: [...providers],
  };
}

export function fuseCandidates(
  candidates: CoordinateCandidate[],
): FusionResult {
  const ranked = rankCoordinateCandidates(candidates);
  const { hasConflict, conflictProviders } = detectCoordinateConflict(ranked);
  return { ranked, hasConflict, conflictProviders };
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}
