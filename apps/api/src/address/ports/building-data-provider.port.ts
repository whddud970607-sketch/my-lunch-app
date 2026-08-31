import type { CoordinateCandidate, ParsedAddress } from "../address.types";

/**
 * Public building / spatial data — not wired to production API in this phase.
 * Port exists so domain never references a specific government SDK.
 */
export interface BuildingDataProvider {
  readonly providerId: "public_building";
  isConfigured(): boolean;
  resolveBuildingCandidates(parsed: ParsedAddress): Promise<CoordinateCandidate[]>;
}

export const BUILDING_DATA_PROVIDER = Symbol("BUILDING_DATA_PROVIDER");
