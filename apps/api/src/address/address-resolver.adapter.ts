import { Injectable } from "@nestjs/common";
import type {
  AddressResolveResult,
  AddressResolver,
} from "../engines/engine.ports";
import { normalizeAddressWhitespace } from "./address.parser";
import { AddressResolutionService } from "./address-resolution.service";

/**
 * Compatibility adapter for engine.ports AddressResolver — does not replace map/mobile paths.
 */
@Injectable()
export class AddressResolverAdapter implements AddressResolver {
  constructor(private readonly resolution: AddressResolutionService) {}

  async normalize(address: string): Promise<string> {
    return normalizeAddressWhitespace(address);
  }

  async resolve(address: string): Promise<AddressResolveResult | null> {
    const result = await this.resolution.resolve({ roadAddress: address });
    const c = result.decision.candidate;
    if (!c) return null;
    return {
      normalizedAddress: result.parsed.normalizedAddress,
      latitude: c.latitude,
      longitude: c.longitude,
      confidence: c.confidence,
      provider: c.provider,
      providerPlaceId: c.providerPlaceId ?? null,
    };
  }

  async candidateSearch(address: string): Promise<AddressResolveResult[]> {
    const result = await this.resolution.resolve({ roadAddress: address });
    return result.decision.allCandidates.map((c) => ({
      normalizedAddress: result.parsed.normalizedAddress,
      latitude: c.latitude,
      longitude: c.longitude,
      confidence: c.confidence,
      provider: c.provider,
      providerPlaceId: c.providerPlaceId ?? null,
    }));
  }
}

export const ADDRESS_RESOLVER = Symbol("ADDRESS_RESOLVER");
