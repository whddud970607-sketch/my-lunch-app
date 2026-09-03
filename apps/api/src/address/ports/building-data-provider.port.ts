import type { CoordinateCandidate, ParsedAddress } from "../address.types";
import type { ResolutionDiagnosticSink } from "../building/resolution-diagnostic-trace";

export type BuildingResolveOptions = {
  diagnosticTrace?: ResolutionDiagnosticSink | null;
};

/**
 * Public building / spatial data — not wired to production API in this phase.
 * Port exists so domain never references a specific government SDK.
 */
export interface BuildingDataProvider {
  readonly providerId: "public_building";
  isConfigured(): boolean;
  resolveBuildingCandidates(
    parsed: ParsedAddress,
    options?: BuildingResolveOptions,
  ): Promise<CoordinateCandidate[]>;
}

export const BUILDING_DATA_PROVIDER = Symbol("BUILDING_DATA_PROVIDER");
