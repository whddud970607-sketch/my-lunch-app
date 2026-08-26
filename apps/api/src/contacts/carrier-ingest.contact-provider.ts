import { Injectable } from "@nestjs/common";
import type { ContactChannel, ContactProvider } from "./contact-provider";

/**
 * MVP: ingest carrier/company-provided masked or virtual numbers only.
 * Does not issue Delivery Shield numbers or call telco APIs.
 */
@Injectable()
export class CarrierIngestContactProvider implements ContactProvider {
  readonly providerId = "carrier_ingest";

  async resolveContact(input: {
    pointId: string;
    existing?: ContactChannel | null;
    carrierSafeNumber?: string | null;
    providerReference?: string | null;
    expiresAt?: string | null;
  }): Promise<ContactChannel> {
    if (input.existing?.contactValue) {
      return input.existing;
    }

    const value = input.carrierSafeNumber?.trim() || null;
    if (!value) {
      return {
        contactType: "none",
        contactValue: null,
        contactExpiresAt: null,
        contactProvider: null,
        providerReference: null,
      };
    }

    return {
      contactType: "masked_number",
      contactValue: value,
      contactExpiresAt: input.expiresAt ?? null,
      contactProvider: this.providerId,
      providerReference: input.providerReference ?? null,
    };
  }
}
