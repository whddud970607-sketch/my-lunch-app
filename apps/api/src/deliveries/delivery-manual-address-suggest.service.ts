import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AddressResolutionService } from "../address/address-resolution.service";

export type ManualAddressCandidate = {
  roadAddress: string | null;
  jibunAddress: string | null;
  buildingName: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ManualAddressSuggestResponse = {
  results: ManualAddressCandidate[];
};

const WHITESPACE = /\s+/g;
const MIN_QUERY_LEN = 2;

export function normalizeManualAddressQuery(raw: string): string {
  return raw.trim().replace(WHITESPACE, " ");
}

/**
 * Public Kakao address typeahead for NEW manual registration.
 * Separate from GET /delivery/today/search (existing assigned Points).
 * Never logs the query or address values.
 */
@Injectable()
export class DeliveryManualAddressSuggestService {
  private readonly logger = new Logger(DeliveryManualAddressSuggestService.name);

  constructor(private readonly address: AddressResolutionService) {}

  async suggest(rawQuery: string): Promise<ManualAddressSuggestResponse> {
    const query = normalizeManualAddressQuery(rawQuery ?? "");
    if (query.length < MIN_QUERY_LEN) {
      throw new BadRequestException("query too short");
    }
    if (!this.address.isKakaoConfigured()) {
      throw new ServiceUnavailableException("address_search_unavailable");
    }

    try {
      const docs = await this.address.searchAddressDocuments(query);
      return {
        results: docs.map((d) => ({
          roadAddress: d.roadAddress,
          jibunAddress: d.jibunAddress,
          buildingName: d.buildingName,
          latitude: d.latitude,
          longitude: d.longitude,
        })),
      };
    } catch {
      this.logger.warn("manual_address_suggest_provider_failed");
      throw new ServiceUnavailableException("address_search_failed");
    }
  }
}
