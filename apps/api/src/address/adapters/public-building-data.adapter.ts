import type { CoordinateCandidate, ParsedAddress } from "../address.types";
import type { BuildingDataProvider } from "../ports/building-data-provider.port";

/**
 * Placeholder for 공공 건물/주소 공간정보 adapters.
 * Does not invent coordinates — returns empty until an approved public source is wired.
 */
export class PublicBuildingDataAdapter implements BuildingDataProvider {
  readonly providerId = "public_building" as const;

  isConfigured(): boolean {
    return false;
  }

  async resolveBuildingCandidates(
    _parsed: ParsedAddress,
  ): Promise<CoordinateCandidate[]> {
    return [];
  }
}
