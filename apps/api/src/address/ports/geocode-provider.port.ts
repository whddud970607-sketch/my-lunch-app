import type { CoordinateCandidate, GeocodeProviderId, ParsedAddress } from "../address.types";

export interface GeocodeProvider {
  readonly providerId: GeocodeProviderId;
  isConfigured(): boolean;
  resolveCandidates(parsed: ParsedAddress): Promise<CoordinateCandidate[]>;
}

export const GEOCODE_PROVIDER = Symbol("GEOCODE_PROVIDER");
